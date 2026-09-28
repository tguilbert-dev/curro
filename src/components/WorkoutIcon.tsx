import type { ReactNode } from 'react';
import type { WorkoutType } from '../types';

const leaf = <path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l6-6" />;

/** One small line icon per workout type. */
const PATHS: Record<WorkoutType, ReactNode> = {
  easy: leaf,
  recovery: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  long: (
    <>
      <path d="M7 20c0-4 10-3 10-8S7 8 7 4" />
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="7" cy="20" r="1.5" />
    </>
  ),
  tempo: <path d="M4 17a8 8 0 1 1 16 0M12 17l4-5" />,
  intervals: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" />,
  hills: <path d="M3 19l6-10 4 6 2.5-3.5L21 19z" />,
  fartlek: <path d="M3 13l4-5 4 9 4-9 4 5" />,
  progression: <path d="M4 18l6-6 4 4 6-8M15 8h5v5" />,
  'race-pace': (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  'time-trial': (
    <>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14v-3.5M10 3h4M12 3v4" />
    </>
  ),
  race: <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />,
  'cross-training': <path d="M6 9v6M18 9v6M3 11v2M21 11v2M6 12h12M9 8v8M15 8v8" />,
  rest: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

export function WorkoutIcon({ type, size = 14 }: { type: WorkoutType; size?: number }) {
  return (
    <svg
      className="wicon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[type]}
    </svg>
  );
}
