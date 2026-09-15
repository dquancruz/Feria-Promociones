import type { RegistrationConfirmation } from '@feria/shared';
import { formatAmount } from '../utils/currency';

interface ConfirmationScreenProps {
  confirmation: RegistrationConfirmation;
}

export function ConfirmationScreen({ confirmation }: ConfirmationScreenProps) {
  return (
    <section className="panel confirmation" aria-labelledby="confirmation-heading">
      <h2 id="confirmation-heading">¡Asistencia confirmada!</h2>
      <p>
        Gracias por confirmar. Prepararemos tu portafolio de promociones personalizado con base en tu selección.
      </p>

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
    </section>
  );
}
