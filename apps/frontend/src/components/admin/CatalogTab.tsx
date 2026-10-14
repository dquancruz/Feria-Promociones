import { catalogItemInputSchema, type CatalogItem, type CatalogItemType } from '@feria/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { createAdminCatalogItem, fetchAdminCatalog, updateAdminCatalogItem } from '../../api/adminClient';
import { ApiValidationError } from '../../api/client';
import { formatCents } from '../../utils/currency';

const TYPE_LABELS: Record<CatalogItemType, string> = { service: 'Servicio', product: 'Producto' };

interface FormState {
  type: CatalogItemType;
  name: string;
  price: string;
}

const EMPTY_FORM: FormState = { type: 'product', name: '', price: '' };

// The admin types quetzales ("150.50"); the API stores whole cents.
function quetzalesToCents(text: string): number {
  const value = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function flattenFieldErrors(fieldErrors: Record<string, string | string[] | undefined>): string[] {
  return Object.values(fieldErrors).flatMap((entry) => (Array.isArray(entry) ? entry : entry ? [entry] : []));
}

interface CatalogTabProps {
  /** Returns true when the error was a lost session and the parent has dealt with it. */
  onError: (err: unknown) => boolean;
}

export function CatalogTab({ onError }: CatalogTabProps) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminCatalog()
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch((err) => {
        if (!cancelled && !onError(err)) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors([]);
  }

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setForm({ type: item.type, name: item.name, price: centsToInput(item.priceCents) });
    setErrors([]);
  }

  // Same order the API lists them in: active first, then by type and name.
  function replaceItem(saved: CatalogItem) {
    setItems((current) =>
      [...(current ?? []).filter((item) => item.id !== saved.id), saved].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'es'),
      ),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = catalogItemInputSchema.safeParse({
      type: form.type,
      name: form.name,
      priceCents: quetzalesToCents(form.price),
    });
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((issue) => (issue.path[0] === 'priceCents' ? 'Precio inválido' : issue.message)))]);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      const saved = editingId
        ? await updateAdminCatalogItem(editingId, parsed.data)
        : await createAdminCatalogItem(parsed.data);
      replaceItem(saved);
      resetForm();
    } catch (err) {
      if (onError(err)) return;
      setErrors(
        err instanceof ApiValidationError ? flattenFieldErrors(err.fieldErrors) : ['No se pudo guardar. Intenta de nuevo.'],
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: CatalogItem) {
    setErrors([]);
    try {
      replaceItem(await updateAdminCatalogItem(item.id, { active: !item.active }));
    } catch (err) {
      if (!onError(err)) setErrors(['No se pudo actualizar el ítem. Intenta de nuevo.']);
    }
  }

  if (loadError) {
    return (
      <p className="save-error" role="alert">
        No se pudo cargar el catálogo.
      </p>
    );
  }
  if (!items) return <p role="status">Cargando…</p>;

  return (
    <section className="admin-section" aria-label="Catálogo">
      <form className="panel catalog-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2>{editingId ? 'Editar ítem' : 'Agregar ítem'}</h2>
        <div className="catalog-form-fields">
          <div className="field">
            <label htmlFor="catalog-type">Tipo</label>
            <select
              id="catalog-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CatalogItemType })}
            >
              <option value="product">Producto</option>
              <option value="service">Servicio</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="catalog-name">Nombre</label>
            <input
              id="catalog-name"
              type="text"
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="catalog-price">Precio (Q)</label>
            <input
              id="catalog-price"
              type="text"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="field-error" role="alert">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <div className="admin-toolbar-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar'}
          </button>
          {editingId && (
            <button type="button" className="secondary-button" onClick={resetForm} disabled={saving}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Tipo</th>
            <th scope="col">Precio</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.active ? undefined : 'catalog-inactive'}>
              <td>{item.name}</td>
              <td>{TYPE_LABELS[item.type]}</td>
              <td>{formatCents(item.priceCents)}</td>
              <td>
                <span className={item.active ? 'status-badge status-active' : 'status-badge status-retired'}>
                  {item.active ? 'Activo' : 'Retirado'}
                </span>
              </td>
              <td className="catalog-actions">
                <button type="button" className="secondary-button" onClick={() => startEdit(item)}>
                  Editar
                </button>
                <button
                  type="button"
                  className={item.active ? 'danger-outline' : 'secondary-button'}
                  onClick={() => void handleToggleActive(item)}
                >
                  {item.active ? 'Retirar' : 'Reactivar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
