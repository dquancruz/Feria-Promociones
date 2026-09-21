import { splitAttendAt, type ConfirmedItem, type RegistrationConfirmation } from '@feria/shared';
import { useState } from 'react';
import { resetSession } from '../api/client';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { formatAmount, formatCents } from '../utils/currency';
import { formatDayLong } from '../utils/eventFormat';
import { reloadPage } from '../utils/navigation';
import { DiscountTag } from './DiscountTag';

// The next person at a shared tablet shouldn't see this one's confirmation for long.
const AUTO_RESET_SECONDS = 120;

interface ConfirmationScreenProps {
  confirmation: RegistrationConfirmation;
}

function ItemGroup({ title, items }: { title: string; items: ConfirmedItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="item-group">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <span className="price">{formatCents(item.priceCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConfirmationScreen({ confirmation }: ConfirmationScreenProps) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await resetSession();
      reloadPage();
    } catch {
      setResetError('No se pudo iniciar un nuevo registro. Intenta de nuevo.');
      setResetting(false);
    }
  }

  const secondsLeft = useCountdown(!resetting && !resetError, AUTO_RESET_SECONDS, () => void handleReset());

  const visit = confirmation.attendAt ? splitAttendAt(confirmation.attendAt) : null;
  const shortCode = confirmation.confirmationId.slice(0, 8).toUpperCase();
  const hasItems = confirmation.items.length > 0;

  return (
    <section className="panel confirmation" aria-labelledby="confirmation-heading">
      <h2 id="confirmation-heading">¡Asistencia confirmada!</h2>
      <p className="confirmation-lead">
        Gracias, {confirmation.nombre}.{' '}
        {visit && (
          <>
            Te esperamos el {formatDayLong(visit.day)} a las {visit.time}.{' '}
          </>
        )}
        {hasItems
          ? 'Prepararemos un portafolio de promociones con base en lo que elegiste.'
          : 'Cuando nos visites, con gusto te ayudamos a encontrar las promociones que más te convienen.'}
      </p>

      <div className="confirmation-body">
        <DiscountTag
          servicePct={confirmation.serviceDiscountPct}
          productPct={confirmation.productDiscountPct}
          stamp="Confirmado"
        />

        <div className="confirmation-details">
          <p className="confirmation-code">
            Código de confirmación{' '}
            <code title={confirmation.confirmationId}>{shortCode}</code>
          </p>

          <ItemGroup title="Servicios" items={confirmation.items.filter((item) => item.type === 'service')} />
          <ItemGroup title="Productos" items={confirmation.items.filter((item) => item.type === 'product')} />

          {hasItems && (
            <dl className="summary-rows">
              <div>
                <dt>Descuento en servicios</dt>
                <dd>
                  {confirmation.serviceDiscountPct}%, ahorras <span className="price">{formatAmount(confirmation.servicesSavings)}</span>
                </dd>
              </div>
              <div>
                <dt>Descuento en productos</dt>
                <dd>
                  {confirmation.productDiscountPct}%, ahorras <span className="price">{formatAmount(confirmation.productsSavings)}</span>
                </dd>
              </div>
              <div>
                <dt>Tu selección</dt>
                <dd className="price">{formatAmount(confirmation.subtotal)}</dd>
              </div>
              <div>
                <dt>Ahorro total</dt>
                <dd className="price">{formatAmount(confirmation.savings)}</dd>
              </div>
              <div className="summary-final">
                <dt>Valor con descuento</dt>
                <dd className="price">{formatAmount(confirmation.grandTotal)}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      <div className="confirmation-actions no-print">
        <button type="button" className="primary" onClick={() => window.print()}>
          Imprimir o guardar como PDF
        </button>
        <button type="button" className="link-button" onClick={() => void handleReset()} disabled={resetting}>
          {resetting ? 'Preparando…' : 'Registrar a otra persona'}
        </button>
      </div>

      <p className="countdown-note no-print" role="timer">
        Por tu privacidad, esta pantalla se reiniciará en {formatCountdown(secondsLeft)}.
      </p>
      {resetError && (
        <p className="save-error" role="alert">
          {resetError}
        </p>
      )}
    </section>
  );
}
