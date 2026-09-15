import type { CatalogItem } from '@feria/shared';
import type { FieldErrors } from '../api/client';
import { formatCents } from '../utils/currency';
import { fieldErrorMessage } from '../utils/fieldErrors';
import type { PreviewTotals } from '../utils/discountPreview';

interface CatalogPanelProps {
  items: CatalogItem[];
  selectedItemIds: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  preview: PreviewTotals;
  fieldErrors: FieldErrors;
  onConfirm: () => void;
  submitting: boolean;
  catalogLoading: boolean;
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: CatalogItem;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li className="catalog-item">
      <label>
        <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
        <span className="catalog-item-name">{item.name}</span>
        <span className="catalog-item-price">{formatCents(item.priceCents)}</span>
      </label>
    </li>
  );
}

export function CatalogPanel({
  items,
  selectedItemIds,
  onToggle,
  search,
  onSearchChange,
  preview,
  fieldErrors,
  onConfirm,
  submitting,
  catalogLoading,
}: CatalogPanelProps) {
  const services = items.filter((item) => item.type === 'service');
  const products = items.filter((item) => item.type === 'product');
  const selectionError = fieldErrorMessage(fieldErrors, 'selectedItemIds');

  return (
    <section className="panel" aria-labelledby="catalog-panel-heading">
      <h2 id="catalog-panel-heading">2. Seleccione Servicios y Productos de su interés</h2>

      <div className="field">
        <label htmlFor="catalog-search">Buscar Servicios y Productos</label>
        <input
          id="catalog-search"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar Servicios y Productos"
        />
      </div>

      <div className="catalog-list" aria-live="polite" aria-busy={catalogLoading}>
        {items.length === 0 && !catalogLoading && <p className="catalog-empty">No se encontraron resultados.</p>}

        {services.length > 0 && (
          <div>
            <h3>Servicios</h3>
            <ul>
              {services.map((item) => (
                <ItemRow key={item.id} item={item} checked={selectedItemIds.has(item.id)} onToggle={onToggle} />
              ))}
            </ul>
          </div>
        )}

        {products.length > 0 && (
          <div>
            <h3>Productos</h3>
            <ul>
              {products.map((item) => (
                <ItemRow key={item.id} item={item} checked={selectedItemIds.has(item.id)} onToggle={onToggle} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {selectionError && (
        <p className="field-error" role="alert">
          {selectionError}
        </p>
      )}

      <footer className="discount-summary">
        <div className="discount-summary-row">
          <div>
            <span className="discount-label">Descuento obtenido en Servicios</span>
            <strong>{preview.serviceDiscountPct}%</strong>
            <span className="discount-detail">
              {preview.servicesCount} seleccionado{preview.servicesCount === 1 ? '' : 's'} ·{' '}
              {formatCents(preview.servicesSubtotalCents)} → {formatCents(preview.servicesTotalCents)}
            </span>
          </div>
          <div>
            <span className="discount-label">Descuento obtenido en Productos</span>
            <strong>{preview.productDiscountPct}%</strong>
            <span className="discount-detail">
              {preview.productsCount} seleccionado{preview.productsCount === 1 ? '' : 's'} ·{' '}
              {formatCents(preview.productsSubtotalCents)} → {formatCents(preview.productsTotalCents)}
            </span>
          </div>
        </div>
        <p className="grand-total">Total: {formatCents(preview.grandTotalCents)}</p>

        <button type="button" onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Confirmando…' : 'CONFIRMAR ASISTENCIA →'}
        </button>
      </footer>
    </section>
  );
}
