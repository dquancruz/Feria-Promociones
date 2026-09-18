import { describe, expect, it } from 'vitest';
import { availableSlots } from './slots';

const day = { date: '2026-03-12', opensAt: '09:00', closesAt: '11:00' };

describe('availableSlots', () => {
  it('offers every slot of a future day', () => {
    const now = new Date('2026-03-01T12:00:00.000Z');

    expect(availableSlots(day, 30, now)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('leaves out slots that already started when the day is today', () => {
    // 15:30 UTC is 09:30 in Guatemala: 09:00 and 09:30 are gone, 10:00 onwards remain.
    const now = new Date('2026-03-12T15:30:00.000Z');

    expect(availableSlots(day, 30, now)).toEqual(['10:00', '10:30']);
  });

  it('offers nothing once the day is over', () => {
    const now = new Date('2026-03-12T18:00:00.000Z');

    expect(availableSlots(day, 30, now)).toEqual([]);
  });
});
