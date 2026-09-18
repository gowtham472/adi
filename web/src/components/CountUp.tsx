import { useEffect, useState } from 'react';

const DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts up to `value` when first shown, easing out. Timing starts on the first painted
 * frame, so a page opened in a background tab counts when it is brought forward. Screen
 * readers get the final value only, and reduced motion shows it at once.
 */
export function CountUp({ value }: { readonly value: number }) {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    let start: number | undefined;
    let frame = 0;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, reduced]);

  if (reduced) {
    return <>{value}</>;
  }
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="visually-hidden">{value}</span>
    </>
  );
}
