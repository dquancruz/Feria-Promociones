import { useEffect, useRef } from 'react';
import { formatCountdown } from '../hooks/useCountdown';

interface IdleModalProps {
  secondsLeft: number;
  onStay: () => void;
  onLeave: () => void;
}

export function IdleModal({ secondsLeft, onStay, onLeave }: IdleModalProps) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop">
      <div className="modal panel" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-body">
        <h2 id="idle-title">¿Sigues ahí?</h2>
        <p id="idle-body">
          Por tu privacidad, borraremos los datos de este formulario en{' '}
          <strong>{formatCountdown(secondsLeft)}</strong> si no respondes.
        </p>
        <div className="modal-actions">
          <button type="button" ref={stayRef} onClick={onStay}>
            Sigo aquí
          </button>
          <button type="button" className="secondary-button" onClick={onLeave}>
            Borrar mis datos ahora
          </button>
        </div>
      </div>
    </div>
  );
}
