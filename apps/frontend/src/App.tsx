import type { CatalogItem, RegistrationConfirmation, RegistrationDraftUpdate } from '@feria/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiValidationError, confirmRegistration, fetchCatalog, fetchDraft, patchDraft } from './api/client';
import type { FieldErrors } from './api/client';
import { CatalogPanel } from './components/CatalogPanel';
import { ConfirmationScreen } from './components/ConfirmationScreen';
import { Header } from './components/Header';
import type { InfoPanelValues } from './components/InfoPanel';
import { InfoPanel } from './components/InfoPanel';
import { SiteFooter } from './components/SiteFooter';
import { useDebouncedCallback } from './hooks/useDebouncedCallback';
import { combineDateAndTime, splitIsoDateTime } from './utils/datetime';
import { computePreview } from './utils/discountPreview';

type Phase = 'loading' | 'form' | 'confirmed' | 'error';

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

  const { debounced: debouncedSave } = useDebouncedCallback(() => {
    patchDraft(buildDraftPayload())
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
          </>
        )}

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
