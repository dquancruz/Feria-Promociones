import { useEffect, useRef } from 'react';

interface DiscountTagProps {
  servicePct: number;
  productPct: number;
  /** Optional stamp over the tag, used on the confirmation screen. */
  stamp?: string;
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function GradeNumber({ value }: { value: number }) {
  const previous = usePrevious(value);
  // Only a percentage that goes up earns the flourish, and only once (the key remounts it).
  const rose = previous !== undefined && value > previous;
  return (
    <span key={value} className={rose ? 'tag-num tag-num-rise' : 'tag-num'}>
      {value}
      <span className="tag-pct">%</span>
    </span>
  );
}

/** The discounts as the "grade" on a fertilizer sack tag: services first, then products,
 * like the 15-15-15 printed on a bag. */
export function DiscountTag({ servicePct, productPct, stamp }: DiscountTagProps) {
  return (
    <div
      className="tag"
      role="group"
      aria-label={`Descuento de ${servicePct}% en servicios y ${productPct}% en productos`}
    >
      <span className="tag-hole" aria-hidden="true" />
      {stamp && <span className="tag-stamp">{stamp}</span>}
      <div className="tag-grade" aria-hidden="true">
        <GradeNumber value={servicePct} />
        <span className="tag-dash">–</span>
        <GradeNumber value={productPct} />
      </div>
      <div className="tag-labels" aria-hidden="true">
        <span>Servicios</span>
        <span>Productos</span>
      </div>
    </div>
  );
}
