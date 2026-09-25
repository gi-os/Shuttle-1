import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ORDERS_CSV, parseCSV, serializeCSV } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * Admin secret for the release endpoint: SHUTTLE_ADMIN_PASSWORD env var when set,
 * otherwise the shop password in DATABASE/Design/Details/Password.txt.
 * Returns '' (endpoint disabled) when neither is configured.
 */
function getAdminSecret(): string {
  if (process.env.SHUTTLE_ADMIN_PASSWORD) return process.env.SHUTTLE_ADMIN_PASSWORD;
  try {
    return fs.readFileSync(path.join(process.cwd(), 'DATABASE', 'Design', 'Details', 'Password.txt'), 'utf-8').trim();
  } catch {
    return '';
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * POST /api/orders/:id/release — approval hold release.
 * Orders are written with Status "Pending"; this flips a Pending order to "Released".
 * Auth: header `x-admin-password: <secret>` (or `Authorization: Bearer <secret>`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;

    const secret = getAdminSecret();
    const provided =
      request.headers.get('x-admin-password') ||
      (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

    if (!secret || !provided || !safeEqual(provided, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!fs.existsSync(ORDERS_CSV)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const rows = parseCSV(fs.readFileSync(ORDERS_CSV, 'utf-8'));
    const headerFields = rows[0] || [];
    const idCol = headerFields.indexOf('Order ID');
    const statusCol = headerFields.indexOf('Status');
    if (idCol === -1 || statusCol === -1) {
      return NextResponse.json({ error: 'orders.csv has no Status column' }, { status: 500 });
    }

    const fields = rows.slice(1).find(r => r[idCol] === orderId);
    if (fields) {
      const current = fields[statusCol] || 'Pending';
      if (current.toLowerCase() !== 'pending') {
        return NextResponse.json(
          { error: `Order is "${current}", only Pending orders can be released` },
          { status: 409 }
        );
      }

      while (fields.length <= statusCol) fields.push('');
      fields[statusCol] = 'Released';
      fs.writeFileSync(ORDERS_CSV, serializeCSV(rows), 'utf-8');

      return NextResponse.json({ success: true, orderId, status: 'Released' });
    }

    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  } catch (error) {
    console.error('Error releasing order:', error);
    return NextResponse.json({ error: 'Failed to release order' }, { status: 500 });
  }
}
