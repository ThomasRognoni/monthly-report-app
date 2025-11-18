export function formatExcelDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getMonthYearItalian(date: Date): string {
  const months = [
    'GENNAIO',
    'FEBBRAIO',
    'MARZO',
    'APRILE',
    'MAGGIO',
    'GIUGNO',
    'LUGLIO',
    'AGOSTO',
    'SETTEMBRE',
    'OTTOBRE',
    'NOVEMBRE',
    'DICEMBRE',
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function hoursToDays(hours: number | undefined | null): number {
  if (typeof hours !== 'number' || !isFinite(hours)) return 0;
  return roundTo2(hours / 8);
}

export function isLikelyHours(value: number | undefined | null): boolean {
  if (typeof value !== 'number' || !isFinite(value)) return false;
  return value > 31;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default {};
