import { normalizeHistoryItem, normalizeHistoryList } from './export-history-utils';

describe('export-history-utils', () => {
  it('drops legacy dataUrl payload while preserving useful metadata', () => {
    const item = normalizeHistoryItem({
      filename: 'legacy.xlsx',
      date: '2026-02-24T10:00:00.000Z',
      dataUrl: 'data:application/octet-stream;base64,AAA',
      sizeBytes: '2048',
      checksum: 'ABCDEF',
    });

    expect(item.filename).toBe('legacy.xlsx');
    expect(item.date).toBe('2026-02-24T10:00:00.000Z');
    expect(item.sizeBytes).toBe(2048);
    expect(item.checksum).toBe('abcdef');
    expect((item as any).dataUrl).toBeUndefined();
  });

  it('normalizes list and enforces max 50 entries', () => {
    const items = Array.from({ length: 55 }).map((_, index) => ({
      filename: `file-${index}.xlsx`,
      date: `2026-02-24T10:${index.toString().padStart(2, '0')}:00.000Z`,
      sizeBytes: 1000 + index,
      source: index % 2 === 0 ? 'browser' : 'electron',
    }));

    const normalized = normalizeHistoryList(items);
    expect(normalized.length).toBe(50);
    expect(normalized[0].filename).toBe('file-0.xlsx');
    expect(normalized[49].filename).toBe('file-49.xlsx');
  });
});
