import type { AdminRegistration, AdminStats, EventSettings } from '@feria/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from './components/admin/AdminApp';

const EVENT: EventSettings = {
  name: 'Feria de Promociones',
  location: 'Ciudad de Guatemala',
  timezone: 'America/Guatemala',
  registrationOpen: true,
  slotMinutes: 30,
  days: [
    { date: '2026-11-12', opensAt: '09:00', closesAt: '18:00' },
    { date: '2026-11-13', opensAt: '09:00', closesAt: '18:00' },
  ],
};

const STATS: AdminStats = {
  confirmedTotal: 2,
  byDay: [{ date: '2026-11-12', count: 2 }],
  topItems: [{ name: 'Diagnóstico de suelo', type: 'service', count: 2 }],
  draftsStarted: 1,
  outOfWindowCount: 1,
};

const REGISTRATION: AdminRegistration = {
  confirmationId: '8f14e45f-ceea-467a-9575-1e3b1c1d2a10',
  nombre: 'Carla',
  apellidos: 'Méndez',
  email: 'carla@example.com',
  attendAt: '2026-11-12T16:00:00.000Z',
  confirmedAt: '2026-10-01T15:00:00.000Z',
  outOfWindow: true,
  items: [
    { name: 'Diagnóstico de suelo', type: 'service', priceCents: 80000 },
    { name: 'Fertilizante 15-15-15', type: 'product', priceCents: 25000 },
  ],
  serviceDiscountPct: 0,
  productDiscountPct: 0,
  servicesTotal: 80000,
  productsTotal: 25000,
  grandTotal: 105000,
};

interface Options {
  isAdmin?: boolean;
  loginStatus?: number;
  registrationsStatus?: number;
  registrationsError?: string;
  outOfWindowCount?: number;
  registration?: AdminRegistration;
  /** What the stats report as registrations outside the event dates. */
  statsOutOfWindow?: number;
  /** Status the API answers a delete with; anything else than success is an error. */
  deleteStatus?: number;
}

type Call = { method: string; url: string; body?: unknown };

