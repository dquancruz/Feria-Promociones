import { buildSlots, toAttendAtIso } from '@feria/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { CONFIRMED, EMPTY_DRAFT, installFetchMock, jsonResponse, makeEvent } from './test/mocks';
import { downloadConfirmationPdf } from './utils/confirmationPdf';
import { formatDayChip } from './utils/eventFormat';

vi.mock('./utils/confirmationPdf', () => ({ downloadConfirmationPdf: vi.fn() }));

type User = ReturnType<typeof userEvent.setup>;

const EVENT = makeEvent();
const FIRST_DAY = EVENT.days[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(downloadConfirmationPdf).mockReset();
});

async function fillPersonalData(user: User) {
  await user.type(await screen.findByLabelText('Nombre'), 'Ana');
  await user.type(screen.getByLabelText('Apellidos'), 'Lopez');
  await user.type(screen.getByLabelText('Email'), 'ana@example.com');
}

async function pickVisit(user: User, time = '10:00') {
  await user.click(screen.getByRole('radio', { name: formatDayChip(FIRST_DAY.date) }));
  await user.selectOptions(screen.getByLabelText('Hora'), time);
}

async function fillWholeForm(user: User) {
  await fillPersonalData(user);
  await pickVisit(user);
  await user.click(screen.getByRole('checkbox', { name: /Servicio 1/ }));
}

const tagName = (services: number, products: number) =>
  `Descuento de ${services}% en servicios y ${products}% en productos`;

describe('loading', () => {
  it('shows the event in the header and the two steps of the form', async () => {
    installFetchMock({ event: EVENT });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Qué te interesa' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Feria de Promociones' })).toBeInTheDocument();
    expect(screen.getByText(/Ciudad de Guatemala/)).toBeInTheDocument();
    expect(screen.getByText('Atención al cliente: 2223-2425')).toBeInTheDocument();
  });

  it('takes the header from the configured event, not from fixed text', async () => {
    installFetchMock({ event: makeEvent({ name: 'Expo Agro 2027', location: 'Quetzaltenango' }) });
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Expo Agro 2027' })).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
  });

  it('shows the confirmation directly when the session is already confirmed', async () => {
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    expect(await screen.findByRole('heading', { name: '¡Asistencia confirmada!' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tus datos' })).not.toBeInTheDocument();
  });

  it('offers a retry button when loading fails, and recovers once the network is back', async () => {
    const user = userEvent.setup();
    let failing = true;
    installFetchMock({
      override: (_method, url) => (failing && url === '/api/event' ? jsonResponse(500, {}) : undefined),
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el formulario');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
  });

  it('tells the visitor to wait when the API answers 429', async () => {
    installFetchMock({
      override: (_method, url) => (url === '/api/registrations/draft' ? jsonResponse(429, { error: 'rate_limited' }) : undefined),
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos, espera un momento.');
  });
});

describe('registration closed', () => {
  it.each([
    ['registration is switched off', makeEvent({ registrationOpen: false })],
    ['there are no upcoming days', makeEvent({ days: [] })],
    ['no event has been created', null],
  ])('shows a friendly notice with the phone number when %s', async (_label, event) => {
    installFetchMock({ event });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'El registro aún no está disponible' })).toBeInTheDocument();
    expect(screen.getAllByText('Atención al cliente: 2223-2425').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Tus datos' })).not.toBeInTheDocument();
  });

  it('switches to the notice when the server closes registration during the confirm', async () => {
    const user = userEvent.setup();
    installFetchMock({
      event: EVENT,
      confirm: () => ({ status: 403, body: { error: 'registration_closed' } }),
    });
    render(<App />);
    await fillWholeForm(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByRole('heading', { name: 'El registro aún no está disponible' })).toBeInTheDocument();
  });
});

describe('visit day and time', () => {
  it('only offers the days of the event, as radio chips', async () => {
    installFetchMock({ event: EVENT });
    render(<App />);

    const group = await screen.findByRole('radiogroup', { name: 'Día de la visita' });
    const chips = within(group).getAllByRole('radio');

    expect(chips.map((chip) => chip.textContent)).toEqual(EVENT.days.map((day) => formatDayChip(day.date)));
  });

  it('keeps the time select disabled until a day is chosen', async () => {
    installFetchMock({ event: EVENT });
    render(<App />);

    expect(await screen.findByLabelText('Hora')).toBeDisabled();
  });

  it('offers exactly the slots between opening and closing, so no invalid time can be picked', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await screen.findByLabelText('Hora');

    await user.click(screen.getByRole('radio', { name: formatDayChip(FIRST_DAY.date) }));

    const options = within(screen.getByLabelText('Hora')).getAllByRole('option');
    const offered = options.slice(1).map((option) => (option as HTMLOptionElement).value);
    expect(offered).toEqual(buildSlots(FIRST_DAY, 30));
    expect(offered[0]).toBe('09:00');
    expect(offered.at(-1)).toBe('17:30');
    expect(offered).not.toContain('18:00');
  });

  it('follows the slot length of the event', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: makeEvent({ slotMinutes: 60 }) });
    render(<App />);
    await screen.findByLabelText('Hora');

    await user.click(screen.getByRole('radio', { name: formatDayChip(FIRST_DAY.date) }));

    expect(within(screen.getByLabelText('Hora')).getAllByRole('option')).toHaveLength(1 + 9);
  });

  it('can be driven with the arrow keys', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    const first = await screen.findByRole('radio', { name: formatDayChip(EVENT.days[0].date) });

    first.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: formatDayChip(EVENT.days[1].date) })).toBeChecked();
  });

  it('drops a saved visit that is no longer on offer', async () => {
    installFetchMock({
      event: EVENT,
      draft: { ...EMPTY_DRAFT, nombre: 'Ana', attendAt: toAttendAtIso('2020-01-01', '10:00') },
    });
    render(<App />);

    await screen.findByLabelText('Hora');

    expect(screen.getByLabelText('Hora')).toHaveValue('');
    expect(screen.getByLabelText('Hora')).toBeDisabled();
  });

  it('restores a saved visit that is still valid', async () => {
    installFetchMock({
      event: EVENT,
      draft: { ...EMPTY_DRAFT, nombre: 'Ana', attendAt: toAttendAtIso(FIRST_DAY.date, '10:30') },
    });
    render(<App />);

    await screen.findByLabelText('Hora');

    expect(screen.getByLabelText('Hora')).toHaveValue('10:30');
    expect(screen.getByRole('radio', { name: formatDayChip(FIRST_DAY.date) })).toBeChecked();
  });
});

