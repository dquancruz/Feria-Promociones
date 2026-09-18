import { useCallback, useEffect, useState } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'] as const;

/** Becomes `idle` after `timeoutMs` with no interaction, while `enabled`. Once idle it stays
 * idle until `dismiss` is called, so activity behind an open prompt doesn't silently cancel it. */
export function useIdleTimeout(enabled: boolean, timeoutMs: number): { idle: boolean; dismiss: () => void } {
  const [idle, setIdle] = useState(false);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    if (!enabled || idle) return;

    let timer = setTimeout(() => setIdle(true), timeoutMs);
    const onActivity = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeoutMs);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [enabled, idle, timeoutMs, restartKey]);

  const dismiss = useCallback(() => {
    setIdle(false);
    setRestartKey((key) => key + 1);
  }, []);

  return { idle, dismiss };
}
