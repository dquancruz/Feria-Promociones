import {
  splitAttendAt,
  toAttendAtIso,
  type CatalogItem,
  type EventSettings,
  type RegistrationConfirmation,
  type RegistrationDraft,
  type RegistrationDraftUpdate,
} from '@feria/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  ApiValidationError,
  confirmRegistration,
  fetchCatalog,
  fetchDraft,
  fetchEvent,
  patchDraft,
  resetSession,
} from './api/client';
import type { FieldErrors } from './api/client';
import { CatalogPanel } from './components/CatalogPanel';
import { ConfirmationScreen } from './components/ConfirmationScreen';
import { ErrorSummary } from './components/ErrorSummary';
import { EventClosed } from './components/EventClosed';
import { Header } from './components/Header';
import { IdleModal } from './components/IdleModal';
import { InfoPanel, type InfoPanelValues } from './components/InfoPanel';
import { MobileBar } from './components/MobileBar';
import { SiteFooter } from './components/SiteFooter';
import { SummaryCard } from './components/SummaryCard';
import { useAutosave } from './hooks/useAutosave';
import { useCountdown } from './hooks/useCountdown';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { useInView } from './hooks/useInView';
import { computePreview } from './utils/discountPreview';
import { fieldErrorMessage } from './utils/fieldErrors';
import { reloadPage } from './utils/navigation';
import { availableSlots } from './utils/slots';
import { FORM_FIELD_ORDER, validateAll, validateField, type FormField } from './utils/validation';

type Phase = 'loading' | 'form' | 'closed' | 'confirmed' | 'error';

// On a shared tablet the next visitor must not find the previous one's data: after this
// long without touching the form (with personal data on it) we ask, and then clear it.
const DEFAULT_IDLE_TIMEOUT_MIN = 10;
const IDLE_WARNING_SECONDS = 60;

function idleTimeoutMs(): number {
  const minutes = Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN);
  return (minutes > 0 ? minutes : DEFAULT_IDLE_TIMEOUT_MIN) * 60_000;
}

const EMPTY_VALUES: InfoPanelValues = { nombre: '', apellidos: '', email: '', date: '', time: '' };

// A saved day or time only survives if it is still on offer: the organizers may have
// changed the dates since the draft was written, and a slot that has passed can't be booked.
function draftToValues(draft: RegistrationDraft, event: EventSettings): InfoPanelValues {
  let date = '';
  let time = '';
  if (draft.attendAt) {
    const saved = splitAttendAt(draft.attendAt);
    const day = event.days.find((candidate) => candidate.date === saved.day);
    if (day && availableSlots(day, event.slotMinutes).includes(saved.time)) {
      date = saved.day;
      time = saved.time;
    }
  }
  return { nombre: draft.nombre, apellidos: draft.apellidos, email: draft.email, date, time };
}

function loadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return 'Demasiados intentos, espera un momento.';
  return 'No se pudo cargar el formulario. Verifica tu conexión e intenta de nuevo.';
}

function focusTarget(field: FormField, values: InfoPanelValues): string {
  if (field === 'attendAt') return values.date ? 'attend-time' : 'attend-day-0';
  if (field === 'selectedItemIds') return 'catalog-search';
  return field;
}