describe('catalog', () => {
  it('computes the discount tag instantly as items are picked, without waiting on the network', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);
    await screen.findByLabelText('Nombre');
    const requestsBefore = fetchMock.mock.calls.length;

    await user.click(screen.getByRole('checkbox', { name: /Servicio 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Servicio 2/ }));

    // Q1,000 + Q600 = Q1,600 is over Q1,500: two services are already in the 5% tier.
    expect(screen.getByRole('group', { name: tagName(5, 0) })).toBeInTheDocument();
    expect(fetchMock.callsTo('GET', '/api/catalog')).toHaveLength(1);
    expect(fetchMock.mock.calls.length - requestsBefore).toBe(0);
  });

  it('shows the selection, the estimated saving and the value with discount, never a "Total"', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Servicio 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Servicio 2/ }));

    const summary = screen.getByRole('region', { name: 'Resumen de descuentos' });

    expect(within(summary).getByText('Tu selección').nextSibling).toHaveTextContent('Q1,600.00');
    expect(within(summary).getByText('Ahorro estimado').nextSibling).toHaveTextContent('Q80.00');
    expect(within(summary).getByText('Valor con descuento').nextSibling).toHaveTextContent('Q1,520.00');
    expect(screen.queryByText(/^Total/)).not.toBeInTheDocument();
  });

  it('tells what is missing for the next discount level', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);

    expect(await screen.findByText('Elige 2 servicios para obtener 3%.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Servicio 1/ }));
    expect(screen.getByText('Agrega 1 servicio más para obtener 3%.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Diagnóstico/ }));
    // Q1,000 + Q100 = Q1,100: Q400.01 more to pass Q1,500.
    expect(screen.getByText('Te faltan Q400.01 en servicios para subir a 5%.')).toBeInTheDocument();
  });

  it('switches between services and products, counting what is selected in each', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Servicio 1/ }));

    expect(screen.getByRole('tab', { name: /Servicios \(1\)/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Productos' }));

    expect(screen.getByRole('checkbox', { name: /Producto 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Servicio 1/ })).not.toBeInTheDocument();
    expect(screen.getByText('Elige 3 productos para obtener 3%.')).toBeInTheDocument();
  });

  it('searches without caring about accents or case', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);

    await user.type(await screen.findByLabelText('Buscar servicios y productos'), 'DIAGNOSTICO');

    expect(screen.getByRole('checkbox', { name: /Diagnóstico inicial/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Servicio 1/ })).not.toBeInTheDocument();
  });

  it('keeps a selected item as a removable chip after a search hides it', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Servicio 1/ }));

    await user.type(screen.getByLabelText('Buscar servicios y productos'), 'diagnostico');

    expect(screen.queryByRole('checkbox', { name: /Servicio 1/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar Servicio 1' }));
    expect(screen.queryByRole('button', { name: 'Quitar Servicio 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: tagName(0, 0) })).toBeInTheDocument();
  });

  it('shows an empty state with a way to clear the search, and points to results in the other tab', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);

    await user.type(await screen.findByLabelText('Buscar servicios y productos'), 'Producto');

    expect(screen.getByText(/No encontramos servicios para/)).toBeInTheDocument();
    expect(screen.getByText(/Hay 1 resultado en productos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByRole('checkbox', { name: /Servicio 1/ })).toBeInTheDocument();
  });
});

describe('validation', () => {
  it('blocks an empty confirm without calling the API, and focuses the first field with an error', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);
    await screen.findByLabelText('Nombre');

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(fetchMock.callsTo('POST', '/api/registrations/confirm')).toHaveLength(0);
    expect(fetchMock.callsTo('PATCH', '/api/registrations/draft')).toHaveLength(0);
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Apellidos son requeridos', { selector: '.field-error' })).toBeInTheDocument();
  });

  it('lists every problem in an announced summary', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await screen.findByLabelText('Nombre');

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveTextContent('Revisa estos 5 campos');
    expect(within(summary).getAllByRole('button')).toHaveLength(5);
  });

  it('moves focus to the field when its entry in the summary is used', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await screen.findByLabelText('Nombre');
    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Email inválido' }));

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('checks a field when leaving it, and clears the error as soon as it is edited', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    const email = await screen.findByLabelText('Email');

    await user.type(email, 'carla@gmail');
    await user.tab();
    expect(screen.getByText('Email inválido')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-describedby', 'email-error');

    await user.type(email, '.com');
    expect(screen.queryByText('Email inválido')).not.toBeInTheDocument();
  });

  it('asks for a day and a time when the time select is left empty', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: formatDayChip(FIRST_DAY.date) }));

    screen.getByLabelText('Hora').focus();
    await user.tab();

    expect(screen.getByText('Elige un día y una hora.')).toBeInTheDocument();
  });

  it('focuses the first day chip when the visit is the first thing missing', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await fillPersonalData(user);
    await user.click(screen.getByRole('checkbox', { name: /Servicio 1/ }));

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(screen.getByRole('radio', { name: formatDayChip(FIRST_DAY.date) })).toHaveFocus();
  });

  it('shows errors the server still reports, without leaving the form', async () => {
    const user = userEvent.setup();
    installFetchMock({
      event: EVENT,
      confirm: () => ({
        status: 400,
        body: { error: 'validation_failed', fieldErrors: { email: 'Este email ya tiene una asistencia confirmada.' } },
      }),
    });
    render(<App />);
    await fillWholeForm(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByText('Este email ya tiene una asistencia confirmada.', { selector: '.field-error' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
  });

  it('warns to wait when confirming is rate limited', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT, confirm: () => ({ status: 429, body: { error: 'rate_limited' } }) });
    render(<App />);
    await fillWholeForm(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByText('Demasiados intentos, espera un momento.')).toBeInTheDocument();
  });
});

