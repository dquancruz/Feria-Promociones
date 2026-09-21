import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const CONFIRM_WORD = 'eliminar';

interface DeleteDialogProps {
  title: string;
  /** What is about to be deleted, in plain words (with the number when it is more than one). */
  children: ReactNode;
  confirmLabel: string;
  /** Link to the CSV export, offered because deleting cannot be undone. */
  csvHref: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Deleting registrations cannot be undone, so the admin has to type a word before the button works. */
export function DeleteDialog({ title, children, confirmLabel, csvHref, busy, error, onConfirm, onCancel }: DeleteDialogProps) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  const confirmed = typed.trim().toLowerCase() === CONFIRM_WORD;

  return (
    <div className="modal-backdrop">
      <form
        className="modal panel delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed && !busy) onConfirm();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className="delete-dialog-body">
          {children}
          <p>
            Esta acción no se puede deshacer.{' '}
            <a href={csvHref} className="link-button">
              Descarga el CSV antes
            </a>{' '}
            si necesitas conservar estos datos.
          </p>
        </div>

        <div className="field">
          <label htmlFor={inputId}>Escribe «{CONFIRM_WORD}» para continuar</label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="submit" className="danger" disabled={!confirmed || busy}>
            {busy ? 'Eliminando…' : confirmLabel}
          </button>
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