function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [values, setValues] = useState<InfoPanelValues>(EMPTY_VALUES);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<RegistrationConfirmation | null>(null);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);

  const skipNextAutosaveRef = useRef(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const selectedItemIdsRef = useRef(selectedItemIds);
  selectedItemIdsRef.current = selectedItemIds;
  const summaryRef = useRef<HTMLElement>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    setPhase('loading');
    try {
      const [draft, catalogResponse, eventResponse] = await Promise.all([fetchDraft(), fetchCatalog(''), fetchEvent()]);
      if (isCancelled()) return;

      setCatalog(catalogResponse.items);
      setEvent(eventResponse);

      if (draft.status === 'confirmed') {
        setConfirmation(draft);
        setPhase('confirmed');
        return;
      }
      if (!eventResponse || !eventResponse.registrationOpen || eventResponse.days.length === 0) {
        setPhase('closed');
        return;
      }

      const restored = draftToValues(draft, eventResponse);
      const hasExistingProgress =
        Boolean(draft.nombre || draft.apellidos || draft.email || draft.attendAt) || draft.selectedItemIds.length > 0;
      skipNextAutosaveRef.current = true;
      setValues(restored);
      setSelectedItemIds(new Set(draft.selectedItemIds));
      setShowRestoredBanner(hasExistingProgress);
      setPhase('form');
    } catch (err) {
      if (isCancelled()) return;
      setLoadError(loadErrorMessage(err));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const buildDraftPayload = useCallback((): RegistrationDraftUpdate => {
    const current = valuesRef.current;
    return {
      nombre: current.nombre.trim(),
      apellidos: current.apellidos.trim(),
      email: current.email.trim(),
      attendAt: current.date && current.time ? toAttendAtIso(current.date, current.time) : null,
      selectedItemIds: Array.from(selectedItemIdsRef.current),
    };
  }, []);

  const autosave = useAutosave(() => patchDraft(buildDraftPayload()));
  const scheduleSave = autosave.schedule;

  useEffect(() => {
    if (phase !== 'form') return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    scheduleSave();
  }, [values, selectedItemIds, phase, scheduleSave]);

  function clearError(field: FormField) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleValueChange<Field extends keyof InfoPanelValues>(field: Field, value: InfoPanelValues[Field]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    clearError(field === 'date' || field === 'time' ? 'attendAt' : field);
  }

  function handleBlurField(field: FormField) {
    const message = validateField(field, valuesRef.current, selectedItemIdsRef.current.size);
    if (message) setFieldErrors((prev) => ({ ...prev, [field]: message }));
    else clearError(field);
  }

  function handleToggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    clearError('selectedItemIds');
  }

  function focusField(field: FormField) {
    const element = document.getElementById(focusTarget(field, valuesRef.current));
    element?.scrollIntoView?.({ block: 'center' });
    element?.focus({ preventScroll: true });
  }

  function focusFirstError(errors: FieldErrors) {
    const first = FORM_FIELD_ORDER.find((field) => fieldErrorMessage(errors, field));
    if (first) focusField(first);
  }

  async function handleConfirm() {
    setSubmitAttempted(true);
    setSaveError(null);

    const clientErrors = validateAll(valuesRef.current, selectedItemIdsRef.current.size);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      // Whatever was typed last is on the server before it is asked to confirm it.
      await autosave.flush();
      const result = await confirmRegistration();
      setConfirmation(result);
      setPhase('confirmed');
      window.scrollTo?.(0, 0);
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setFieldErrors(err.fieldErrors);
        focusFirstError(err.fieldErrors);
      } else if (err instanceof ApiError && err.code === 'registration_closed') {
        setPhase('closed');
      } else if (err instanceof ApiError && err.status === 429) {
        setSaveError('Demasiados intentos, espera un momento.');
      } else {
        setSaveError('No se pudo confirmar tu asistencia. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Discards this browser's draft and starts a clean session. A save still pending or in
  // flight is dealt with first: landing after the reset, it would put the data straight back.
  async function startOver() {
    await autosave.stop();
    try {
      await resetSession();
      reloadPage();
    } catch {
      autosave.resume();
      setSaveError('No se pudieron borrar tus datos. Intenta de nuevo.');
    }
  }

  const hasPersonalData = Boolean(values.nombre || values.apellidos || values.email);
  const { idle, dismiss: stayHere } = useIdleTimeout(phase === 'form' && hasPersonalData, idleTimeoutMs());
  const idleSecondsLeft = useCountdown(idle, IDLE_WARNING_SECONDS, () => void startOver());

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const preview = useMemo(() => computePreview(catalogById, selectedItemIds), [catalogById, selectedItemIds]);
  const summaryInView = useInView(summaryRef);

  const summaryErrors = submitAttempted
    ? FORM_FIELD_ORDER.flatMap((field) => {
        const message = fieldErrorMessage(fieldErrors, field);
        return message ? [{ field, message }] : [];
      })
    : [];

  if (phase === 'loading') {
    return (
      <>
        <Header />
        <main className="app-shell">
          <p role="status">Cargando…</p>
        </main>
      </>
    );
  }

  if (phase === 'error') {
    return (
      <>
        <Header />
        <main className="app-shell">
          <section className="panel">
            <p role="alert">{loadError}</p>
            <button type="button" className="primary" onClick={() => void load(() => false)}>
              Reintentar
            </button>
          </section>
          <SiteFooter />
        </main>
      </>
    );
  }

  if (phase === 'closed') {
    return (
      <>
        <Header event={event} />
        <main className="app-shell">
          <EventClosed />
          <SiteFooter />
        </main>
      </>
    );
  }

  if (phase === 'confirmed' && confirmation) {
    return (
      <>
        <Header event={event} />
        <main className="app-shell">
          <ConfirmationScreen confirmation={confirmation} />
          <SiteFooter />
        </main>
      </>
    );
  }

  return (
    <>
      <Header event={event} saveStatus={autosave.status} />
      <main className="app-shell form-page">
        {showRestoredBanner && (
          <div className="restore-banner" role="status">
            <p>Continuamos tu registro anterior. Revisa tu selección antes de confirmar.</p>
            <div className="restore-actions">
              <button type="button" className="link-button" onClick={() => void startOver()}>
                {values.nombre ? `No soy ${values.nombre}, empezar de nuevo` : 'No soy yo, empezar de nuevo'}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setShowRestoredBanner(false)}
                aria-label="Cerrar aviso"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        <p className="intro">
          Confirma tu asistencia y elige lo que te interesa. Te preparamos promociones a tu medida.
        </p>

        <ErrorSummary errors={summaryErrors} onSelect={focusField} />

        <div className="form-grid">
          {event && (
            <InfoPanel
              values={values}
              event={event}
              onChange={handleValueChange}
              onBlurField={handleBlurField}
              fieldErrors={fieldErrors}
            />
          )}
          <CatalogPanel
            catalog={catalog}
            selectedItemIds={selectedItemIds}
            onToggle={handleToggleItem}
            preview={preview}
            error={fieldErrorMessage(fieldErrors, 'selectedItemIds')}
          />
          <SummaryCard ref={summaryRef} preview={preview} onConfirm={() => void handleConfirm()} submitting={submitting} />
        </div>

        {(hasPersonalData || selectedItemIds.size > 0) && (
          <p className="privacy-actions">
            <button type="button" className="link-button" onClick={() => void startOver()}>
              Borrar mis datos y empezar de nuevo
            </button>
          </p>
        )}

        {saveError && (
          <p className="save-error" role="status">
            {saveError}
          </p>
        )}

        {idle && <IdleModal secondsLeft={idleSecondsLeft} onStay={stayHere} onLeave={() => void startOver()} />}

        <SiteFooter />
      </main>
      {!summaryInView && (
        <MobileBar
          servicePct={preview.serviceDiscountPct}
          productPct={preview.productDiscountPct}
          onConfirm={() => void handleConfirm()}
          submitting={submitting}
        />
      )}
    </>
  );
}

export default App;
