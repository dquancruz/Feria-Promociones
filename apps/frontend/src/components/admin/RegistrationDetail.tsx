import type { AdminRegistration, AdminRegistrationItem } from '@feria/shared';
import { useEffect, useRef } from 'react';
import { formatAmount, formatCents } from '../../utils/currency';
import { formatVisit } from './format';

interface RegistrationDetailProps {
  registration: AdminRegistration;
  onClose: () => void;
}

function ItemGroup({ title, items }: { title: string; items: AdminRegistrationItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="item-group">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={`${item.type}-${item.name}`}>
            <span>{item.name}</span>
            <span className="price">{formatCents(item.priceCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Side panel with everything about one confirmed registration, so the portfolio can be prepared from it. */
export function RegistrationDetail({ registration, onClose }: RegistrationDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const fullName = `${registration.nombre} ${registration.apellidos}`;

  return (
    <aside className="detail" role="dialog" aria-label={`Detalle de ${fullName}`}>
      <div className="detail-head">
        <h3>{fullName}</h3>
        <button ref={closeRef} type="button" className="secondary-button" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <dl className="detail-facts">
        <div>
          <dt>Email</dt>
          <dd>{registration.email}</dd>
        </div>
        <div>
          <dt>Visita</dt>
          <dd>
            {formatVisit(registration.attendAt)}
            {registration.outOfWindow && <span className="badge badge-warn">Fuera de fechas</span>}
          </dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd title={registration.confirmationId}>{registration.confirmationId.slice(0, 8).toUpperCase()}</dd>
        </div>
      </dl>

      <ItemGroup title="Servicios" items={registration.items.filter((item) => item.type === 'service')} />
      <ItemGroup title="Productos" items={registration.items.filter((item) => item.type === 'product')} />

      <dl className="detail-facts">
        <div>
          <dt>Descuento en servicios</dt>
          <dd>
            {registration.serviceDiscountPct}% sobre {formatAmount(registration.servicesTotal)} con descuento
          </dd>
        </div>
        <div>
          <dt>Descuento en productos</dt>
          <dd>
            {registration.productDiscountPct}% sobre {formatAmount(registration.productsTotal)} con descuento
          </dd>
        </div>
        <div className="summary-final">
          <dt>Valor con descuento</dt>
          <dd className="price">{formatAmount(registration.grandTotal)}</dd>
        </div>
      </dl>
    </aside>
  );
}
