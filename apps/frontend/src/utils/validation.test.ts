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
  it('accepts a form with no service or product selected', () => {
    expect(validateAll(valid)).toEqual({});
  });

  it('reports every missing field, in screen order', () => {
    const errors = validateAll({ nombre: ' ', apellidos: '', email: '', date: '', time: '' });

    expect(Object.keys(errors)).toEqual(['nombre', 'apellidos', 'email', 'attendAt']);
  });
});

describe('validateField', () => {
  it.each(['carla', 'carla@', 'carla@gmail', 'car la@x.com', '@x.com'])('rejects the email %s', (email) => {
    expect(validateField('email', { ...valid, email })).toBe('Email inválido');
  });

  it('accepts an email with surrounding spaces', () => {
    expect(validateField('email', { ...valid, email: ' ana@example.com ' })).toBeUndefined();
  });

  it('needs both a day and a time', () => {
    expect(validateField('attendAt', { ...valid, time: '' })).toBeDefined();
    expect(validateField('attendAt', { ...valid, date: '' })).toBeDefined();
  });

});
