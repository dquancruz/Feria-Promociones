import type { CatalogItem } from '@feria/shared';
import type { FieldErrors } from '../api/client';
import { formatCents } from '../utils/currency';
import { fieldErrorMessage } from '../utils/fieldErrors';
import type { PreviewTotals } from '../utils/discountPreview';
import { productProgress, serviceProgress, type TierProgress } from '../utils/discountProgress';

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

function TierMeter({ progress }: { progress: TierProgress }) {
  const fillPct = Math.min(100, (progress.count / progress.trackMax) * 100);

  return (
    <div className="tier-meter">
      <div className="tier-meter-track" aria-hidden="true">
        <div
          className={`tier-meter-fill${progress.atMaxTier ? ' tier-meter-fill--max' : ''}`}
          style={{ width: `${fillPct}%` }}
        />
        {progress.ticks.map((tick) => (
          <span
            key={tick}
            className="tier-meter-tick"
            style={{ left: `${Math.min(100, (tick / progress.trackMax) * 100)}%` }}
          />
        ))}
      </div>
      {progress.hint && <p className="tier-meter-hint">{progress.hint}</p>}
    </div>
  );
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
  const serviceMeter = serviceProgress(preview);
  const productMeter = productProgress(preview);

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
        {items.length === 0 && !catalogLoading && (
          <p className="catalog-empty">
            No se encontraron resultados.{' '}
            {search.trim() && (
              <button type="button" className="link-button" onClick={() => onSearchChange('')}>
                Limpiar búsqueda
              </button>
            )}
          </p>
        )}

        {services.length > 0 && (
          <div>
            <h3>
              Servicios{serviceMeter.count > 0 && <span className="catalog-count"> ({serviceMeter.count})</span>}
            </h3>
            <TierMeter progress={serviceMeter} />
            <ul>
              {services.map((item) => (
                <ItemRow key={item.id} item={item} checked={selectedItemIds.has(item.id)} onToggle={onToggle} />
              ))}
            </ul>
          </div>
        )}

        {products.length > 0 && (
          <div>
            <h3>
              Productos{productMeter.count > 0 && <span className="catalog-count"> ({productMeter.count})</span>}
            </h3>
            <TierMeter progress={productMeter} />
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

      <footer className="discount-summary ticket">
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
