import { useEffect, useState, type RefObject } from 'react';

/** Whether the element is at least partly on screen. False where IntersectionObserver
 * doesn't exist, which errs on the side of showing whatever this hides or reveals. */
export function useInView(ref: RefObject<Element>): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}
