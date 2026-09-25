import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { deductStock, getStockMap } from '@/lib/inventory';
import { getProduct } from '@/lib/catalog';
import { getBrandList, getDataRequired, getShopType } from '@/lib/presets';
import { ORDERS_DIR, parseCSV, resolvePendingUpload, serializeCSV } from '@/lib/orders';

interface OrderItem {
  productId: string;
  productName: string;
  sku: string;
  boxCost: number;
  unitsPerBox: number;
  quantity: number;
  attachment?: { uploadId: string; filename: string };
}

interface OrderData {
  name: string;
  email: string;
  phone: string;
  company: string;
  shippingAddress: string;
  freightOption: string;
  freightCompany: string;
  freightAccount: string;
  freightContact: string;
  orderNotes: string;
  items: OrderItem[];
  total: number;
  // STS-2.00 new fields
  shopType?: string;
  poNumber?: string;
  hotelSelection?: string;
  // Extended checkout fields (DataRequired brand / billing_address / need_by_date / budget / artwork_link)
  brand?: string;
  billingAddress?: string;
  needByDate?: string;
  estimatedBudget?: string;
  artworkLink?: string;
}

// Extended columns are appended after Tracking Number so positional readers of the older layout keep working
const EXTENDED_COLUMNS = ['Brand', 'Billing Address', 'Need By Date', 'Estimated Budget', 'Artwork Link', 'Attachments'];

const CSV_HEADER = 'Order ID,Date,Customer Name,Email,Phone,Company,Shipping Address,Freight Option,Freight Company,Freight Account,Freight Contact,Order Notes,Items,Total,Shop Type,PO Number,PO File,Hotel Selection,Status,Tracking Number,' + EXTENDED_COLUMNS.join(',');

function generateOrderId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `ORD-${timestamp}-${random}`;
}

