import type { AdminStats } from '@feria/shared';
import { formatDayChip } from '../../utils/eventFormat';

export function StatsCards({ stats }: { stats: AdminStats }) {
  return (
    <section className="stats" aria-label="Resumen">
      <div className="stat-card">
        <h3>Confirmados</h3>
        <p className="stat-number">{stats.confirmedTotal}</p>
        <p className="stat-note">
          {stats.draftsStarted} {stats.draftsStarted === 1 ? 'registro' : 'registros'} sin confirmar
        </p>
      </div>

      <div className="stat-card">
        <h3>Registros por día</h3>
        {stats.byDay.length === 0 ? (
          <p className="stat-note">Todavía no hay registros.</p>
        ) : (
          <ul className="stat-list">
            {stats.byDay.map((entry) => (
              <li key={entry.date}>
                <span>{formatDayChip(entry.date)}</span>
                <strong className="price">{entry.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stat-card">
        <h3>Más solicitados</h3>
        {stats.topItems.length === 0 ? (
          <p className="stat-note">Todavía no hay registros.</p>
        ) : (
          <ol className="stat-list">
            {stats.topItems.map((item) => (
              <li key={`${item.type}-${item.name}`}>
                <span>{item.name}</span>
                <strong className="price">{item.count}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
