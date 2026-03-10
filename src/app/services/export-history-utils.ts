export interface ExportHistoryItem {
  filename: string;
  date: string;
  dataUrl?: string | null;
  filePath?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  source?: 'electron' | 'browser';
}

export function normalizeHistoryList(items: unknown): ExportHistoryItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((entry) => normalizeHistoryItem(entry)).slice(0, 50);
}

export function normalizeHistoryItem(input: unknown): ExportHistoryItem {
  const item = (input || {}) as ExportHistoryItem;
  const filenameRaw = (item?.filename || '').toString().trim();
  const dateRaw = (item?.date || '').toString().trim();
  const filePathRaw = (item?.filePath || '').toString().trim();
  const checksumRaw = (item?.checksum || '').toString().trim().toLowerCase();
  const sizeRaw = Number(item?.sizeBytes);
  const sourceRaw = (item?.source || '').toString().toLowerCase();

  const filename = filenameRaw || 'export.xlsx';
  const date = dateRaw || new Date().toISOString();
  const filePath = filePathRaw || null;
  const checksum = checksumRaw || null;
  const sizeBytes =
    Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.round(sizeRaw) : null;
  const source =
    sourceRaw === 'electron' || sourceRaw === 'browser'
      ? (sourceRaw as 'electron' | 'browser')
      : filePath
        ? 'electron'
        : 'browser';

  return {
    filename,
    date,
    filePath,
    sizeBytes,
    checksum,
    source,
  };
}