describe('autosave', () => {
  it('sends the visit as the Guatemala time it was picked, in UTC', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);
    await fillWholeForm(user);

    await waitFor(() => expect(fetchMock.patchBodies().length).toBeGreaterThan(0), { timeout: 3000 });

    const last = fetchMock.patchBodies().at(-1);
    expect(last).toMatchObject({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email: 'ana@example.com',
      attendAt: toAttendAtIso(FIRST_DAY.date, '10:00'),
      selectedItemIds: ['s1'],
    });
  });

  it('sends a cleared field as an empty string instead of omitting it', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);

    const nombre = await screen.findByLabelText('Nombre');
    await user.type(nombre, 'Diego');
    await user.clear(nombre);

    await waitFor(() => expect(fetchMock.patchBodies().some((body) => body.nombre === '')).toBe(true), { timeout: 3000 });
  });

  it('never has two saves in flight while the person keeps typing', async () => {
    const user = userEvent.setup({ delay: 30 });
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = installFetchMock({
      event: EVENT,
      override: (method, url) => {
        if (url !== '/api/registrations/draft' || method !== 'PATCH') return undefined;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve(jsonResponse(200, EMPTY_DRAFT));
          }, 1200);
        }) as unknown as Response;
      },
    });
    render(<App />);
    const nombre = await screen.findByLabelText('Nombre');

    await user.type(nombre, 'Ana');
    await waitFor(() => expect(fetchMock.patchBodies()).toHaveLength(1), { timeout: 3000 });
    await user.type(nombre, ' Maria');
    await user.type(screen.getByLabelText('Apellidos'), 'Lopez');
    await waitFor(() => expect(fetchMock.patchBodies().at(-1)).toMatchObject({ nombre: 'Ana Maria', apellidos: 'Lopez' }), {
      timeout: 6000,
    });

    expect(maxInFlight).toBe(1);
  }, 15_000);

  it('shows the real state of the save in the header', async () => {
    const user = userEvent.setup();
    let failing = true;
    installFetchMock({
      event: EVENT,
      override: (method, url) =>
        failing && method === 'PATCH' && url === '/api/registrations/draft' ? jsonResponse(500, {}) : undefined,
    });
    render(<App />);

    await user.type(await screen.findByLabelText('Nombre'), 'Ana');
    expect(await screen.findByText('Sin conexión, reintentando', undefined, { timeout: 3000 })).toBeInTheDocument();

    failing = false;
    await user.type(screen.getByLabelText('Nombre'), 'a');
    expect(await screen.findByText('Cambios guardados', undefined, { timeout: 5000 })).toBeInTheDocument();
  }, 15_000);

  it('saves what was typed last before it asks the server to confirm', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);
    await fillWholeForm(user);

    // Confirm right away, well inside the 800 ms autosave debounce.
    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));
    await screen.findByRole('heading', { name: '¡Asistencia confirmada!' });

    const order = fetchMock.mock.calls
      .map(([input, init]) => `${init?.method ?? 'GET'} ${typeof input === 'string' ? input : input.toString()}`)
      .filter((call) => call.includes('/api/registrations/draft') && call.startsWith('PATCH') || call.includes('/confirm'));
    expect(order.at(-1)).toBe('POST /api/registrations/confirm');
    expect(order.at(-2)).toBe('PATCH /api/registrations/draft');
    expect(fetchMock.patchBodies().at(-1)).toMatchObject({ nombre: 'Ana', selectedItemIds: ['s1'] });
  });
});

