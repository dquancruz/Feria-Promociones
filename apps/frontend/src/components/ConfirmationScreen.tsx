import type { RegistrationConfirmation } from '@feria/shared';
import { useState } from 'react';
import { resetSession } from '../api/client';
import { formatAmount } from '../utils/currency';

interface ConfirmationScreenProps {
  confirmation: RegistrationConfirmation;
}

export function ConfirmationScreen({ confirmation }: ConfirmationScreenProps) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await resetSession();
      // A full reload re-runs the app's initial load against the fresh session
      // the backend just issued, instead of manually clearing every piece of state.
      window.location.reload();
    } catch {
      setResetError('No se pudo iniciar un nuevo registro. Intenta de nuevo.');
      setResetting(false);
    }
  }

  return (
    <section className="panel confirmation" aria-labelledby="confirmation-heading">
      <h2 id="confirmation-heading">¡Asistencia confirmada!</h2>
      <p>
        Gracias por confirmar. Prepararemos tu portafolio de promociones personalizado con base en tu selección.
      </p>

      <div className="ticket">
        <dl className="confirmation-summary">
          <div>
            <dt>Número de confirmación</dt>
            <dd>{confirmation.confirmationId}</dd>
          </div>
          <div>
            <dt>Descuento en Servicios</dt>
            <dd>
              {confirmation.serviceDiscountPct}% — {formatAmount(confirmation.servicesTotal)}
            </dd>
          </div>
          <div>
            <dt>Descuento en Productos</dt>
            <dd>
              {confirmation.productDiscountPct}% — {formatAmount(confirmation.productsTotal)}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatAmount(confirmation.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <button type="button" className="secondary-button" onClick={() => void handleReset()} disabled={resetting}>
        {resetting ? 'Preparando…' : 'Registrar otro cliente'}
      </button>
      {resetError && (
        <p className="save-error" role="alert">
          {resetError}
        </p>
      )}
    </section>
  );
}
