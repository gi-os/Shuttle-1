import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MAX_PDF_BYTES, PENDING_UPLOADS_DIR, isPdfBuffer } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * Stage a PDF attached on the product page of an upload-required product.
 * Returns an uploadId the cart keeps; POST /api/orders moves the file into Orders/ on checkout.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (path.extname(file.name).toLowerCase() !== '.pdf') {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    if (file.size === 0 || file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF must be between 1 byte and 10 MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isPdfBuffer(buffer)) {
      return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 });
    }

    if (!fs.existsSync(PENDING_UPLOADS_DIR)) {
      fs.mkdirSync(PENDING_UPLOADS_DIR, { recursive: true });
    }

    const uploadId = crypto.randomUUID();
    fs.writeFileSync(path.join(PENDING_UPLOADS_DIR, `${uploadId}.pdf`), buffer);

    // Display name only — never used as a path
    const filename = path.basename(file.name).replace(/[^\w.\- ()]/g, '_').slice(0, 120);

    return NextResponse.json({ success: true, uploadId, filename });
  } catch (error) {
    console.error('Error staging product PDF:', error);
    return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 });
  }
}
