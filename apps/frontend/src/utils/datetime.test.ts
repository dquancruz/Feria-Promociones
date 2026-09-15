import { describe, expect, it } from 'vitest';
import { combineDateAndTime, splitIsoDateTime } from './datetime';

describe('combineDateAndTime', () => {
  it('returns null when the date is missing', () => {
    expect(combineDateAndTime('', '10:30')).toBeNull();
  });

  it('returns null when the time is missing', () => {
    expect(combineDateAndTime('2026-03-05', '')).toBeNull();
  });

  it('combines a local date and time into a valid ISO 8601 string', () => {
    const iso = combineDateAndTime('2026-03-05', '10:30');
    expect(iso).not.toBeNull();
    expect(new Date(iso as string).toISOString()).toBe(iso);
  });
});

describe('splitIsoDateTime', () => {
  it('returns empty date and time when given null', () => {
    expect(splitIsoDateTime(null)).toEqual({ date: '', time: '' });
  });

  it('round-trips a value produced by combineDateAndTime', () => {
    const iso = combineDateAndTime('2026-03-05', '10:30');
    expect(splitIsoDateTime(iso)).toEqual({ date: '2026-03-05', time: '10:30' });
  });
});
