import { useCallback, useRef } from 'react';

/**
 * Horizontal swipe on an element: swipe left → onNext, right → onPrev. Mostly-vertical
 * gestures are ignored so page scrolling keeps working. Plays a short slide on change.
 *
 * Returns a callback ref, so it attaches whenever the element appears (e.g. after data loads).
 */
export function useSwipe<T extends HTMLElement>(onPrev: () => void, onNext: () => void): (el: T | null) => void {
  const handlers = useRef({ onPrev, onNext });
  handlers.current = { onPrev, onNext };
  const detach = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const forward = dx < 0;
      (forward ? handlers.current.onNext : handlers.current.onPrev)();
      el.animate?.([{ transform: `translateX(${forward ? 28 : -28}px)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], {
        duration: 180,
        easing: 'ease-out',
      });
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    detach.current = () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', up);
    };
  }, []);
}
