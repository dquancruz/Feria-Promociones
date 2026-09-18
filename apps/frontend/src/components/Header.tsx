import type { EventSettings } from '@feria/shared';
import type { SaveStatus } from '../hooks/useAutosave';
import { formatEventRange } from '../utils/eventFormat';

interface HeaderProps {
  event?: EventSettings | null;
  /** Shown only while the form is being filled in. */
  saveStatus?: SaveStatus;
}

const SAVE_LABELS: Record<Exclude<SaveStatus, 'idle'>, string> = {
  saving: 'Guardando…',
  saved: 'Cambios guardados',
  offline: 'Sin conexión, reintentando',
};

export function Header({ event, saveStatus = 'idle' }: HeaderProps) {
  const when = event ? formatEventRange(event.days) : '';
  const where = event?.location ?? '';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="brand">
          <span className="brand-name">Disagro</span>
          <h1>{event?.name ?? 'Feria de Promociones'}</h1>
        </div>
        <div className="header-meta">
          {(when || where) && <p className="event-when">{[when, where].filter(Boolean).join(', ')}</p>}
          {saveStatus !== 'idle' && (
            <p className={`save-status save-status-${saveStatus}`} role="status">
              {SAVE_LABELS[saveStatus]}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
