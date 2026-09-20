import { useState, type FormEvent } from 'react';
import { adminLogin, AdminAuthError } from '../../api/adminClient';
import { ApiError } from '../../api/client';

interface AdminLoginProps {
  /** Why the visitor is here again, for example that the session expired. */
  notice?: string;
  onLoggedIn: () => void;
}

export function AdminLogin({ notice, onLoggedIn }: AdminLoginProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminLogin(key);
      onLoggedIn();
    } catch (err) {
      if (err instanceof AdminAuthError) setError('Clave incorrecta.');
      else if (err instanceof ApiError && err.status === 429) setError('Demasiados intentos, espera un momento.');
      else setError('No se pudo iniciar sesión. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <section className="panel admin-login" aria-labelledby="admin-login-heading">
      <h2 id="admin-login-heading">Administración</h2>
      {notice && (
        <p className="restore-banner" role="status">
          {notice}
        </p>
      )}
      <form className="admin-login-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="admin-key">Clave de administrador</label>
          <input
            id="admin-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'admin-key-error' : undefined}
          />
          {error && (
            <p className="field-error" id="admin-key-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="primary" disabled={submitting || !key}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
