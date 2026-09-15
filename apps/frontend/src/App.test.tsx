import type { CatalogItem, RegistrationConfirmation, RegistrationResponse } from '@feria/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const CATALOG: CatalogItem[] = [
  { id: 's1', type: 'service', name: 'Servicio 1', priceCents: 100_000, active: true },
  { id: 's2', type: 'service', name: 'Servicio 2', priceCents: 60_000, active: true },
  { id: 'p1', type: 'product', name: 'Producto 1', priceCents: 500, active: true },
];

const DRAFT: RegistrationResponse = {
  status: 'draft',
  nombre: '',
  apellidos: '',
  email: '',
  attendAt: null,
  selectedItemIds: [],
};

interface Handlers {
  confirm?: () => { status: number; body: unknown };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function installFetchMock(handlers: Handlers = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.startsWith('/api/catalog')) {
      return jsonResponse(200, { items: CATALOG });
    }
    if (url === '/api/registrations/draft' && method === 'GET') {
      return jsonResponse(200, DRAFT);
    }
    if (url === '/api/registrations/draft' && method === 'PATCH') {
      return jsonResponse(200, DRAFT);
    }
    if (url === '/api/registrations/confirm' && method === 'POST') {
      const result = handlers.confirm?.() ?? {
        status: 200,
        body: {
          status: 'confirmed',
          confirmationId: 'aaaaaaaa-0000-0000-0000-000000000000',
          serviceDiscountPct: 0,
          productDiscountPct: 0,
          servicesTotal: 0,
          productsTotal: 0,
          grandTotal: 0,
        } satisfies RegistrationConfirmation,
      };
      return jsonResponse(result.status, result.body);
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('loads the draft and catalog, then renders the two-panel form', async () => {
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '1. Ingrese su información' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Seleccione Servicios y Productos de su interés' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Servicio 1/ })).toBeInTheDocument();
  });

  it('shows the confirmation screen directly when the session is already confirmed', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/catalog')) return jsonResponse(200, { items: CATALOG });
      if (url === '/api/registrations/draft' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse(200, {
          status: 'confirmed',
          confirmationId: 'bbbbbbbb-0000-0000-0000-000000000000',
          serviceDiscountPct: 5,
          productDiscountPct: 0,
          servicesTotal: 1520,
          productsTotal: 0,
          grandTotal: 1520,
        } satisfies RegistrationConfirmation);
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '¡Asistencia confirmada!' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '1. Ingrese su información' })).not.toBeInTheDocument();
  });

  it('computes the services discount preview instantly as items are toggled, without waiting on the network', async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await screen.findByRole('checkbox', { name: /Servicio 1/ });

    await user.click(screen.getByRole('checkbox', { name: /Servicio 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Servicio 2/ }));

    // Q1000 + Q600 = Q1600 > Q1,500, so two services cross into the 5% tier.
    await waitFor(() => expect(screen.getByText('5%')).toBeInTheDocument());
  });

  it('shows field errors from a failed confirm without leaving the form', async () => {
    const user = userEvent.setup();
    installFetchMock({
      confirm: () => ({
        status: 400,
        body: {
          error: 'validation_failed',
          fieldErrors: {
            nombre: 'Nombre es requerido',
            selectedItemIds: 'Selecciona al menos un servicio o producto',
          },
        },
      }),
    });
    render(<App />);

    await screen.findByRole('button', { name: /CONFIRMAR ASISTENCIA/ });
    await user.click(screen.getByRole('button', { name: /CONFIRMAR ASISTENCIA/ }));

    expect(await screen.findByText('Nombre es requerido')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Ingrese su información' })).toBeInTheDocument();
  });

  it('shows the confirmation screen after a successful confirm', async () => {
    const user = userEvent.setup();
    installFetchMock({
      confirm: () => ({
        status: 200,
        body: {
          status: 'confirmed',
          confirmationId: 'cccccccc-0000-0000-0000-000000000000',
          serviceDiscountPct: 5,
          productDiscountPct: 0,
          servicesTotal: 1520,
          productsTotal: 0,
          grandTotal: 1520,
        } satisfies RegistrationConfirmation,
      }),
    });
    render(<App />);

    await screen.findByRole('button', { name: /CONFIRMAR ASISTENCIA/ });
    await user.click(screen.getByRole('button', { name: /CONFIRMAR ASISTENCIA/ }));

    expect(await screen.findByRole('heading', { name: '¡Asistencia confirmada!' })).toBeInTheDocument();
    expect(screen.getByText('cccccccc-0000-0000-0000-000000000000')).toBeInTheDocument();
    expect(screen.getByText('Q1520.00')).toBeInTheDocument();
  });
});
