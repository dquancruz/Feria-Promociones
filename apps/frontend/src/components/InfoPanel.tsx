import type { FieldErrors } from '../api/client';
import { fieldErrorMessage } from '../utils/fieldErrors';

export interface InfoPanelValues {
  nombre: string;
  apellidos: string;
  email: string;
  date: string;
  time: string;
}

interface InfoPanelProps {
  values: InfoPanelValues;
  onChange: <Field extends keyof InfoPanelValues>(field: Field, value: InfoPanelValues[Field]) => void;
  fieldErrors: FieldErrors;
}

export function InfoPanel({ values, onChange, fieldErrors }: InfoPanelProps) {
  const attendAtError = fieldErrorMessage(fieldErrors, 'attendAt');

  return (
    <section className="panel" aria-labelledby="info-panel-heading">
      <h2 id="info-panel-heading">1. Ingrese su información</h2>

      <div className="field">
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          type="text"
          value={values.nombre}
          onChange={(e) => onChange('nombre', e.target.value)}
          aria-invalid={Boolean(fieldErrorMessage(fieldErrors, 'nombre'))}
          aria-describedby={fieldErrorMessage(fieldErrors, 'nombre') ? 'nombre-error' : undefined}
          autoComplete="given-name"
        />
        {fieldErrorMessage(fieldErrors, 'nombre') && (
          <p className="field-error" id="nombre-error" role="alert">
            {fieldErrorMessage(fieldErrors, 'nombre')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="apellidos">Apellidos</label>
        <input
          id="apellidos"
          type="text"
          value={values.apellidos}
          onChange={(e) => onChange('apellidos', e.target.value)}
          aria-invalid={Boolean(fieldErrorMessage(fieldErrors, 'apellidos'))}
          aria-describedby={fieldErrorMessage(fieldErrors, 'apellidos') ? 'apellidos-error' : undefined}
          autoComplete="family-name"
        />
        {fieldErrorMessage(fieldErrors, 'apellidos') && (
          <p className="field-error" id="apellidos-error" role="alert">
            {fieldErrorMessage(fieldErrors, 'apellidos')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => onChange('email', e.target.value)}
          aria-invalid={Boolean(fieldErrorMessage(fieldErrors, 'email'))}
          aria-describedby={fieldErrorMessage(fieldErrors, 'email') ? 'email-error' : undefined}
          autoComplete="email"
        />
        {fieldErrorMessage(fieldErrors, 'email') && (
          <p className="field-error" id="email-error" role="alert">
            {fieldErrorMessage(fieldErrors, 'email')}
          </p>
        )}
      </div>

      <fieldset className="field">
        <legend>Fecha y hora</legend>
        <p className="field-hint">La feria se realiza del 12 al 14 de marzo, de 9:00 a.m. a 6:00 p.m.</p>
        <div className="field-row">
          <input
            id="attend-date"
            type="date"
            value={values.date}
            onChange={(e) => onChange('date', e.target.value)}
            aria-label="Fecha"
            aria-invalid={Boolean(attendAtError)}
          />
          <input
            id="attend-time"
            type="time"
            value={values.time}
            onChange={(e) => onChange('time', e.target.value)}
            aria-label="Hora"
            aria-invalid={Boolean(attendAtError)}
          />
        </div>
        {attendAtError && (
          <p className="field-error" role="alert">
            {attendAtError}
          </p>
        )}
      </fieldset>
    </section>
  );
}
