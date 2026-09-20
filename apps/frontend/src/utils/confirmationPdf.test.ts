import { describe, expect, it, vi } from 'vitest';
import { CONFIRMED } from '../test/mocks';
import { confirmationFileName, confirmationShortCode, downloadConfirmationPdf } from './confirmationPdf';

// jsdom cannot trigger a download, so `save` is swapped for a capture of the file name and content.
const saved = vi.hoisted(() => ({ fileName: '', content: '' }));

vi.mock('jspdf', async (importOriginal) => {
  const original = await importOriginal<typeof import('jspdf')>();
  return {
    ...original,
    jsPDF: function (...args: ConstructorParameters<typeof original.jsPDF>) {
      const doc = new original.jsPDF(...args);
      doc.save = ((name?: string) => {
        saved.fileName = name ?? '';
        saved.content = doc.output();
        return doc;
      }) as typeof doc.save;
      return doc;
    },
  };
});

describe('confirmation file name', () => {
  it('uses the same short code the confirmation screen shows', () => {
    expect(confirmationShortCode(CONFIRMED)).toBe('ABCDEF12');
    expect(confirmationFileName(CONFIRMED)).toBe('confirmacion-ABCDEF12.pdf');
  });
});

describe('downloadConfirmationPdf', () => {
  async function generate(confirmation = CONFIRMED) {
    await downloadConfirmationPdf(confirmation, 'Feria de Promociones');
    return saved;
  }

  it('saves a PDF named after the confirmation code', async () => {
    const { content, fileName } = await generate();

    expect(fileName).toBe('confirmacion-ABCDEF12.pdf');
    expect(content.startsWith('%PDF-')).toBe(true);
  });

  it('writes who is coming, when, the items, the discounts and the value with discount', async () => {
    const { content } = await generate();

    for (const text of [
      'Ana Lopez',
      'ABCDEF12',
      'jueves 12 de marzo, 10:00',
      'Servicio 1',
      'Q1,000.00',
      'Producto 1',
      'Valor con descuento',
      'Q1,525.00',
      '2223-2425',
    ]) {
      expect(content).toContain(text);
    }
  });

  it('leaves out the visit line when the visit was never set', async () => {
    const { content } = await generate({ ...CONFIRMED, attendAt: null });

    expect(content).not.toContain('Visita:');
  });

  it('continues on a second page when there are too many items to fit', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      name: `Servicio ${i}`,
      type: 'service' as const,
      priceCents: 10_000,
    }));

    const { content } = await generate({ ...CONFIRMED, items: many });

    expect(content.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
