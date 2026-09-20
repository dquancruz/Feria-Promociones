import {
  SLOT_MINUTES_OPTIONS,
  addDays,
  buildSlots,
  eventSettingsInputSchema,
  todayInEventTimezone,
  type AdminStats,
  type EventSettings,
  type EventSettingsInput,
} from '@feria/shared';
import { useEffect, useRef, useState } from 'react';
import { fetchAdminEvent, fetchAdminStats, saveAdminEvent } from '../../api/adminClient';
import { ApiValidationError } from '../../api/client';
import { formatDayChip } from '../../utils/eventFormat';

interface DayDraft {
  id: number;
  date: string;
  opensAt: string;
  closesAt: string;
}

interface DayErrors {
  date?: string;
  times?: string;
}

interface FormErrors {
  name?: string;
  days: Record<number, DayErrors>;
  /** Problems that are about the list as a whole, or reported by the server. */
  general: string[];
}

interface Notice {
  kind: 'success' | 'warning';
  text: string;
}

const NO_ERRORS: FormErrors = { days: {}, general: [] };

function outOfWindowText(count: number): string {
  return count === 1
    ? '1 registro confirmado queda fuera de las nuevas fechas. No se modificó.'
    : `${count} registros confirmados quedan fuera de las nuevas fechas. No se modificaron.`;
}

function flattenFieldErrors(fieldErrors: Record<string, string | string[] | undefined>): string[] {
  return Object.values(fieldErrors).flatMap((entry) => (Array.isArray(entry) ? entry : entry ? [entry] : []));
}

interface EventTabProps {
  /** Returns true when the error was a lost session and the parent has dealt with it. */
  onError: (err: unknown) => boolean;
}

