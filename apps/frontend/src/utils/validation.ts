import type { InfoPanelValues } from '../components/InfoPanel';

export type FormField = 'nombre' | 'apellidos' | 'email' | 'attendAt' | 'selectedItemIds';

// The order the fields appear on screen, which is also where focus goes first.
export const FORM_FIELD_ORDER: FormField[] = ['nombre', 'apellidos', 'email', 'attendAt', 'selectedItemIds'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same wording as the API's confirm-time validation, so an error reads the same whether it
// came from here or from the server.
export function validateField(
  field: FormField,
  values: InfoPanelValues,
  selectedCount: number,
): string | undefined {
  switch (field) {
    case 'nombre':
      return values.nombre.trim() ? undefined : 'Nombre es requerido';
    case 'apellidos':
      return values.apellidos.trim() ? undefined : 'Apellidos son requeridos';
    case 'email':
      return EMAIL_PATTERN.test(values.email.trim()) ? undefined : 'Email inválido';
    case 'attendAt':
      return values.date && values.time ? undefined : 'Elige un día y una hora.';
    case 'selectedItemIds':
      return selectedCount > 0 ? undefined : 'Selecciona al menos un servicio o producto';
  }
}

export function validateAll(values: InfoPanelValues, selectedCount: number): Partial<Record<FormField, string>> {
  const errors: Partial<Record<FormField, string>> = {};
  for (const field of FORM_FIELD_ORDER) {
    const message = validateField(field, values, selectedCount);
    if (message) errors[field] = message;
  }
  return errors;
}