describe('confirmation', () => {
  it('shows who is coming, when, what they chose and what they save', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await fillWholeForm(user);

    await user.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByRole('heading', { name: '¡Asistencia confirmada!' })).toBeInTheDocument();
    expect(screen.getByText(/Gracias, Ana\./)).toHaveTextContent('Te esperamos el jueves 12 de marzo a las 10:00.');
    expect(screen.getByRole('group', { name: tagName(5, 0) })).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    const services = screen.getByRole('heading', { name: 'Servicios' }).parentElement as HTMLElement;
    expect(within(services).getByText('Servicio 1')).toBeInTheDocument();
    expect(within(services).getByText('Q1,000.00')).toBeInTheDocument();
    const products = screen.getByRole('heading', { name: 'Productos' }).parentElement as HTMLElement;
    expect(within(products).getByText('Producto 1')).toBeInTheDocument();
    expect(screen.getByText('Valor con descuento').nextSibling).toHaveTextContent('Q1,525.00');
    expect(screen.getByText('Ahorro total').nextSibling).toHaveTextContent('Q80.00');
  });

  it('shows a short readable code with the full confirmation id on hover', async () => {
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    const code = await screen.findByText('ABCDEF12');

    expect(code).toHaveAttribute('title', CONFIRMED.confirmationId);
  });

  it('prints without downloading anything', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Imprimir' }));

    expect(print).toHaveBeenCalledTimes(1);
    expect(downloadConfirmationPdf).not.toHaveBeenCalled();
  });

  it('downloads the confirmation as a PDF without opening the print dialog', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    expect(downloadConfirmationPdf).toHaveBeenCalledWith(CONFIRMED, 'Feria de Promociones');
    expect(print).not.toHaveBeenCalled();
  });

  it('says so when the PDF could not be generated, and keeps printing available', async () => {
    const user = userEvent.setup();
    vi.mocked(downloadConfirmationPdf).mockRejectedValueOnce(new Error('boom'));
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el PDF');
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('offers registering someone else', async () => {
    installFetchMock({ draft: CONFIRMED });
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Registrar a otra persona' })).toBeInTheDocument();
  });
});

describe('small screens', () => {
  it('shows a compact bar with both percentages and a confirm button', async () => {
    const user = userEvent.setup();
    installFetchMock({ event: EVENT });
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Servicio 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Servicio 2/ }));

    const bar = screen.getByRole('region', { name: 'Resumen rápido' });

    expect(within(bar).getByText('5% servicios')).toBeInTheDocument();
    expect(within(bar).getByText('0% productos')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('can confirm from the compact bar too', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock({ event: EVENT });
    render(<App />);
    await fillWholeForm(user);

    await user.click(within(screen.getByRole('region', { name: 'Resumen rápido' })).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('heading', { name: '¡Asistencia confirmada!' })).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/registrations/confirm')).toHaveLength(1);
  });
});
