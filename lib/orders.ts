import fs from 'fs';
import path from 'path';

export const ORDERS_DIR = path.join(process.cwd(), 'DATABASE', 'Orders');
export const ORDERS_CSV = path.join(ORDERS_DIR, 'orders.csv');

// Product-page uploads (Details/UploadRequired.txt) are staged here until the order is placed,
// then moved next to orders.csv as <OrderID>.pdf so Launchpad's PO-file lookup finds them.
export const PENDING_UPLOADS_DIR = path.join(ORDERS_DIR, '.pending-uploads');

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

const UPLOAD_ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Resolve a staged upload id to its file path, or null if the id is malformed or the file is gone. */
export function resolvePendingUpload(uploadId: unknown): string | null {
  if (typeof uploadId !== 'string' || !UPLOAD_ID_RE.test(uploadId)) return null;
  const filePath = path.join(PENDING_UPLOADS_DIR, `${uploadId}.pdf`);
  return fs.existsSync(filePath) ? filePath : null;
}

/** True when the buffer starts with the PDF magic bytes. */
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Parse a whole CSV document into rows. Unlike a line-by-line split this keeps quoted
 * fields that contain newlines (e.g. multi-line shipping addresses) inside their row.
 */
export function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"' && content[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(current);
      current = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(current);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export function serializeCSV(rows: string[][]): string {
  return rows.map(r => r.map(escapeCSVField).join(',')).join('\n') + '\n';
}

export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function escapeCSVField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
