import { forwardRef } from 'react';
import { formatCents } from '../utils/currency';
import type { PreviewTotals } from '../utils/discountPreview';
import { DiscountTag } from './DiscountTag';

interface SummaryCardProps {
  preview: PreviewTotals;
  onConfirm: () => void;
  submitting: boolean;
}

/** The running summary: the discount tag plus what the selection is worth. Not a purchase,
 * so the amounts are labelled as a selection and an estimated saving, never a total. */
export const SummaryCard = forwardRef<HTMLElement, SummaryCardProps>(function SummaryCard(
  { preview, onConfirm, submitting },
  ref,
) {
  const subtotalCents = preview.servicesSubtotalCents + preview.productsSubtotalCents;
  const savingsCents = subtotalCents - preview.grandTotalCents;

  return (
    <section className="summary" aria-label="Resumen de descuentos" ref={ref}>
      <DiscountTag servicePct={preview.serviceDiscountPct} productPct={preview.productDiscountPct} />
      <dl className="summary-rows">
        <div>
          <dt>Tu selección</dt>
          <dd className="price">{formatCents(subtotalCents)}</dd>
        </div>
        <div>
          <dt>Ahorro estimado</dt>
          <dd className="price">{formatCents(savingsCents)}</dd>
        </div>
        <div className="summary-final">
          <dt>Valor con descuento</dt>
          <dd className="price">{formatCents(preview.grandTotalCents)}</dd>
        </div>
      </dl>
      <button type="button" className="primary" onClick={onConfirm} disabled={submitting}>
        {submitting ? 'Confirmando…' : 'Confirmar asistencia'}
      </button>
    </section>
  );
});
