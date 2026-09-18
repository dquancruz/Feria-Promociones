import type { CatalogItem, RegistrationConfirmation, RegistrationResponse } from '@feria/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { reloadPage } from './utils/navigation';

vi.mock('./utils/navigation', () => ({ reloadPage: vi.fn() }));

const CATALOG: CatalogItem[] = [
  { id: 's1', type: 'service', name: 'Servicio 1', priceCents: 100_000, active: true },
];

const EMPTY_DRAFT: RegistrationResponse = {
  status: 'draft',
  nombre: '',
  apellidos: '',
  email: '',
  attendAt: null,
  selectedItemIds: [],
};

const ANA_DRAFT: RegistrationResponse = { ...EMPTY_DRAFT, nombre: 'Ana', email: 'ana@example.com' };

const CONFIRMED: RegistrationConfirmation = {
  status: 'confirmed',
  confirmationId: 'aaaaaaaa-0000-0000-0000-000000000000',
  serviceDiscountPct: 0,
  productDiscountPct: 0,
  servicesTotal: 0,
  productsTotal: 0,
  grandTotal: 0,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function installFetchMock(draft: RegistrationResponse) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.startsWith('/api/catalog')) return jsonResponse(200, { items: CATALOG });
    if (url === '/api/registrations/draft') return jsonResponse(200, draft);
    if (url === '/api/registrations/session/reset' && method === 'POST') return jsonResponse(204, null);
    throw new Error(`Unhandled request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof installFetchMock>, method: string, url: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const target = typeof input === 'string' ? input : input.toString();
    return target === url && (init?.method ?? 'GET') === method;
  });
}

beforeEach(() => {
  vi.mocked(reloadPage).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('shared-device privacy', () => {
  describe('restored draft', () => {
    it('lets the next person discard someone else\'s draft from the restore notice', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetchMock(ANA_DRAFT);
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'No soy Ana, empezar de nuevo' }));

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });

    it('offers a generic wording when the restored draft has no name yet', async () => {
      installFetchMock({ ...EMPTY_DRAFT, selectedItemIds: ['s1'] });
      render(<App />);

      expect(await screen.findByRole('button', { name: 'No soy yo, empezar de nuevo' })).toBeInTheDocument();
    });
  });

  describe('"Borrar mis datos" action', () => {
    it('is not shown on an untouched form', async () => {
      installFetchMock(EMPTY_DRAFT);
      render(<App />);

      await screen.findByRole('heading', { name: '1. Ingrese su información' });

      expect(screen.queryByRole('button', { name: 'Borrar mis datos y empezar de nuevo' })).not.toBeInTheDocument();
    });

    it('resets the session and reloads when used', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetchMock(ANA_DRAFT);
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Borrar mis datos y empezar de nuevo' }));

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });

    it('never lets a pending autosave re-create the data it just erased', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetchMock(EMPTY_DRAFT);
      render(<App />);

      await user.type(await screen.findByLabelText('Nombre'), 'Ana');
      // The 800 ms autosave debounce is still pending when the person starts over.
      await user.click(screen.getByRole('button', { name: 'Borrar mis datos y empezar de nuevo' }));
      await waitFor(() => expect(reloadPage).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(callsTo(fetchMock, 'PATCH', '/api/registrations/draft')).toHaveLength(0);
    });
  });

  describe('idle timeout', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_IDLE_TIMEOUT_MIN', '1');
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

    it('asks "¿Sigues ahí?" after the configured time with personal data on the form', async () => {
      installFetchMock(ANA_DRAFT);
      render(<App />);
      await screen.findByLabelText('Nombre');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await advance(60_000);

      const dialog = await screen.findByRole('alertdialog', { name: '¿Sigues ahí?' });
      expect(dialog).toHaveTextContent('1:00');
    });

    it('counts down visibly, and keeps the session when the person answers', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const fetchMock = installFetchMock(ANA_DRAFT);
      render(<App />);
      await screen.findByLabelText('Nombre');
      await advance(60_000);
      const dialog = await screen.findByRole('alertdialog');

      await advance(20_000);
      expect(dialog).toHaveTextContent('0:40');
      await user.click(screen.getByRole('button', { name: 'Sigo aquí' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await advance(60_000);
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(0);
      expect(reloadPage).not.toHaveBeenCalled();
      // ...and the prompt comes back after the next stretch of inactivity.
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    });

    it('resets the session when nobody answers within 60 seconds', async () => {
      const fetchMock = installFetchMock(ANA_DRAFT);
      render(<App />);
      await screen.findByLabelText('Nombre');
      await advance(60_000);
      await screen.findByRole('alertdialog');

      await advance(60_000);

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });

    it('treats any interaction as activity and postpones the prompt', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      installFetchMock(ANA_DRAFT);
      render(<App />);
      const nombre = await screen.findByLabelText('Nombre');

      await advance(45_000);
      await user.type(nombre, 'x');
      await advance(45_000);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('does not bother someone who has not entered any personal data', async () => {
      installFetchMock(EMPTY_DRAFT);
      render(<App />);
      await screen.findByLabelText('Nombre');

      await advance(5 * 60_000);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  describe('confirmation screen', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

    it('shows how long is left before it resets itself', async () => {
      installFetchMock(CONFIRMED);
      render(<App />);

      expect(await screen.findByRole('timer')).toHaveTextContent('2:00');
      await advance(30_000);
      expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    });

    it('resets the session by itself after two minutes', async () => {
      const fetchMock = installFetchMock(CONFIRMED);
      render(<App />);
      await screen.findByRole('timer');

      await advance(120_000);

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });
  });
});
