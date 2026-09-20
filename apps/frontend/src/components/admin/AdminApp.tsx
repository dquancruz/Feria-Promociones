import { useCallback, useEffect, useState } from 'react';
import { AdminAuthError, adminLogout, fetchAdminSession } from '../../api/adminClient';
import '../../admin.css';
import { AdminLogin } from './AdminLogin';
import { EventTab } from './EventTab';
import { RegistrationsTab } from './RegistrationsTab';

type Session = 'checking' | 'login' | 'ready';
type Tab = 'registros' | 'evento';

const EXPIRED_NOTICE = 'Tu sesión de administrador expiró.';

export function AdminApp() {
  const [session, setSession] = useState<Session>('checking');
  const [notice, setNotice] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>('registros');
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSession()
      .then((isAdmin) => {
        if (!cancelled) setSession(isAdmin ? 'ready' : 'login');
      })
      .catch(() => {
        if (!cancelled) {
          setCheckFailed(true);
          setSession('login');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any admin call that finds the session gone sends the person back to the login.
  const handleAuthError = useCallback((err: unknown): boolean => {
    if (!(err instanceof AdminAuthError)) return false;
    setNotice(err.expired ? EXPIRED_NOTICE : undefined);
    setSession('login');
    return true;
  }, []);

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      setNotice(undefined);
      setSession('login');
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            <span className="brand-name">Disagro</span>
            <h1>Feria de Promociones, administración</h1>
          </div>
          {session === 'ready' && (
            <button type="button" className="header-button" onClick={() => void handleLogout()}>
              Cerrar sesión
            </button>
          )}
        </div>
      </header>

      <main className="admin-shell">
        {session === 'checking' && <p role="status">Cargando…</p>}

        {session === 'login' && (
          <>
            {checkFailed && (
              <p className="save-error" role="alert">
                No se pudo comprobar tu sesión. Verifica tu conexión.
              </p>
            )}
            <AdminLogin
              notice={notice}
              onLoggedIn={() => {
                setNotice(undefined);
                setCheckFailed(false);
                setSession('ready');
              }}
            />
          </>
        )}

        {session === 'ready' && (
          <>
            <div className="tabs" role="tablist" aria-label="Secciones">
              {(['registros', 'evento'] as const).map((name) => (
                <button
                  key={name}
                  id={`admin-tab-${name}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  aria-controls={`admin-panel-${name}`}
                  className={tab === name ? 'tab tab-active' : 'tab'}
                  onClick={() => setTab(name)}
                >
                  {name === 'registros' ? 'Registros' : 'Evento'}
                </button>
              ))}
            </div>
            <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
              {tab === 'registros' ? (
                <RegistrationsTab onError={handleAuthError} />
              ) : (
                <EventTab onError={handleAuthError} />
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
