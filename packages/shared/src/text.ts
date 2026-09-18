// Lowercases and strips diacritics so "Diagnóstico" and "diagnostico" compare equal.
// Shared so the API and the client's instant search agree on what counts as a match.
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
