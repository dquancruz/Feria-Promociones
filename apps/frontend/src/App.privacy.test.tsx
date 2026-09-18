import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { CONFIRMED, EMPTY_DRAFT, installFetchMock } from './test/mocks';
import { reloadPage } from './utils/navigation';

vi.mock('./utils/navigation', () => ({ reloadPage: vi.fn() }));

const ANA_DRAFT = { ...EMPTY_DRAFT, nombre: 'Ana', email: 'ana@example.com' };

const callsTo = (fetchMock: ReturnType<typeof installFetchMock>, method: string, url: string) =>
  fetchMock.callsTo(method, url);

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
      const fetchMock = installFetchMock({ draft: ANA_DRAFT });
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'No soy Ana, empezar de nuevo' }));

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });

    it('offers a generic wording when the restored draft has no name yet', async () => {
      installFetchMock({ draft: { ...EMPTY_DRAFT, selectedItemIds: ['s1'] } });
      render(<App />);

      expect(await screen.findByRole('button', { name: 'No soy yo, empezar de nuevo' })).toBeInTheDocument();
    });
  });

  describe('"Borrar mis datos" action', () => {
    it('is not shown on an untouched form', async () => {
      installFetchMock({ draft: EMPTY_DRAFT });
      render(<App />);

      await screen.findByRole('heading', { name: 'Tus datos' });

      expect(screen.queryByRole('button', { name: 'Borrar mis datos y empezar de nuevo' })).not.toBeInTheDocument();
    });

    it('resets the session and reloads when used', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetchMock({ draft: ANA_DRAFT });
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Borrar mis datos y empezar de nuevo' }));

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });

    it('never lets a pending autosave re-create the data it just erased', async () => {
      const user = userEvent.setup();
      const fetchMock = installFetchMock({ draft: EMPTY_DRAFT });
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
      installFetchMock({ draft: ANA_DRAFT });
      render(<App />);
      await screen.findByLabelText('Nombre');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await advance(60_000);

      const dialog = await screen.findByRole('alertdialog', { name: '¿Sigues ahí?' });
      expect(dialog).toHaveTextContent('1:00');
    });

    it('counts down visibly, and keeps the session when the person answers', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const fetchMock = installFetchMock({ draft: ANA_DRAFT });
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
      const fetchMock = installFetchMock({ draft: ANA_DRAFT });
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
      installFetchMock({ draft: ANA_DRAFT });
      render(<App />);
      const nombre = await screen.findByLabelText('Nombre');

      await advance(45_000);
      await user.type(nombre, 'x');
      await advance(45_000);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('does not bother someone who has not entered any personal data', async () => {
      installFetchMock({ draft: EMPTY_DRAFT });
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
      installFetchMock({ draft: CONFIRMED });
      render(<App />);

      expect(await screen.findByRole('timer')).toHaveTextContent('2:00');
      await advance(30_000);
      expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    });

    it('resets the session by itself after two minutes', async () => {
      const fetchMock = installFetchMock({ draft: CONFIRMED });
      render(<App />);
      await screen.findByRole('timer');

      await advance(120_000);

      await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
      expect(callsTo(fetchMock, 'POST', '/api/registrations/session/reset')).toHaveLength(1);
    });
  });
});