function installAdminFetch(options: Options = {}) {
  const calls: Call[] = [];
  let isAdmin = options.isAdmin ?? true;
  let registrations = [options.registration ?? REGISTRATION];
  let stats = { ...STATS, outOfWindowCount: options.statsOutOfWindow ?? STATS.outOfWindowCount };
  const afterDelete = () => {
    registrations = [];
    stats = { ...STATS, confirmedTotal: 0, byDay: [], topItems: [], outOfWindowCount: 0 };
  };

  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (url === '/api/admin/me') return json(200, { isAdmin });
    if (url === '/api/admin/login') {
      const status = options.loginStatus ?? 204;
      if (status === 204) isAdmin = true;
      return status === 204 ? Promise.resolve(new Response(null, { status })) : json(status, { error: 'unauthorized' });
    }
    if (url === '/api/admin/logout') {
      isAdmin = false;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (method === 'DELETE' && url.startsWith('/api/admin/registrations/')) {
      if (options.deleteStatus) return json(options.deleteStatus, { error: 'not_found' });
      afterDelete();
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (method === 'POST' && url === '/api/admin/registrations/delete-out-of-window') {
      if (options.deleteStatus === 409) return json(409, { error: 'count_changed', count: 3 });
      afterDelete();
      return json(200, { deleted: 1 });
    }
    if (url === '/api/admin/stats') return json(200, stats);
    if (url === '/api/admin/event' && method === 'GET') return json(200, EVENT);
    if (url === '/api/admin/event' && method === 'PUT') {
      const saved = JSON.parse(String(init?.body));
      return json(200, { ...EVENT, ...saved, timezone: EVENT.timezone, outOfWindowCount: options.outOfWindowCount ?? 0 });
    }
    if (url.startsWith('/api/admin/registrations')) {
      if (options.registrationsStatus && options.registrationsStatus !== 200) {
        return json(options.registrationsStatus, { error: options.registrationsError });
      }
      return json(200, { registrations, total: registrations.length, limit: 20, offset: 0 });
    }
    return json(404, {});
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin login', () => {
  it('shows the login form when there is no admin session', async () => {
    installAdminFetch({ isAdmin: false });
    render(<AdminApp />);

    expect(await screen.findByLabelText('Clave de administrador')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('rejects a wrong key with a clear message', async () => {
    const user = userEvent.setup();
    installAdminFetch({ isAdmin: false, loginStatus: 401 });
    render(<AdminApp />);

    await user.type(await screen.findByLabelText('Clave de administrador'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Clave incorrecta.')).toBeInTheDocument();
  });

  it('opens the panel after a correct key and goes back to the login on logout', async () => {
    const user = userEvent.setup();
    installAdminFetch({ isAdmin: false });
    render(<AdminApp />);

    await user.type(await screen.findByLabelText('Clave de administrador'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Registros confirmados' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByLabelText('Clave de administrador')).toBeInTheDocument();
  });

  it('returns to the login with a notice when the session expires', async () => {
    installAdminFetch({ registrationsStatus: 401, registrationsError: 'session_expired' });
    render(<AdminApp />);

    expect(await screen.findByText('Tu sesión de administrador expiró.')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave de administrador')).toBeInTheDocument();
  });
});

describe('registrations tab', () => {
  it('lists registrations with the stats and marks visits outside the event dates', async () => {
    installAdminFetch();
    render(<AdminApp />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Carla Méndez')).toBeInTheDocument();
    expect(within(table).getByText('Fuera de fechas')).toBeInTheDocument();
    expect(screen.getByText('Más solicitados')).toBeInTheDocument();
  });

  it('opens a detail panel with the items grouped by type', async () => {
    const user = userEvent.setup();
    installAdminFetch();
    render(<AdminApp />);

    await user.click(await screen.findByRole('button', { name: 'Carla Méndez' }));

    const detail = screen.getByRole('dialog', { name: 'Detalle de Carla Méndez' });
    expect(within(detail).getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: 'Productos' })).toBeInTheDocument();
    expect(within(detail).getByText('Fertilizante 15-15-15')).toBeInTheDocument();
  });

  it('says so in the detail panel when the person chose no services or products', async () => {
    const user = userEvent.setup();
    installAdminFetch({ registration: { ...REGISTRATION, items: [], servicesTotal: 0, productsTotal: 0, grandTotal: 0 } });
    render(<AdminApp />);

    await user.click(await screen.findByRole('button', { name: 'Carla Méndez' }));

    const detail = screen.getByRole('dialog', { name: 'Detalle de Carla Méndez' });
    expect(within(detail).getByText('No eligió servicios ni productos.')).toBeInTheDocument();
  });

  it('sends the search term to the API and keeps it in the CSV link', async () => {
    const user = userEvent.setup();
    const { calls } = installAdminFetch();
    render(<AdminApp />);

    await user.type(await screen.findByLabelText('Buscar'), 'carla');

    await waitFor(() =>
      expect(calls.some((call) => call.url.startsWith('/api/admin/registrations?') && call.url.includes('q=carla'))).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Descargar CSV' })).toHaveAttribute(
        'href',
        '/api/admin/registrations.csv?q=carla',
      ),
    );
  });
});

describe('event tab', () => {
  async function openEventTab() {
    const user = userEvent.setup();
    render(<AdminApp />);
    await user.click(await screen.findByRole('tab', { name: 'Evento' }));
    await screen.findByLabelText('Nombre del evento');
    return user;
  }

  it('saves the event and warns how many confirmed registrations fall outside the new dates', async () => {
    const { calls } = installAdminFetch({ outOfWindowCount: 3 });
    const user = await openEventTab();

    await user.clear(screen.getByLabelText('Lugar'));
    await user.type(screen.getByLabelText('Lugar'), 'Expo Center');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('Cambios guardados. 3 registros confirmados quedan fuera de las nuevas fechas. No se modificaron.'),
    ).toBeInTheDocument();
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).toMatchObject({ location: 'Expo Center', slotMinutes: 30, registrationOpen: true });
  });

  it('asks for confirmation before removing a day that already has registrations', async () => {
    const { calls } = installAdminFetch();
    const user = await openEventTab();

    await user.click(screen.getByRole('button', { name: 'Quitar día 1' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Vas a quitar 1 día que ya tienen 2 registros');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Guardar de todos modos' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  });

  it('does not save a day whose closing time is not after the opening time', async () => {
    const { calls } = installAdminFetch();
    const user = await openEventTab();

    const closes = screen.getByLabelText('Cierre', { selector: '#day-closes-1' });
    await user.clear(closes);
    await user.type(closes, '08:00');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('El cierre debe ser posterior a la apertura')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});

describe('deleting registrations', () => {
  const deleteCalls = (calls: Call[]) => calls.filter((call) => call.method === 'DELETE');
  const typeWord = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, word: string) =>
    user.type(within(dialog).getByLabelText(/Escribe «eliminar»/), word);

  async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Carla Méndez' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar registro' }));
    return screen.getByRole('alertdialog');
  }

  it('asks the admin to type a word before the delete button works', async () => {
    const user = userEvent.setup();
    installAdminFetch();
    render(<AdminApp />);
    const dialog = await openDeleteDialog(user);

    const confirm = within(dialog).getByRole('button', { name: 'Eliminar registro' });
    expect(confirm).toBeDisabled();
    expect(dialog).toHaveTextContent('Carla Méndez');
    expect(within(dialog).getByRole('link', { name: 'Descarga el CSV antes' })).toHaveAttribute(
      'href',
      '/api/admin/registrations.csv',
    );

    await typeWord(user, dialog, 'elimin');
    expect(confirm).toBeDisabled();
    await typeWord(user, dialog, 'ar');
    expect(confirm).toBeEnabled();
  });

  it('deletes the registration once confirmed, and refreshes the list and the counters', async () => {
    const user = userEvent.setup();
    const { calls } = installAdminFetch();
    render(<AdminApp />);
    const dialog = await openDeleteDialog(user);

    await typeWord(user, dialog, 'Eliminar');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar registro' }));

    expect(await screen.findByText('Registro eliminado.')).toBeInTheDocument();
    expect(deleteCalls(calls).map((call) => call.url)).toEqual([
      `/api/admin/registrations/${REGISTRATION.confirmationId}`,
    ]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Todavía no hay registros confirmados.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Detalle de Carla Méndez' })).not.toBeInTheDocument();
  });

  it('does nothing when the admin cancels', async () => {
    const user = userEvent.setup();
    const { calls } = installAdminFetch();
    render(<AdminApp />);
    const dialog = await openDeleteDialog(user);

    await typeWord(user, dialog, 'eliminar');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteCalls(calls)).toHaveLength(0);
    expect(screen.getByRole('table')).toHaveTextContent('Carla Méndez');
  });

  it('says so when the registration was already gone', async () => {
    const user = userEvent.setup();
    installAdminFetch({ deleteStatus: 404 });
    render(<AdminApp />);
    const dialog = await openDeleteDialog(user);

    await typeWord(user, dialog, 'eliminar');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar registro' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ese registro ya no existe.');
  });

  it('offers the bulk delete only when some registrations are outside the event dates', async () => {
    installAdminFetch({ statsOutOfWindow: 0 });
    render(<AdminApp />);

    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: /Eliminar registros fuera de fechas/ })).not.toBeInTheDocument();
  });

  it('deletes the registrations outside the event dates, sending the number it showed', async () => {
    const user = userEvent.setup();
    const { calls } = installAdminFetch();
    render(<AdminApp />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar registros fuera de fechas (1)' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Vas a eliminar 1 registro confirmado');
    await typeWord(user, dialog, 'eliminar');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar 1' }));

    expect(await screen.findByText('1 registro eliminado.')).toBeInTheDocument();
    const bulk = calls.find((call) => call.url === '/api/admin/registrations/delete-out-of-window');
    expect(bulk?.body).toEqual({ expectedCount: 1 });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Eliminar registros fuera de fechas/ })).not.toBeInTheDocument(),
    );
  });

  it('deletes nothing and explains it when the number changed in the meantime', async () => {
    const user = userEvent.setup();
    installAdminFetch({ deleteStatus: 409 });
    render(<AdminApp />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar registros fuera de fechas (1)' }));
    const dialog = screen.getByRole('alertdialog');
    await typeWord(user, dialog, 'eliminar');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar 1' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La cantidad cambió');
    expect(screen.queryByText('1 registro eliminado.')).not.toBeInTheDocument();
  });
});
