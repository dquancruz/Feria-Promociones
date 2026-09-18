import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSlots,
  eventSettingsInputSchema,
  isWithinEvent,
  splitAttendAt,
  toAttendAtIso,
  todayInEventTimezone,
} from './event.js';

const settings = {
  slotMinutes: 30,
  days: [
    { date: '2026-11-12', opensAt: '09:00', closesAt: '18:00' },
    { date: '2026-11-13', opensAt: '09:15', closesAt: '12:15' },
  ],
};

describe('toAttendAtIso / splitAttendAt', () => {
  it('converts Guatemala wall-clock time to UTC (UTC-6)', () => {
    expect(toAttendAtIso('2026-11-12', '09:00')).toBe('2026-11-12T15:00:00.000Z');
  });

  it('rolls over to the next UTC day when the Guatemala evening is already tomorrow in UTC', () => {
    expect(toAttendAtIso('2026-11-12', '23:30')).toBe('2026-11-13T05:30:00.000Z');
    expect(splitAttendAt('2026-11-13T05:30:00.000Z')).toEqual({ day: '2026-11-12', time: '23:30' });
  });

  it('reads the Guatemala day, not the UTC day, just after UTC midnight', () => {
    expect(splitAttendAt('2026-11-13T00:00:00.000Z')).toEqual({ day: '2026-11-12', time: '18:00' });
  });

  it('round-trips across a month and year boundary', () => {
    const iso = toAttendAtIso('2026-12-31', '20:45');
    expect(iso).toBe('2027-01-01T02:45:00.000Z');
    expect(splitAttendAt(iso)).toEqual({ day: '2026-12-31', time: '20:45' });
  });

  it('rejects an invalid date', () => {
    expect(() => splitAttendAt('nope')).toThrow(RangeError);
  });
});

describe('todayInEventTimezone', () => {
  it('is still yesterday in Guatemala at 05:59 UTC and switches at 06:00 UTC', () => {
    expect(todayInEventTimezone(new Date('2026-11-13T05:59:00.000Z'))).toBe('2026-11-12');
    expect(todayInEventTimezone(new Date('2026-11-13T06:00:00.000Z'))).toBe('2026-11-13');
  });
});

describe('addDays', () => {
  it('moves across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('buildSlots', () => {
  it('starts at opening time and never includes the closing time', () => {
    const slots = buildSlots({ opensAt: '09:00', closesAt: '11:00' }, 30);
    expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('counts slots from an opening time that is not on the hour', () => {
    expect(buildSlots({ opensAt: '09:15', closesAt: '10:15' }, 15)).toEqual(['09:15', '09:30', '09:45', '10:00']);
  });

  it('supports hourly slots', () => {
    expect(buildSlots({ opensAt: '09:00', closesAt: '18:00' }, 60)).toHaveLength(9);
  });
});

describe('isWithinEvent', () => {
  it('accepts the opening slot and the last slot before closing', () => {
    expect(isWithinEvent(toAttendAtIso('2026-11-12', '09:00'), settings)).toBe(true);
    expect(isWithinEvent(toAttendAtIso('2026-11-12', '17:30'), settings)).toBe(true);
  });

  it('rejects the moment of closing and anything before opening', () => {
    expect(isWithinEvent(toAttendAtIso('2026-11-12', '18:00'), settings)).toBe(false);
    expect(isWithinEvent(toAttendAtIso('2026-11-12', '08:30'), settings)).toBe(false);
  });

  it('rejects a day that is not configured', () => {
    expect(isWithinEvent(toAttendAtIso('2026-11-14', '10:00'), settings)).toBe(false);
    expect(isWithinEvent('2099-01-01T15:00:00.000Z', settings)).toBe(false);
  });

  it('rejects a time that is not on a slot boundary', () => {
    expect(isWithinEvent(toAttendAtIso('2026-11-12', '09:10'), settings)).toBe(false);
    expect(isWithinEvent('2026-11-12T15:00:30.000Z', settings)).toBe(false);
  });

  it('aligns slots to that day\'s own opening time', () => {
    expect(isWithinEvent(toAttendAtIso('2026-11-13', '09:15'), settings)).toBe(true);
    expect(isWithinEvent(toAttendAtIso('2026-11-13', '09:30'), settings)).toBe(false);
  });

  it('evaluates in Guatemala time, so 3:00 a.m. is out of hours even if it is 09:00 UTC', () => {
    expect(isWithinEvent('2026-11-12T09:00:00.000Z', settings)).toBe(false);
  });

  it('rejects an unparseable date instead of throwing', () => {
    expect(isWithinEvent('mañana', settings)).toBe(false);
  });
});

describe('eventSettingsInputSchema', () => {
  const valid = {
    name: 'Feria de Promociones',
    location: 'Ciudad de Guatemala',
    slotMinutes: 30,
    registrationOpen: true,
    days: [{ date: '2026-11-12', opensAt: '09:00', closesAt: '18:00' }],
  };

  it('accepts a valid configuration', () => {
    expect(eventSettingsInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects repeated days', () => {
    const result = eventSettingsInputSchema.safeParse({ ...valid, days: [valid.days[0], valid.days[0]] });
    expect(result.success).toBe(false);
  });

  it('rejects a day that closes before or when it opens', () => {
    for (const closesAt of ['09:00', '08:00']) {
      const days = [{ date: '2026-11-12', opensAt: '09:00', closesAt }];
      expect(eventSettingsInputSchema.safeParse({ ...valid, days }).success).toBe(false);
    }
  });

  it('rejects impossible dates, malformed times and unsupported slot lengths', () => {
    expect(
      eventSettingsInputSchema.safeParse({ ...valid, days: [{ ...valid.days[0], date: '2026-02-30' }] }).success,
    ).toBe(false);
    expect(
      eventSettingsInputSchema.safeParse({ ...valid, days: [{ ...valid.days[0], opensAt: '9:00' }] }).success,
    ).toBe(false);
    expect(eventSettingsInputSchema.safeParse({ ...valid, slotMinutes: 20 }).success).toBe(false);
  });

  it('requires a name', () => {
    expect(eventSettingsInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });
});
