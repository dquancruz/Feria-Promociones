import { describe, expect, it } from 'vitest';
import { productHint, serviceHint } from './discountHints';
import type { PreviewTotals } from './discountPreview';

function preview(overrides: Partial<PreviewTotals>): PreviewTotals {
  return {
    serviceDiscountPct: 0,
    productDiscountPct: 0,
    servicesSubtotalCents: 0,
    productsSubtotalCents: 0,
    servicesTotalCents: 0,
    productsTotalCents: 0,
    grandTotalCents: 0,
    servicesCount: 0,
    productsCount: 0,
    ...overrides,
  };
}

describe('serviceHint', () => {
  it('asks for two services when none is chosen', () => {
    expect(serviceHint(preview({}))).toBe('Elige 2 servicios para obtener 3%.');
  });

  it('asks for one more service when one is chosen', () => {
    expect(serviceHint(preview({ servicesCount: 1 }))).toBe('Agrega 1 servicio más para obtener 3%.');
  });

  it('says how much is missing to pass Q1,500, to the cent', () => {
    const hint = serviceHint(preview({ servicesCount: 2, serviceDiscountPct: 3, servicesSubtotalCents: 120_000 }));

    expect(hint).toBe('Te faltan Q300.01 en servicios para subir a 5%.');
  });

  it('needs one cent more when the subtotal is exactly Q1,500', () => {
    const hint = serviceHint(preview({ servicesCount: 2, serviceDiscountPct: 3, servicesSubtotalCents: 150_000 }));

    expect(hint).toBe('Te faltan Q0.01 en servicios para subir a 5%.');
  });

  it('congratulates the top tier', () => {
    expect(serviceHint(preview({ servicesCount: 2, serviceDiscountPct: 5 }))).toMatch(/máximo/);
  });
});

describe('productHint', () => {
  it.each([
    [0, 'Elige 3 productos para obtener 3%.'],
    [1, 'Agrega 2 productos más para obtener 3%.'],
    [2, 'Agrega 1 producto más para obtener 3%.'],
    [3, 'Agrega 2 productos más para obtener 5%.'],
    [4, 'Agrega 1 producto más para obtener 5%.'],
    [5, 'Ya tienes el descuento máximo en productos.'],
    [8, 'Ya tienes el descuento máximo en productos.'],
  ])('with %i products chosen', (productsCount, expected) => {
    expect(productHint(preview({ productsCount }))).toBe(expected);
  });
});
