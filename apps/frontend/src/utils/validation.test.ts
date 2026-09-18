import { describe, expect, it } from 'vitest';
import type { InfoPanelValues } from '../components/InfoPanel';
import { validateAll, validateField } from './validation';

const valid: InfoPanelValues = {
  nombre: 'Ana',
  apellidos: 'Lopez',
  email: 'ana@example.com',
  date: '2026-03-12',
  time: '09:00',
};

describe('validateAll', () => {
  it('accepts a complete form', () => {
    expect(validateAll(valid, 1)).toEqual({});
  });

  it('reports every missing field, in screen order', () => {
    const errors = validateAll({ nombre: ' ', apellidos: '', email: '', date: '', time: '' }, 0);

    expect(Object.keys(errors)).toEqual(['nombre', 'apellidos', 'email', 'attendAt', 'selectedItemIds']);
  });
});

describe('validateField', () => {
  it.each(['carla', 'carla@', 'carla@gmail', 'car la@x.com', '@x.com'])('rejects the email %s', (email) => {
    expect(validateField('email', { ...valid, email }, 1)).toBe('Email inválido');
  });

  it('accepts an email with surrounding spaces', () => {
    expect(validateField('email', { ...valid, email: ' ana@example.com ' }, 1)).toBeUndefined();
  });

  it('needs both a day and a time', () => {
    expect(validateField('attendAt', { ...valid, time: '' }, 1)).toBeDefined();
    expect(validateField('attendAt', { ...valid, date: '' }, 1)).toBeDefined();
  });

  it('needs at least one selected item', () => {
    expect(validateField('selectedItemIds', valid, 0)).toBe('Selecciona al menos un servicio o producto');
  });
});
