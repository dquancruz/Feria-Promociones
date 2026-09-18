import { normalizeSearchText, type CatalogItem, type CatalogItemType } from '@feria/shared';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { formatCents } from '../utils/currency';
import {
  PRODUCT_TIERS,
  SERVICE_TIERS,
  productHint,
  serviceHint,
  type RuleTier,
} from '../utils/discountHints';
import type { PreviewTotals } from '../utils/discountPreview';

interface CatalogPanelProps {
  /** The whole active catalog: searching happens here, on the client, so it is instant. */
  catalog: CatalogItem[];
  selectedItemIds: Set<string>;
  onToggle: (id: string) => void;
  preview: PreviewTotals;
  error: string | undefined;
}

const TAB_LABELS: Record<CatalogItemType, string> = { service: 'Servicios', product: 'Productos' };
const TABS: CatalogItemType[] = ['service', 'product'];

function ItemRow({ item, checked, onToggle }: { item: CatalogItem; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <li className="catalog-item">
      <label>
        <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
        <span className="catalog-item-name">{item.name}</span>
        <span className="price">{formatCents(item.priceCents)}</span>
      </label>
    </li>
  );
}

function Rules({ title, tiers, reachedPct, hint }: { title: string; tiers: RuleTier[]; reachedPct: number; hint: string }) {
  return (
    <div className="rules">
      <p className="rules-title">{title}</p>
      <ul>
        {tiers.map((tier) => (
          <li key={tier.pct} className={reachedPct === tier.pct ? 'rule rule-reached' : 'rule'} aria-current={reachedPct === tier.pct}>
            <span className="rule-pct">{tier.pct}%</span> {tier.label}
          </li>
        ))}
      </ul>
      <p className="rules-hint" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}

export function CatalogPanel({ catalog, selectedItemIds, onToggle, preview, error }: CatalogPanelProps) {
  const [tab, setTab] = useState<CatalogItemType>('service');
  const [search, setSearch] = useState('');

  const needle = normalizeSearchText(search);
  const matches = useMemo(
    () => catalog.filter((item) => !needle || normalizeSearchText(item.name).includes(needle)),
    [catalog, needle],
  );
  const byType = (type: CatalogItemType) => matches.filter((item) => item.type === type);
  const visible = byType(tab);
  const otherTab: CatalogItemType = tab === 'service' ? 'product' : 'service';
  const otherMatches = byType(otherTab).length;

  const selectedItems = catalog.filter((item) => selectedItemIds.has(item.id));
  const counts: Record<CatalogItemType, number> = {
    service: preview.servicesCount,
    product: preview.productsCount,
  };

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tab === 'service' ? 'product' : 'service';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <section className="panel catalog-panel" aria-labelledby="catalog-panel-heading">
      <h2 id="catalog-panel-heading">
        <span className="step-num" aria-hidden="true">
          2
        </span>
        Qué te interesa
      </h2>

      <div className="field">
        <label htmlFor="catalog-search">Buscar servicios y productos</label>
        <input
          id="catalog-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Por ejemplo: instalación"
          autoComplete="off"
          aria-describedby={error ? 'selection-error' : undefined}
          aria-invalid={Boolean(error)}
        />
      </div>

      {selectedItems.length > 0 && (
        <div className="selected-items">
          <h3>Servicios y/o productos seleccionados</h3>
          <ul className="chips">
            {selectedItems.map((item) => (
              <li key={item.id}>
                <button type="button" className="chip chip-removable" onClick={() => onToggle(item.id)} aria-label={`Quitar ${item.name}`}>
                  {item.name}
                  <span aria-hidden="true" className="chip-x">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Tipo de oferta">
        {TABS.map((type) => (
          <button
            key={type}
            id={`tab-${type}`}
            type="button"
            role="tab"
            aria-selected={tab === type}
            aria-controls={`panel-${type}`}
            tabIndex={tab === type ? 0 : -1}
            className={tab === type ? 'tab tab-active' : 'tab'}
            onClick={() => setTab(type)}
            onKeyDown={handleTabKeyDown}
          >
            {TAB_LABELS[type]}
            {counts[type] > 0 && (
              <>
                {' '}
                <span className="tab-count">({counts[type]})</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab === 'service' ? (
          <Rules title="Descuento en servicios" tiers={SERVICE_TIERS} reachedPct={preview.serviceDiscountPct} hint={serviceHint(preview)} />
        ) : (
          <Rules title="Descuento en productos" tiers={PRODUCT_TIERS} reachedPct={preview.productDiscountPct} hint={productHint(preview)} />
        )}

        {visible.length > 0 ? (
          <ul className="catalog-list">
            {visible.map((item) => (
              <ItemRow key={item.id} item={item} checked={selectedItemIds.has(item.id)} onToggle={onToggle} />
            ))}
          </ul>
        ) : (
          <div className="catalog-empty">
            <p>
              {needle
                ? `No encontramos ${TAB_LABELS[tab].toLowerCase()} para “${search.trim()}”.`
                : `No hay ${TAB_LABELS[tab].toLowerCase()} disponibles por ahora.`}
            </p>
            {otherMatches > 0 && (
              <p>
                Hay {otherMatches} {otherMatches === 1 ? 'resultado' : 'resultados'} en {TAB_LABELS[otherTab].toLowerCase()}.{' '}
                <button type="button" className="link-button" onClick={() => setTab(otherTab)}>
                  Verlos
                </button>
              </p>
            )}
            {needle && (
              <button type="button" className="link-button" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="field-error" id="selection-error">
          {error}
        </p>
      )}
    </section>
  );
}
