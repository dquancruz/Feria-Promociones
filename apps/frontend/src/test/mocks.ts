import {
  addDays,
  todayInEventTimezone,
  type CatalogItem,
  type EventSettings,
  type RegistrationConfirmation,
  type RegistrationDraft,
  type RegistrationResponse,
} from '@feria/shared';
import { vi } from 'vitest';

export const CATALOG: CatalogItem[] = [
  { id: 's1', type: 'service', name: 'Servicio 1', priceCents: 100_000, active: true },
  { id: 's2', type: 'service', name: 'Servicio 2', priceCents: 60_000, active: true },
  { id: 's3', type: 'service', name: 'Diagnóstico inicial', priceCents: 10_000, active: true },
  { id: 'p1', type: 'product', name: 'Producto 1', priceCents: 500, active: true },
];

/** An open three-day event starting a week from now, so its slots are always in the future. */
export function makeEvent(overrides: Partial<EventSettings> = {}): EventSettings {
  const first = addDays(todayInEventTimezone(), 7);
  return {
    name: 'Feria de Promociones',
    location: 'Ciudad de Guatemala',
    timezone: 'America/Guatemala',
    registrationOpen: true,
    slotMinutes: 30,
    days: [0, 1, 2].map((offset) => ({ date: addDays(first, offset), opensAt: '09:00', closesAt: '18:00' })),
    ...overrides,
  };
}

export const EMPTY_DRAFT: RegistrationDraft = {
  status: 'draft',
  nombre: '',
  apellidos: '',
  email: '',
  attendAt: null,
  selectedItemIds: [],
};

export const CONFIRMED: RegistrationConfirmation = {
  status: 'confirmed',
  confirmationId: 'abcdef12-0000-0000-0000-000000000000',
  nombre: 'Ana',
  apellidos: 'Lopez',
  attendAt: '2026-03-12T16:00:00.000Z',
  items: [
    { id: 's1', name: 'Servicio 1', type: 'service', priceCents: 100_000 },
    { id: 's2', name: 'Servicio 2', type: 'service', priceCents: 60_000 },
    { id: 'p1', name: 'Producto 1', type: 'product', priceCents: 500 },
  ],
  serviceDiscountPct: 5,
  productDiscountPct: 0,
  servicesSubtotal: 1600,
  productsSubtotal: 5,
  subtotal: 1605,
  servicesSavings: 80,
  productsSavings: 0,
  savings: 80,
  servicesTotal: 1520,
  productsTotal: 5,
  grandTotal: 1525,
};

export function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

export interface MockOptions {
  draft?: RegistrationResponse;
  /** null answers 404, like an API where no event has been created yet. */
  event?: EventSettings | null;
  catalog?: CatalogItem[];
  /** Called for each request; returning a response overrides the default answer. */
  override?: (method: string, url: string, body: unknown) => Response | undefined;
  confirm?: () => { status: number; body: unknown };
}

export type FetchMock = ReturnType<typeof installFetchMock>;

export function installFetchMock(options: MockOptions = {}) {
  const { draft = EMPTY_DRAFT, event = makeEvent(), catalog = CATALOG } = options;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;

    const overridden = options.override?.(method, url, body);
    if (overridden) return overridden;

    if (url.startsWith('/api/catalog')) return jsonResponse(200, { items: catalog });
    if (url === '/api/event') {
      return event ? jsonResponse(200, event) : jsonResponse(404, { error: 'event_not_configured' });
    }
    if (url === '/api/registrations/draft' && method === 'GET') return jsonResponse(200, draft);
    if (url === '/api/registrations/draft' && method === 'PATCH') return jsonResponse(200, draft);
    if (url === '/api/registrations/confirm' && method === 'POST') {
      const result = options.confirm?.() ?? { status: 200, body: CONFIRMED };
      return jsonResponse(result.status, result.body);
    }
    if (url === '/api/registrations/session/reset' && method === 'POST') return jsonResponse(204, null);

    throw new Error(`Unhandled request: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  return Object.assign(fetchMock, {
    callsTo(method: string, url: string) {
      return fetchMock.mock.calls.filter(([input, init]) => {
        const target = typeof input === 'string' ? input : input.toString();
        return target === url && (init?.method ?? 'GET') === method;
      });
    },
    /** Bodies of every autosave PATCH, in order. */
    patchBodies() {
      return this.callsTo('PATCH', '/api/registrations/draft').map(([, init]) => JSON.parse(init?.body as string));
    },
  });
}
