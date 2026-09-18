import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiValidationError } from '../api/client';
import { useAutosave } from './useAutosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

/** A save function whose requests stay open until the test settles them, one by one. */
function controllableSave() {
  const pending: { resolve: () => void; reject: (err: unknown) => void }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        pending.push({
          resolve: () => {
            inFlight -= 1;
            resolve();
          },
          reject: (err) => {
            inFlight -= 1;
            reject(err);
          },
        });
      }),
  );
  return { save, pending, maxInFlight: () => maxInFlight };
}

describe('useAutosave', () => {
  it('waits for the person to pause before saving, and saves once for a burst of changes', async () => {
    const { save, pending } = controllableSave();
    const { result } = renderHook(() => useAutosave(save));

    act(() => {
      result.current.schedule();
      result.current.schedule();
    });
    await advance(500);
    act(() => result.current.schedule());
    await advance(500);
    expect(save).not.toHaveBeenCalled();

    await advance(400);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saving');

    await act(async () => pending[0].resolve());
    expect(result.current.status).toBe('saved');
  });

  it('never has two saves in flight: a change made during a save is sent after it finishes', async () => {
    const { save, pending, maxInFlight } = controllableSave();
    const { result } = renderHook(() => useAutosave(save));

    act(() => result.current.schedule());
    await advance(800);
    expect(save).toHaveBeenCalledTimes(1);

    // Edit while the first request is still open, and let its debounce elapse too.
    act(() => result.current.schedule());
    await advance(2000);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => pending[0].resolve());
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => pending[1].resolve());

    expect(maxInFlight()).toBe(1);
    expect(result.current.status).toBe('saved');
  });

  it('reports being offline and retries with growing pauses until the save goes through', async () => {
    const { save, pending } = controllableSave();
    const { result } = renderHook(() => useAutosave(save));

    act(() => result.current.schedule());
    await advance(800);
    await act(async () => pending[0].reject(new Error('network down')));
    expect(result.current.status).toBe('offline');

    await advance(999);
    expect(save).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(2);

    await act(async () => pending[1].reject(new Error('still down')));
    await advance(1999);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(3);

    await act(async () => pending[2].resolve());
    expect(result.current.status).toBe('saved');
  });

  it('does not retry a value the server rejected as invalid', async () => {
    const { save, pending } = controllableSave();
    const { result } = renderHook(() => useAutosave(save));

    act(() => result.current.schedule());
    await advance(800);
    await act(async () => pending[0].reject(new ApiValidationError({ nombre: 'demasiado largo' })));
    await advance(60_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).not.toBe('offline');
  });

  describe('flush', () => {
    it('cancels the pending debounce and saves immediately', async () => {
      const { save, pending } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));
      act(() => result.current.schedule());

      let done = false;
      act(() => {
        void result.current.flush().then(() => (done = true));
      });
      await advance(0);
      expect(save).toHaveBeenCalledTimes(1);
      await act(async () => pending[0].resolve());
      expect(done).toBe(true);

      // The debounce that was pending must not fire a second, redundant save.
      await advance(2000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('waits for the save already in flight before sending its own', async () => {
      const { save, pending, maxInFlight } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));
      act(() => result.current.schedule());
      await advance(800);
      expect(save).toHaveBeenCalledTimes(1);

      let done = false;
      act(() => {
        void result.current.flush().then(() => (done = true));
      });
      await advance(0);
      expect(save).toHaveBeenCalledTimes(1);

      await act(async () => pending[0].resolve());
      expect(save).toHaveBeenCalledTimes(2);
      await act(async () => pending[1].resolve());

      expect(done).toBe(true);
      expect(maxInFlight()).toBe(1);
    });

    it('rejects when the save fails, and keeps retrying in the background', async () => {
      const { save, pending } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));

      let failure: unknown;
      act(() => {
        void result.current.flush().catch((err: unknown) => (failure = err));
      });
      await advance(0);
      await act(async () => pending[0].reject(new Error('down')));

      expect(failure).toBeInstanceOf(Error);
      // The unsaved state is not forgotten: the background retry picks it up.
      expect(save).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('drops a pending save and ignores later changes', async () => {
      const { save } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));
      act(() => result.current.schedule());

      await act(async () => result.current.stop());
      act(() => result.current.schedule());
      await advance(5000);

      expect(save).not.toHaveBeenCalled();
    });

    it('waits for the request already on the wire', async () => {
      const { save, pending } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));
      act(() => result.current.schedule());
      await advance(800);

      let stopped = false;
      act(() => {
        void result.current.stop().then(() => (stopped = true));
      });
      await advance(0);
      expect(stopped).toBe(false);

      await act(async () => pending[0].resolve());
      expect(stopped).toBe(true);
    });

    it('can be resumed if starting over did not go through', async () => {
      const { save, pending } = controllableSave();
      const { result } = renderHook(() => useAutosave(save));
      await act(async () => result.current.stop());

      act(() => result.current.resume());
      act(() => result.current.schedule());
      await advance(800);

      expect(save).toHaveBeenCalledTimes(1);
      await act(async () => pending[0].resolve());
    });
  });
});
