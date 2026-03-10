import {
  hoursToDays,
  hoursToDaysRounded,
  isLikelyHours,
  toIsoDate,
} from './utils';

describe('utils', () => {
  it('converts hours to days with 4 decimals', () => {
    expect(hoursToDays(8)).toBe(1);
    expect(hoursToDays(6)).toBe(0.75);
    expect(hoursToDays(1)).toBe(0.125);
  });

  it('returns 0 for invalid hours values', () => {
    expect(hoursToDays(undefined)).toBe(0);
    expect(hoursToDays(null)).toBe(0);
    expect(hoursToDays(Number.NaN)).toBe(0);
  });

  it('keeps compatibility between rounded and base conversion', () => {
    expect(hoursToDaysRounded(10)).toBe(hoursToDays(10));
    expect(hoursToDaysRounded(0)).toBe(0);
  });

  it('detects likely-hours heuristic', () => {
    expect(isLikelyHours(32)).toBeTrue();
    expect(isLikelyHours(31)).toBeFalse();
    expect(isLikelyHours(undefined)).toBeFalse();
  });

  it('formats date to ISO local date', () => {
    const date = new Date(2026, 1, 24, 15, 22, 11); // 2026-02-24 local
    expect(toIsoDate(date)).toBe('2026-02-24');
  });
});
