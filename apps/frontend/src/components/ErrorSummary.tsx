import type { FormField } from '../utils/validation';

interface ErrorSummaryProps {
  errors: { field: FormField; message: string }[];
  onSelect: (field: FormField) => void;
}

/** Announced to screen readers when a confirm attempt is blocked; each entry jumps to its field. */
export function ErrorSummary({ errors, onSelect }: ErrorSummaryProps) {
  if (errors.length === 0) return null;

  return (
    <div className="error-summary" role="alert">
      <p>{errors.length === 1 ? 'Revisa este campo antes de confirmar:' : `Revisa estos ${errors.length} campos antes de confirmar:`}</p>
      <ul>
        {errors.map(({ field, message }) => (
          <li key={field}>
            <button type="button" className="link-button" onClick={() => onSelect(field)}>
              {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
