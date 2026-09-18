import type { AdminRegistration } from '@feria/shared';
import { useState } from 'react';
import { API_URL, ApiUnauthorizedError, fetchAdminRegistrations } from '../api/client';
import { formatAmount } from '../utils/currency';

const PAGE_SIZE = 20;

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState('');
  const [registrations, setRegistrations] = useState<AdminRegistration[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(nextOffset: number) {
    setLoading(true);
    setError(null);
    fetchAdminRegistrations(adminKey, { limit: PAGE_SIZE, offset: nextOffset })
      .then((res) => {
        setRegistrations(res.registrations);
        setTotal(res.total);
        setOffset(res.offset);
      })
      .catch((err: unknown) => {
        setRegistrations(null);
        setError(err instanceof ApiUnauthorizedError ? 'Clave de administrador inválida.' : 'No se pudo cargar la lista.');
      })
      .finally(() => setLoading(false));
  }

  async function handleDownloadCsv() {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/registrations.csv?limit=${total || PAGE_SIZE}&offset=0`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error('csv download failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'registros-confirmados.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el CSV.');
    }
  }

  return (
    <main className="app-shell">
      <section className="panel" aria-labelledby="admin-heading">
        <h2 id="admin-heading">Panel de administración</h2>

        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            load(0);
          }}
        >
          <label htmlFor="admin-key">Clave de administrador</label>
          <input
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !adminKey}>
            {loading ? 'Cargando…' : 'Cargar registros'}
          </button>
        </form>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {registrations && (
          <>
            <p className="field-hint">
              {total} registro{total === 1 ? '' : 's'} confirmado{total === 1 ? '' : 's'}
            </p>

            <div className="catalog-list">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Fecha y hora</th>
                    <th>Ítems</th>
                    <th>Desc. Servicios</th>
                    <th>Desc. Productos</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((registration) => (
                    <tr key={registration.confirmationId}>
                      <td>
                        {registration.nombre} {registration.apellidos}
                      </td>
                      <td>{registration.email}</td>
                      <td>{registration.attendAt ? new Date(registration.attendAt).toLocaleString('es-GT') : '—'}</td>
                      <td>{registration.items.map((item) => item.name).join(', ')}</td>
                      <td>{registration.serviceDiscountPct}%</td>
                      <td>{registration.productDiscountPct}%</td>
                      <td>{formatAmount(registration.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="field-row">
              <button type="button" onClick={() => load(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
                ← Anterior
              </button>
              <button type="button" onClick={() => load(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>
                Siguiente →
              </button>
            </div>

            <button type="button" onClick={() => void handleDownloadCsv()}>
              Descargar CSV
            </button>
          </>
        )}
      </section>
    </main>
  );
}
