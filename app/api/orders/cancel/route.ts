import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { restoreStock } from '@/lib/inventory';
import { parseCSV, serializeCSV } from '@/lib/orders';

const ORDERS_CSV = path.join(process.cwd(), 'DATABASE', 'Orders', 'orders.csv');
const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    if (!fs.existsSync(ORDERS_CSV)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Parse the whole file: quoted fields (e.g. shipping addresses) can span several lines
    const rows = parseCSV(fs.readFileSync(ORDERS_CSV, 'utf-8'));
    const orderRowIndex = rows.findIndex((r, i) => i > 0 && r[0] === orderId);

    if (orderRowIndex === -1) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const fields = rows[orderRowIndex];
    const orderDate = new Date(fields[1]);
    const now = new Date();
    const elapsed = now.getTime() - orderDate.getTime();

    if (elapsed > CANCEL_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Cancellation window has expired. Orders can only be cancelled within 2 hours of placement.' },
        { status: 403 }
      );
    }

    // Parse items from CSV (column index 12)
    let items: { productId: string; quantity: number }[] = [];
    try {
      const itemsJson = fields[12];
      const parsed = JSON.parse(itemsJson);
      items = parsed.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));
    } catch {
      console.warn('Could not parse order items for stock restoration');
    }

    // Restore inventory
    if (items.length > 0) {
      try {
        restoreStock(items);
      } catch (e) {
        console.warn('Stock restoration failed (non-blocking):', e);
      }
    }

    // Remove the order row from CSV
    rows.splice(orderRowIndex, 1);
    fs.writeFileSync(ORDERS_CSV, serializeCSV(rows), 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully. Inventory has been restored.',
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
