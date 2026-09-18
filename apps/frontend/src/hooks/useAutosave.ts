import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiValidationError } from '../api/client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline';

const DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

export interface Autosave {
  status: SaveStatus;
  /** Call after every change: saves shortly after the last one. */
  schedule: () => void;
  /** Saves right now and resolves once the server has it. Rejects if that save fails. */
  flush: () => Promise<void>;
  /** Gives up on anything pending and waits for a request already on the wire. */
  stop: () => Promise<void>;
  /** Undoes `stop`, for when whatever needed autosave off did not go through. */
  resume: () => void;
}

/**
 * Debounced autosave that never has two requests in flight: a change made during a save is
 * sent in one more request when it finishes, and a failed save is retried with growing pauses.
 * `save` must send the whole current form, since only the latest state matters.
 */
export function useAutosave(save: () => Promise<unknown>): Autosave {
  const [status, setStatus] = useState<SaveStatus>('idle');

  const saveRef = useRef(save);
  saveRef.current = save;

  const dirty = useRef(false);
  const stopped = useRef(false);
  const paused = useRef(false);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<Promise<void> | null>(null);
  const wake = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const handle = setTimeout(resolve, ms);
        wake.current = () => {
          clearTimeout(handle);
          resolve();
        };
      }),
    [],
  );

  const runLoop = useCallback((): Promise<void> => {
    if (loop.current) return loop.current;

    loop.current = (async () => {
      try {
        while (dirty.current && !stopped.current && !paused.current) {
          dirty.current = false;
          setStatus('saving');
          try {
            await saveRef.current();
            attempts.current = 0;
          } catch (err) {
            // A rejected value is the person's problem, not the network's: retrying it as is
            // would fail forever. The next edit sends a new one.
            if (!(err instanceof ApiValidationError)) {
              dirty.current = true;
              setStatus('offline');
              const delay = RETRY_DELAYS_MS[Math.min(attempts.current, RETRY_DELAYS_MS.length - 1)];
              attempts.current += 1;
              await sleep(delay);
            }
          }
        }
        if (!stopped.current && !paused.current && !dirty.current) setStatus('saved');
      } finally {
        loop.current = null;
      }
    })();
    return loop.current;
  }, [sleep]);

  const schedule = useCallback(() => {
    if (stopped.current) return;
    dirty.current = true;
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      // A new edit while offline is a good moment to try again straight away.
      wake.current?.();
      void runLoop();
    }, DEBOUNCE_MS);
  }, [clearTimer, runLoop]);

  const flush = useCallback(async () => {
    clearTimer();
    paused.current = true;
    wake.current?.();
    try {
      await loop.current;
      if (stopped.current) return;
      dirty.current = false;
      setStatus('saving');
      await saveRef.current();
      attempts.current = 0;
      setStatus('saved');
    } catch (err) {
      if (!(err instanceof ApiValidationError)) {
        dirty.current = true;
        setStatus('offline');
      }
      throw err;
    } finally {
      paused.current = false;
      if (dirty.current) void runLoop();
    }
  }, [clearTimer, runLoop]);

  const stop = useCallback(async () => {
    stopped.current = true;
    dirty.current = false;
    clearTimer();
    wake.current?.();
    await loop.current;
  }, [clearTimer]);

  const resume = useCallback(() => {
    stopped.current = false;
  }, []);

  useEffect(
    () => () => {
      stopped.current = true;
      clearTimer();
      wake.current?.();
    },
    [clearTimer],
  );

  return { status, schedule, flush, stop, resume };
}
