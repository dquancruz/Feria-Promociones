import { describe, expect, it } from 'vitest';
import { formatDayChip, formatDayLong, formatEventRange } from './eventFormat';

describe('event date formatting', () => {
  it('formats a day as a short chip label, whatever the visitor timezone is', () => {
    expect(formatDayChip('2026-03-12')).toBe('jue 12 mar');
    expect(formatDayChip('2026-01-01')).toBe('jue 1 ene');
  });

  it('formats a day in long form', () => {
    expect(formatDayLong('2026-03-12')).toBe('jueves 12 de marzo');
  });

  it('collapses a range inside one month', () => {
    const days = [{ date: '2026-03-12' }, { date: '2026-03-13' }, { date: '2026-03-14' }];
    expect(formatEventRange(days)).toBe('jue 12 – sáb 14 mar');
  });

  it('spells out both months when the range crosses a month boundary', () => {
    const days = [{ date: '2026-03-31' }, { date: '2026-04-02' }];
    expect(formatEventRange(days)).toBe('mar 31 mar – jue 2 abr');
  });

  it('handles a single day and no days', () => {
    expect(formatEventRange([{ date: '2026-03-12' }])).toBe('jue 12 mar');
    expect(formatEventRange([])).toBe('');
  });
});