export function EventTab({ onError }: EventTabProps) {
  const nextId = useRef(1);
  const toDrafts = (event: EventSettings): DayDraft[] =>
    event.days.map((day) => ({ id: nextId.current++, ...day }));

  const [baseline, setBaseline] = useState<EventSettings | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [days, setDays] = useState<DayDraft[]>([]);

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ days: number; registrations: number } | null>(null);

  function applyEvent(event: EventSettings) {
    setBaseline(event);
    setName(event.name);
    setLocation(event.location);
    setSlotMinutes(event.slotMinutes);
    setRegistrationOpen(event.registrationOpen);
    setDays(toDrafts(event));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminEvent(), fetchAdminStats()])
      .then(([event, loadedStats]) => {
        if (cancelled) return;
        applyEvent(event);
        setStats(loadedStats);
      })
      .catch((err: unknown) => {
        if (cancelled || onError(err)) return;
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
    // applyEvent only touches state setters and a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError]);

  function updateDay(id: number, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((day) => (day.id === id ? { ...day, ...patch } : day)));
    setPendingRemoval(null);
  }

  function addDay() {
    const sorted = days.map((day) => day.date).filter(Boolean).sort();
    const last = sorted.at(-1);
    const date = last ? addDays(last, 1) : addDays(todayInEventTimezone(), 30);
    setDays((prev) => [...prev, { id: nextId.current++, date, opensAt: '09:00', closesAt: '18:00' }]);
    setPendingRemoval(null);
  }

  function removeDay(id: number) {
    setDays((prev) => prev.filter((day) => day.id !== id));
    setPendingRemoval(null);
  }

  function validate(): FormErrors {
    const result: FormErrors = { days: {}, general: [] };
    if (!name.trim()) result.name = 'El nombre del evento es requerido';

    const seen = new Set<string>();
    for (const day of days) {
      const dayErrors: DayErrors = {};
      if (!day.date) dayErrors.date = 'Elige la fecha';
      else if (seen.has(day.date)) dayErrors.date = 'Este día está repetido';
      seen.add(day.date);
      if (!day.opensAt || !day.closesAt || day.closesAt <= day.opensAt) {
        dayErrors.times = 'El cierre debe ser posterior a la apertura';
      }
      if (dayErrors.date || dayErrors.times) result.days[day.id] = dayErrors;
    }
    return result;
  }

  function hasErrors(result: FormErrors): boolean {
    return Boolean(result.name) || Object.keys(result.days).length > 0 || result.general.length > 0;
  }

  function buildInput(): EventSettingsInput {
    return {
      name: name.trim(),
      location: location.trim(),
      slotMinutes,
      registrationOpen,
      days: [...days]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ date, opensAt, closesAt }) => ({ date, opensAt, closesAt })),
    };
  }

  async function persist() {
    setSaving(true);
    setNotice(null);
    setPendingRemoval(null);
    try {
      const input = eventSettingsInputSchema.parse(buildInput());
      const { outOfWindowCount, ...saved } = await saveAdminEvent(input);
      applyEvent(saved);
      setStats(await fetchAdminStats().catch(() => stats));
      setNotice(
        outOfWindowCount > 0
          ? { kind: 'warning', text: `Cambios guardados. ${outOfWindowText(outOfWindowCount)}` }
          : { kind: 'success', text: 'Cambios guardados.' },
      );
    } catch (err) {
      if (onError(err)) return;
      if (err instanceof ApiValidationError) {
        setErrors({ days: {}, general: flattenFieldErrors(err.fieldErrors) });
      } else {
        setErrors({ days: {}, general: ['No se pudieron guardar los cambios. Intenta de nuevo.'] });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(alreadyConfirmed = false) {
    const found = validate();
    setErrors(found);
    setNotice(null);
    if (hasErrors(found)) return;

    if (!alreadyConfirmed && baseline && stats) {
      const keptDates = new Set(days.map((day) => day.date));
      const removed = baseline.days.filter((day) => !keptDates.has(day.date));
      const registrations = removed.reduce(
        (sum, day) => sum + (stats.byDay.find((entry) => entry.date === day.date)?.count ?? 0),
        0,
      );
      if (registrations > 0) {
        setPendingRemoval({ days: removed.length, registrations });
        return;
      }
    }
    await persist();
  }

  if (loadError) {
    return (
      <p className="field-error" role="alert">
        No se pudo cargar la configuración del evento.
      </p>
    );
  }
  if (!baseline) return <p role="status">Cargando…</p>;

  const previewDays = days
    .filter((day) => day.date && day.closesAt > day.opensAt)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <form
      className="panel event-form"
      aria-labelledby="event-heading"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      noValidate
    >
      <h2 id="event-heading">Datos del evento</h2>

      <div className="field-pair">
        <div className="field">
          <label htmlFor="event-name">Nombre del evento</label>
          <input
            id="event-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'event-name-error' : undefined}
          />
          {errors.name && (
            <p className="field-error" id="event-name-error">
              {errors.name}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="event-location">Lugar</label>
          <input id="event-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>

      <div className="field-pair">
        <div className="field">
          <label htmlFor="event-slot">Duración de cada franja</label>
          <select id="event-slot" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
            {SLOT_MINUTES_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} minutos
              </option>
            ))}
          </select>
        </div>
        <label className="switch" htmlFor="event-open">
          <input
            id="event-open"
            type="checkbox"
            role="switch"
            checked={registrationOpen}
            onChange={(e) => setRegistrationOpen(e.target.checked)}
          />
          <span>Registro abierto</span>
        </label>
      </div>

      <div className="event-days">
        <h3>Días de la feria</h3>
        {days.length === 0 && <p className="stat-note">No hay días. Los clientes verán el aviso de registro cerrado.</p>}
        {days.map((day, index) => {
          const dayErrors = errors.days[day.id];
          return (
            <fieldset key={day.id} className="day-row">
              <legend>Día {index + 1}</legend>
              <div className="field">
                <label htmlFor={`day-date-${day.id}`}>Fecha</label>
                <input
                  id={`day-date-${day.id}`}
                  type="date"
                  value={day.date}
                  onChange={(e) => updateDay(day.id, { date: e.target.value })}
                  aria-invalid={Boolean(dayErrors?.date)}
                />
                {dayErrors?.date && <p className="field-error">{dayErrors.date}</p>}
              </div>
              <div className="field">
                <label htmlFor={`day-opens-${day.id}`}>Apertura</label>
                <input
                  id={`day-opens-${day.id}`}
                  type="time"
                  value={day.opensAt}
                  onChange={(e) => updateDay(day.id, { opensAt: e.target.value })}
                  aria-invalid={Boolean(dayErrors?.times)}
                />
              </div>
              <div className="field">
                <label htmlFor={`day-closes-${day.id}`}>Cierre</label>
                <input
                  id={`day-closes-${day.id}`}
                  type="time"
                  value={day.closesAt}
                  onChange={(e) => updateDay(day.id, { closesAt: e.target.value })}
                  aria-invalid={Boolean(dayErrors?.times)}
                />
                {dayErrors?.times && <p className="field-error">{dayErrors.times}</p>}
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => removeDay(day.id)}
                aria-label={`Quitar día ${index + 1}`}
              >
                Quitar
              </button>
            </fieldset>
          );
        })}
        <button type="button" className="secondary-button" onClick={addDay}>
          Agregar día
        </button>
      </div>

      <section className="event-preview" aria-labelledby="preview-heading">
        <h3 id="preview-heading">Así verán los clientes los días</h3>
        {!registrationOpen ? (
          <p className="stat-note">Con el registro cerrado, los clientes verán un aviso en lugar del formulario.</p>
        ) : previewDays.length === 0 ? (
          <p className="stat-note">Sin días válidos, los clientes verán el aviso de registro cerrado.</p>
        ) : (
          <ul className="preview-list">
            {previewDays.map((day) => (
              <li key={day.id}>
                <span className="chip">{formatDayChip(day.date)}</span>
                <span className="stat-note">
                  de {day.opensAt} a {day.closesAt}, {buildSlots(day, slotMinutes).length} horarios
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {errors.general.length > 0 && (
        <div className="error-summary" role="alert">
          <ul>
            {errors.general.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {pendingRemoval && (
        <div className="confirm-box" role="alertdialog" aria-labelledby="removal-title">
          <p id="removal-title">
            Vas a quitar {pendingRemoval.days} {pendingRemoval.days === 1 ? 'día' : 'días'} que ya tienen{' '}
            {pendingRemoval.registrations} {pendingRemoval.registrations === 1 ? 'registro' : 'registros'}. Los
            registros no se borran, pero quedarán fuera de las fechas del evento.
          </p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => void handleSave(true)} disabled={saving}>
              Guardar de todos modos
            </button>
            <button type="button" className="secondary-button" onClick={() => setPendingRemoval(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={notice.kind === 'warning' ? 'notice notice-warn' : 'notice'} role="status">
          {notice.text}
        </p>
      )}

      <div>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
