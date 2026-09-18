interface MobileBarProps {
  servicePct: number;
  productPct: number;
  onConfirm: () => void;
  submitting: boolean;
}

/** Compact bar pinned to the bottom on small screens; the full summary replaces it once it scrolls into view. */
export function MobileBar({ servicePct, productPct, onConfirm, submitting }: MobileBarProps) {
  return (
    <div className="mobile-bar" role="region" aria-label="Resumen rápido">
      <p className="mobile-bar-pcts">
        <span>{servicePct}% servicios</span>
        <span>{productPct}% productos</span>
      </p>
      <button type="button" className="primary" onClick={onConfirm} disabled={submitting}>
        Confirmar
      </button>
    </div>
  );
}
