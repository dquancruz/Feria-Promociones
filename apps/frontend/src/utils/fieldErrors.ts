import type { FieldErrors } from '../api/client';

/** The backend reports field errors as either a single string (confirm-time
 * validation) or a string array (zod's flattened shape) — normalize to one message. */
export function fieldErrorMessage(errors: FieldErrors, field: string): string | undefined {
  const entry = errors[field];
  return Array.isArray(entry) ? entry[0] : entry;
}
