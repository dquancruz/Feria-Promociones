import { useEffect, useRef, useState } from 'react';

/** Counts down from `seconds` while `active`, calling `onDone` once when it reaches zero.
 * Turning `active` off and on again starts over. */
export function useCountdown(active: boolean, seconds: number, onDone: () => void): number {
  const [remaining, setRemaining] = useState(seconds);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    setRemaining(seconds);
    const deadline = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        onDoneRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [active, seconds]);

  return remaining;
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
