function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Combines separate <input type="date"> and <input type="time"> values (local time)
 * into the UTC ISO 8601 string the backend's zod schema expects. */
export function combineDateAndTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const local = new Date(`${date}T${time}`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** Splits an ISO 8601 string back into local <input type="date"> / <input type="time">
 * values for editing. */
export function splitIsoDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const date = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  const time = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  return { date, time };
}

/** Today's local date as a <input type="date"> value, for use as its `min` bound. */
export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
