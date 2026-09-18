import type { CatalogItem, RegistrationConfirmation, RegistrationDraftUpdate } from '@feria/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiValidationError, confirmRegistration, fetchCatalog, fetchDraft, patchDraft, resetSession } from './api/client';
import type { FieldErrors } from './api/client';
import { CatalogPanel } from './components/CatalogPanel';
import { ConfirmationScreen } from './components/ConfirmationScreen';
import { Header } from './components/Header';
import { IdleModal } from './components/IdleModal';
import type { InfoPanelValues } from './components/InfoPanel';
import { InfoPanel } from './components/InfoPanel';
import { SiteFooter } from './components/SiteFooter';
import { useCountdown } from './hooks/useCountdown';
import { useDebouncedCallback } from './hooks/useDebouncedCallback';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { combineDateAndTime, splitIsoDateTime } from './utils/datetime';
import { computePreview } from './utils/discountPreview';
import { reloadPage } from './utils/navigation';

type Phase = 'loading' | 'form' | 'confirmed' | 'error';

// On a shared tablet the next visitor must not find the previous one's data: after this
// long without touching the form (with personal data on it) we ask, and then clear it.
const DEFAULT_IDLE_TIMEOUT_MIN = 10;
const IDLE_WARNING_SECONDS = 60;

function idleTimeoutMs(): number {
  const minutes = Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN);
  return (minutes > 0 ? minutes : DEFAULT_IDLE_TIMEOUT_MIN) * 60_000;
}

function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [values, setValues] = useState<InfoPanelValues>({ nombre: '', apellidos: '', email: '', date: '', time: '' });
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [catalogById, setCatalogById] = useState<Map<string, CatalogItem>>(new Map());
  const [visibleItems, setVisibleItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<RegistrationConfirmation | null>(null);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);

  const skipNextAutosaveRef = useRef(false);
  const startingOverRef = useRef(false);
  const saveInFlightRef = useRef<Promise<unknown>>(Promise.resolve());
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const selectedItemIdsRef = useRef(selectedItemIds);
  selectedItemIdsRef.current = selectedItemIds;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [draft, catalog] = await Promise.all([fetchDraft(), fetchCatalog('')]);
        if (cancelled) return;

        setCatalogById(new Map(catalog.items.map((item) => [item.id, item])));
        setVisibleItems(catalog.items);

        if (draft.status === 'confirmed') {
          setConfirmation(draft);
          setPhase('confirmed');
          return;
        }

        const hasExistingProgress =
          Boolean(draft.nombre || draft.apellidos || draft.email || draft.attendAt) || draft.selectedItemIds.length > 0;

        const { date, time } = splitIsoDateTime(draft.attendAt);
        skipNextAutosaveRef.current = true;
        setValues({ nombre: draft.nombre, apellidos: draft.apellidos, email: draft.email, date, time });
        setSelectedItemIds(new Set(draft.selectedItemIds));
        setShowRestoredBanner(hasExistingProgress);
        setPhase('form');
      } catch {
        if (!cancelled) setPhase('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildDraftPayload = useCallback((): RegistrationDraftUpdate => {
    const current = valuesRef.current;
    return {
      nombre: current.nombre.trim(),
      apellidos: current.apellidos.trim(),
      email: current.email.trim(),
      attendAt: combineDateAndTime(current.date, current.time),
      selectedItemIds: Array.from(selectedItemIdsRef.current),
    };
  }, []);

  const { debounced: debouncedSave, cancel: cancelPendingSave } = useDebouncedCallback(() => {
    if (startingOverRef.current) return;
    saveInFlightRef.current = patchDraft(buildDraftPayload())
      .then(() => setSaveError(null))
      .catch((err: unknown) => {
        if (!(err instanceof ApiValidationError)) {
          setSaveError('No se pudieron guardar los últimos cambios. Se reintentará automáticamente.');
        }
      });
  }, 800);

  useEffect(() => {
    if (phase !== 'form') return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    debouncedSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, selectedItemIds, phase]);

  const { debounced: debouncedSearch } = useDebouncedCallback((term: string) => {
    setCatalogLoading(true);
    fetchCatalog(term)
      .then((res) => {
        setVisibleItems(res.items);
        // Merged rather than replaced, so an item selected under an earlier search
        // term is never dropped from the map once a later search excludes it.
        setCatalogById((prev) => new Map([...prev, ...res.items.map((item) => [item.id, item] as const)]));
      })
      .catch(() => {
        /* keep showing the previous results if the search request fails */
      })
      .finally(() => setCatalogLoading(false));
  }, 300);

  function handleValueChange<Field extends keyof InfoPanelValues>(field: Field, value: InfoPanelValues[Field]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSearchChange(term: string) {
    setSearch(term);
    debouncedSearch(term);
  }

  function handleToggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setSubmitting(true);
    setFieldErrors({});
    setSaveError(null);
    try {
      await patchDraft(buildDraftPayload());
      const result = await confirmRegistration();
      setConfirmation(result);
      setPhase('confirmed');
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setFieldErrors(err.fieldErrors);
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
    startingOverRef.current = true;
    cancelPendingSave();
    await saveInFlightRef.current;
    try {
      await resetSession();
      reloadPage();
    } catch {
      startingOverRef.current = false;
      setSaveError('No se pudieron borrar tus datos. Intenta de nuevo.');
    }
  }

  const hasPersonalData = Boolean(values.nombre || values.apellidos || values.email);
  const { idle, dismiss: stayHere } = useIdleTimeout(phase === 'form' && hasPersonalData, idleTimeoutMs());
  const idleSecondsLeft = useCountdown(idle, IDLE_WARNING_SECONDS, () => void startOver());

  const preview = useMemo(() => computePreview(catalogById, selectedItemIds), [catalogById, selectedItemIds]);

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
          <p role="alert">No se pudo cargar el formulario. Verifica tu conexión e intenta de nuevo.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header sessionActive={phase === 'form'} />
      <main className="app-shell">
        {phase === 'confirmed' && confirmation ? (
          <ConfirmationScreen confirmation={confirmation} />
        ) : (
          <>
            {showRestoredBanner && (
              <div className="restore-banner" role="status">
                <p>Continuamos tu registro anterior — revisa tu selección antes de confirmar.</p>
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
            )}
            <div className="form-grid">
              <InfoPanel values={values} onChange={handleValueChange} fieldErrors={fieldErrors} />
              <div className="furrow-divider" aria-hidden="true" />
              <CatalogPanel
                items={visibleItems}
                catalogById={catalogById}
                selectedItemIds={selectedItemIds}
                onToggle={handleToggleItem}
                search={search}
                onSearchChange={handleSearchChange}
                preview={preview}
                fieldErrors={fieldErrors}
                onConfirm={() => void handleConfirm()}
                submitting={submitting}
                catalogLoading={catalogLoading}
              />
            </div>
            {(hasPersonalData || selectedItemIds.size > 0) && (
              <p className="privacy-actions">
                <button type="button" className="link-button" onClick={() => void startOver()}>
                  Borrar mis datos y empezar de nuevo
                </button>
              </p>
            )}
          </>
        )}

        {idle && <IdleModal secondsLeft={idleSecondsLeft} onStay={stayHere} onLeave={() => void startOver()} />}

        {saveError && (
          <p className="save-error" role="status">
            {saveError}
          </p>
        )}

        <SiteFooter />
      </main>
    </>
  );
}

export default App;
