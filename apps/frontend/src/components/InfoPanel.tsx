import type { EventSettings } from '@feria/shared';
import { useMemo, useRef, type KeyboardEvent } from 'react';
import type { FieldErrors } from '../api/client';
import { formatDayChip } from '../utils/eventFormat';
import { fieldErrorMessage } from '../utils/fieldErrors';
import { availableSlots } from '../utils/slots';
import type { FormField } from '../utils/validation';

export interface InfoPanelValues {
  nombre: string;
  apellidos: string;
  email: string;
  /** A day of the event, "YYYY-MM-DD", Guatemala time. */
  date: string;
  /** A slot of that day, "HH:mm", Guatemala time. */
  time: string;
}

interface InfoPanelProps {
  values: InfoPanelValues;
  event: EventSettings;
  onChange: <Field extends keyof InfoPanelValues>(field: Field, value: InfoPanelValues[Field]) => void;
  onBlurField: (field: FormField) => void;
  fieldErrors: FieldErrors;
}

interface TextFieldProps {
  id: FormField;
  label: string;
  type?: string;
  value: string;
  autoComplete: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function TextField({ id, label, type = 'text', value, autoComplete, error, onChange, onBlur }: TextFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete={autoComplete}
      />
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function InfoPanel({ values, event, onChange, onBlurField, fieldErrors }: InfoPanelProps) {
  const attendAtError = fieldErrorMessage(fieldErrors, 'attendAt');
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedDay = event.days.find((day) => day.date === values.date);
  const slots = useMemo(
    () => (selectedDay ? availableSlots(selectedDay, event.slotMinutes) : []),
    [selectedDay, event.slotMinutes],
  );

  function selectDay(index: number) {
    const day = event.days[index];
    if (!day) return;
    onChange('date', day.date);
    // A time picked for another day may not exist on this one.
    const nextSlots = availableSlots(day, event.slotMinutes);
    if (!nextSlots.includes(values.time)) onChange('time', '');
    chipRefs.current[index]?.focus();
  }

  function handleChipKeyDown(event_: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = event.days.length - 1;
    const target =
      event_.key === 'ArrowRight' || event_.key === 'ArrowDown'
        ? (index + 1) % (last + 1)
        : event_.key === 'ArrowLeft' || event_.key === 'ArrowUp'
          ? (index - 1 + last + 1) % (last + 1)
          : null;
    if (target === null) return;
    event_.preventDefault();
    selectDay(target);
  }

  const selectedIndex = event.days.findIndex((day) => day.date === values.date);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return (
    <section className="panel info-panel" aria-labelledby="info-panel-heading">
      <h2 id="info-panel-heading">
        <span className="step-num" aria-hidden="true">
          1
        </span>
        Tus datos
      </h2>

      <div className="field-pair">
        <TextField
          id="nombre"
          label="Nombre"
          value={values.nombre}
          autoComplete="given-name"
          error={fieldErrorMessage(fieldErrors, 'nombre')}
          onChange={(value) => onChange('nombre', value)}
          onBlur={() => onBlurField('nombre')}
        />
        <TextField
          id="apellidos"
          label="Apellidos"
          value={values.apellidos}
          autoComplete="family-name"
          error={fieldErrorMessage(fieldErrors, 'apellidos')}
          onChange={(value) => onChange('apellidos', value)}
          onBlur={() => onBlurField('apellidos')}
        />
      </div>
      <TextField
        id="email"
        label="Email"
        type="email"
        value={values.email}
        autoComplete="email"
        error={fieldErrorMessage(fieldErrors, 'email')}
        onChange={(value) => onChange('email', value)}
        onBlur={() => onBlurField('email')}
      />

      <fieldset className="field visit-field">
        <legend>Día y hora de tu visita</legend>
        <div
          className="day-chips"
          role="radiogroup"
          aria-label="Día de la visita"
          aria-describedby={attendAtError ? 'attendAt-error' : undefined}
        >
          {event.days.map((day, index) => {
            const checked = day.date === values.date;
            return (
              <button
                key={day.date}
                id={`attend-day-${index}`}
                ref={(element) => {
                  chipRefs.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={index === tabbableIndex ? 0 : -1}
                className={checked ? 'chip chip-selected' : 'chip'}
                onClick={() => selectDay(index)}
                onKeyDown={(e) => handleChipKeyDown(e, index)}
              >
                {formatDayChip(day.date)}
              </button>
            );
          })}
        </div>

        <label htmlFor="attend-time" className="time-label">
          Hora
        </label>
        <select
          id="attend-time"
          value={values.time}
          disabled={!selectedDay}
          onChange={(e) => onChange('time', e.target.value)}
          onBlur={() => onBlurField('attendAt')}
          aria-invalid={Boolean(attendAtError)}
          aria-describedby={attendAtError ? 'attendAt-error' : undefined}
        >
          <option value="">{selectedDay ? 'Elige una hora' : 'Primero elige un día'}</option>
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
        {selectedDay && slots.length === 0 && (
          <p className="field-hint">Ya no quedan horarios disponibles este día. Elige otro.</p>
        )}
        {attendAtError && (
          <p className="field-error" id="attendAt-error">
            {attendAtError}
          </p>
        )}
      </fieldset>
    </section>
  );
}
