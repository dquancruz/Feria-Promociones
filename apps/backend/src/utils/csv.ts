// Cells starting with one of these characters are read as formulas by Excel and Sheets.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

const UTF8_BOM = String.fromCharCode(0xfeff);

function escapeCsvField(value: string): string {
  const safe = FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// The BOM makes Excel read the file as UTF-8, so accents survive a double-click open.
export function toCsv(headers: string[], rows: string[][]): string {
  return UTF8_BOM + [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}
