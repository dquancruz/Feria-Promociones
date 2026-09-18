import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from './text.js';

describe('normalizeSearchText', () => {
  it('strips accents and ignores case', () => {
    expect(normalizeSearchText('Diagnóstico')).toBe('diagnostico');
    expect(normalizeSearchText('NIÑO ÁÉÍÓÚ')).toBe('nino aeiou');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSearchText('  riego ')).toBe('riego');
  });

  it('leaves LIKE wildcards alone, since matching is a plain substring test', () => {
    expect(normalizeSearchText('50%_\\')).toBe('50%_\\');
  });
});
