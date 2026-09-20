import type { AdminRegistration, AdminRegistrationsResponse, AdminStats } from '@feria/shared';
import { useEffect, useState } from 'react';
import { adminCsvUrl, fetchAdminEvent, fetchAdminRegistrations, fetchAdminStats } from '../../api/adminClient';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatAmount } from '../../utils/currency';
import { formatDayChip } from '../../utils/eventFormat';
import { formatVisit } from './format';
import { RegistrationDetail } from './RegistrationDetail';
import { StatsCards } from './StatsCards';

const PAGE_SIZE = 20;

interface RegistrationsTabProps {
  /** Returns true when the error was a lost session and the parent has dealt with it. */
  onError: (err: unknown) => boolean;
}

export function RegistrationsTab({ onError }: RegistrationsTabProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [dayOptions, setDayOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [page, setPage] = useState({ key: '', offset: 0 });
  const [data, setData] = useState<AdminRegistrationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminRegistration | null>(null);
  const [reload, setReload] = useState(0);

  const q = useDebouncedValue(search.trim(), 300);

  // Paging restarts from the first page whenever a filter changes, without a wasted request
  // for the old page number: the offset only counts while its filters are still the current ones.
  const filterKey = `${q}|${day}`;
  const offset = page.key === filterKey ? page.offset : 0;

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminStats(), fetchAdminEvent()])
      .then(([loadedStats, event]) => {
        if (cancelled) return;
        setStats(loadedStats);
        const days = new Set([...event.days.map((d) => d.date), ...loadedStats.byDay.map((d) => d.date)]);
        setDayOptions([...days].sort());
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminRegistrations({ q, day: day || undefined, limit: PAGE_SIZE, offset })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (cancelled || onError(err)) return;
        setError('No se pudo cargar la lista.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, day, offset, reload, onError]);

  const total = data?.total ?? 0;
  const registrations = data?.registrations ?? [];
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const filtering = Boolean(q || day);

  return (
    <div className="admin-section">
      {stats && <StatsCards stats={stats} />}

      <section className="panel admin-list" aria-labelledby="registrations-heading">
        <div className="admin-toolbar">
          <h2 id="registrations-heading">Registros confirmados</h2>
          <a className="secondary-button" href={adminCsvUrl({ q: q || undefined, day: day || undefined })}>
            Descargar CSV
          </a>
        </div>

        <div className="admin-filters">
          <div className="field">
            <label htmlFor="admin-search">Buscar</label>
            <input
              id="admin-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, apellidos o email"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="admin-day">Día de la visita</label>
            <select id="admin-day" value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">Todos los días</option>
              {dayOptions.map((option) => (
                <option key={option} value={option}>
                  {formatDayChip(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}{' '}
            <button type="button" className="link-button" onClick={() => setReload((n) => n + 1)}>
              Reintentar
            </button>
          </p>
        )}

        {!error && data && registrations.length === 0 && (
          <p className="stat-note">
            {filtering ? 'No hay registros que coincidan con la búsqueda.' : 'Todavía no hay registros confirmados.'}
          </p>
        )}

        {registrations.length > 0 && (
          <table className="admin-table" aria-busy={loading}>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Email</th>
                <th scope="col">Visita</th>
                <th scope="col">Ítems</th>
                <th scope="col">Descuentos</th>
                <th scope="col">Valor con descuento</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr
                  key={registration.confirmationId}
                  className={selected?.confirmationId === registration.confirmationId ? 'row-selected' : undefined}
                  onClick={() => setSelected(registration)}
                >
                  <td data-label="Nombre">
                    <button type="button" className="row-link">
                      {registration.nombre} {registration.apellidos}
                    </button>
                  </td>
                  <td data-label="Email">{registration.email}</td>
                  <td data-label="Visita">
                    {formatVisit(registration.attendAt)}
                    {registration.outOfWindow && <span className="badge badge-warn">Fuera de fechas</span>}
                  </td>
                  <td data-label="Ítems">{registration.items.length}</td>
                  <td data-label="Descuentos">
                    Servicios {registration.serviceDiscountPct}%, productos {registration.productDiscountPct}%
                  </td>
                  <td data-label="Valor con descuento" className="price">
                    {formatAmount(registration.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div className="admin-pager">
            <p className="stat-note" role="status">
              Mostrando {from} a {to} de {total}
            </p>
            <div className="admin-pager-buttons">
              <button
                type="button"
                className="secondary-button"
                disabled={offset === 0 || loading}
                onClick={() => setPage({ key: filterKey, offset: Math.max(0, offset - PAGE_SIZE) })}
              >
                Anterior
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setPage({ key: filterKey, offset: offset + PAGE_SIZE })}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>

      {selected && <RegistrationDetail registration={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