function escapeCSVField(field: string): string {
  if (!field) return '';
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Ensures the orders.csv file exists with the correct STS-2.00 header.
 * If the file already exists with the old header, it migrates by prepending the new header
 * and appending empty columns to existing rows.
 */
function ensureCSVHeader(ordersPath: string): void {
  const ordersDir = path.dirname(ordersPath);
  if (!fs.existsSync(ordersDir)) {
    fs.mkdirSync(ordersDir, { recursive: true });
  }

  if (!fs.existsSync(ordersPath)) {
    // Fresh file — write new header
    fs.writeFileSync(ordersPath, CSV_HEADER + '\n', 'utf-8');
    return;
  }

  const content = fs.readFileSync(ordersPath, 'utf-8');
  const firstLine = content.split('\n')[0] || '';

  // If header already has the extended columns, nothing to do
  if (firstLine.includes('Status') && firstLine.includes('Artwork Link')) {
    return;
  }

  // Parse the whole file — quoted fields (shipping addresses) span several physical lines
  const headerColumns = CSV_HEADER.split(',');
  const rows = parseCSV(content);
  const migrated: string[][] = [headerColumns];

  for (const row of rows.slice(1)) {
    if (firstLine.includes('Status')) {
      // Has Status/Tracking Number but missing extended columns — padded below
    } else if (firstLine.includes('Shop Type')) {
      // Has Shop Type columns but missing Status/Tracking Number
      row.push('Pending', '');
    } else {
      // Old format — append Shop Type + PO + Hotel + Status + Tracking
      row.push('free', '', '', '', 'Pending', '');
    }
    while (row.length < headerColumns.length) row.push('');
    migrated.push(row);
  }

  fs.writeFileSync(ordersPath, serializeCSV(migrated), 'utf-8');
}

export async function POST(request: NextRequest) {
  try {
    const orderData: OrderData = await request.json();

    // Validate required fields — name and email are always required
    if (!orderData.name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    if (!orderData.email) {
      return NextResponse.json(
        { error: 'Missing required field: email' },
        { status: 400 }
      );
    }

    if (!orderData.items || orderData.items.length === 0) {
      return NextResponse.json(
        { error: 'No items in order' },
        { status: 400 }
      );
    }

    // PO shops: the PO number is always required (the PO document may come from a PO Upload product instead)
    const shopType = getShopType();
    const poNumber = (orderData.poNumber || '').trim();
    if (shopType === 'po' && !poNumber) {
      return NextResponse.json(
        { error: 'Missing required field: poNumber' },
        { status: 400 }
      );
    }

    // Upload-required products must carry a staged, valid PDF
    const attachmentPaths = new Map<string, string>();
    for (const item of orderData.items) {
      const product = getProduct(item.productId);
      if (!product?.uploadRequired) continue;
      const stagedPath = resolvePendingUpload(item.attachment?.uploadId);
      if (!stagedPath) {
        return NextResponse.json(
          { error: `${item.productName} requires an attached PDF. Please re-attach it on the product page.` },
          { status: 400 }
        );
      }
      attachmentPaths.set(item.productId, stagedPath);
    }

    // Extended checkout fields
    const dataRequired = getDataRequired();
    const brand = dataRequired.brand ? (orderData.brand || '').trim() : '';
    const brandList = getBrandList();
    if (dataRequired.brand && (!brand || (brandList.length > 0 && !brandList.includes(brand)))) {
      return NextResponse.json({ error: 'Please select a valid brand' }, { status: 400 });
    }
    const needByDate = dataRequired.need_by_date ? (orderData.needByDate || '').trim() : '';
    if (needByDate && !/^\d{4}-\d{2}-\d{2}$/.test(needByDate)) {
      return NextResponse.json({ error: 'Need-by date must be YYYY-MM-DD' }, { status: 400 });
    }
    const artworkLink = dataRequired.artwork_link ? (orderData.artworkLink || '').trim() : '';
    if (artworkLink) {
      let valid = false;
      try {
        const url = new URL(artworkLink);
        valid = url.protocol === 'https:' || url.protocol === 'http:';
      } catch { /* invalid */ }
      if (!valid) {
        return NextResponse.json({ error: 'Artwork link must be an http(s) URL' }, { status: 400 });
      }
    }
    const billingAddress = dataRequired.billing_address ? (orderData.billingAddress || '').trim() : '';
    const estimatedBudget = dataRequired.budget ? (orderData.estimatedBudget || '').trim() : '';

    // Re-validate inventory at checkout time to prevent overselling
    const stockMap = getStockMap();
    const outOfStockItems: { productName: string; requested: number; available: number }[] = [];

    for (const item of orderData.items) {
      const currentStock = stockMap.get(item.productId);
      if (currentStock !== undefined && currentStock < item.quantity) {
        outOfStockItems.push({
          productName: item.productName,
          requested: item.quantity,
          available: Math.max(0, currentStock),
        });
      }
    }

    if (outOfStockItems.length > 0) {
      return NextResponse.json(
        {
          error: 'Some items in your cart are no longer available in the requested quantity. Please update your cart and try again.',
          outOfStockItems,
        },
        { status: 409 }
      );
    }

    const orderId = generateOrderId();
    const orderDate = new Date().toISOString();

    // Move staged product PDFs into Orders/ — first one is <OrderID>.pdf so Launchpad's PO lookup finds it
    const attachmentFiles: string[] = [];
    const storedItems = orderData.items.map(item => {
      const stagedPath = attachmentPaths.get(item.productId);
      if (!stagedPath) {
        const { attachment: _ignored, ...rest } = item;
        return rest;
      }
      const storedAs = attachmentFiles.length === 0 ? `${orderId}.pdf` : `${orderId}-${attachmentFiles.length + 1}.pdf`;
      fs.renameSync(stagedPath, path.join(ORDERS_DIR, storedAs));
      attachmentFiles.push(storedAs);
      return { ...item, attachment: { filename: item.attachment!.filename, storedAs } };
    });

    // Format items as JSON string for CSV
    const itemsJson = JSON.stringify(storedItems);

    // Prepare freight info
    const freightInfo = orderData.freightOption === 'own'
      ? `Own: ${orderData.freightCompany} (${orderData.freightAccount}) - ${orderData.freightContact}`
      : orderData.freightOption ? 'LR Paris' : '';

    // Determine PO file reference (extension stored after upload completes)
    const poFileRef = attachmentFiles.length > 0
      ? attachmentFiles[0]
      : shopType === 'po' && poNumber ? `${orderId} (see Orders folder)` : '';
    const hotelSelection = orderData.hotelSelection || '';

    // Create CSV row with new columns
    const csvRow = [
      escapeCSVField(orderId),
      escapeCSVField(orderDate),
      escapeCSVField(orderData.name),
      escapeCSVField(orderData.email || ''),
      escapeCSVField(orderData.phone || ''),
      escapeCSVField(orderData.company || ''),
      escapeCSVField(orderData.shippingAddress || ''),
      escapeCSVField(freightInfo),
      escapeCSVField(orderData.freightCompany || ''),
      escapeCSVField(orderData.freightAccount || ''),
      escapeCSVField(orderData.freightContact || ''),
      escapeCSVField(orderData.orderNotes || ''),
      escapeCSVField(itemsJson),
      escapeCSVField(orderData.total.toFixed(2)),
      escapeCSVField(shopType),
      escapeCSVField(poNumber),
      escapeCSVField(poFileRef),
      escapeCSVField(hotelSelection),
      'Pending',
      '',
      escapeCSVField(brand),
      escapeCSVField(billingAddress),
      escapeCSVField(needByDate),
      escapeCSVField(estimatedBudget),
      escapeCSVField(artworkLink),
      escapeCSVField(attachmentFiles.join('; ')),
    ].join(',');

    // Append to orders.csv
    const ordersPath = path.join(process.cwd(), 'DATABASE', 'Orders', 'orders.csv');

    // Ensure header is up to date (handles migration from old format)
    ensureCSVHeader(ordersPath);

    // Append the order
    fs.appendFileSync(ordersPath, csvRow + '\n', 'utf-8');

    // Deduct stock from inventory (non-blocking — order succeeds regardless)
    try {
      deductStock(orderData.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })));
    } catch (e) {
      console.warn('Stock deduction failed (non-blocking):', e);
    }

    // Fire-and-forget: notify Launchpad for email notifications
    const launchpadUrl = process.env.LAUNCHPAD_API_URL;
    const shopSlug = process.env.SHOP_SLUG;
    if (launchpadUrl && shopSlug) {
      fetch(`${launchpadUrl}/api/shops/${shopSlug}/orders/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderData: {
            orderId,
            date: orderDate,
            ...orderData,
            items: storedItems,
            shopType,
            poNumber,
            poFile: poFileRef,
            brand,
            billingAddress,
            needByDate,
            estimatedBudget,
            artworkLink,
            attachments: attachmentFiles,
            // Launchpad's email template renders the "Order Notes" key; fold the extended fields in so they reach the email
            'Order Notes': [
              brand && `Brand: ${brand}`,
              poNumber && `PO Number: ${poNumber}`,
              needByDate && `Need-by date: ${needByDate}`,
              estimatedBudget && `Estimated budget: ${estimatedBudget}`,
              artworkLink && `Artwork link: ${artworkLink}`,
              billingAddress && `Billing address: ${billingAddress.replace(/\n/g, ', ')}`,
              orderData.orderNotes && `Notes: ${orderData.orderNotes}`,
            ].filter(Boolean).join('\n'),
          },
        }),
      }).catch(err => console.warn('Launchpad notify failed (non-blocking):', err));
    }

    return NextResponse.json({
      success: true,
      orderId,
      poFile: attachmentFiles[0] || null,
      message: 'Order submitted successfully',
    });
  } catch (error) {
    console.error('Error processing order:', error);
    return NextResponse.json(
      { error: 'Failed to process order' },
      { status: 500 }
    );
  }
}
