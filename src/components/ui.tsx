import { useEffect, type ReactNode } from 'react';
import type { Check, Level } from '../lib/heuristics';
import { DAY_STATUS_LABEL, type DayStatus } from '../lib/stats';
import { categoryOf, TYPE_LABEL, type WorkoutType } from '../types';
import { WorkoutIcon } from './WorkoutIcon';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const LEVEL_ICON: Record<Level, string> = { good: '✓', warning: '!', critical: '!!', info: 'i' };
const LEVEL_WORD: Record<Level, string> = { good: 'OK', warning: 'Caution', critical: 'Too much', info: 'Note' };

export function CheckList({ checks, empty }: { checks: Check[]; empty?: string }) {
  if (checks.length === 0) return <p className="muted small">{empty ?? 'Log some runs to see training checks.'}</p>;
  return (
    <div className="checks">
      {checks.map((c) => (
        <div key={c.id} className={`check lvl-${c.level}`}>
          <span className="icon" aria-hidden="true">
            {LEVEL_ICON[c.level]}
          </span>
          <span className="title">
            {c.title}
            <span className="status-word">{LEVEL_WORD[c.level]}</span>
          </span>
          <span className="value">{c.value}</span>
          <p className="detail">{c.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: DayStatus }) {
  return (
    <span className={`status st-${status}`}>
      <span className="dot" aria-hidden="true" />
      {DAY_STATUS_LABEL[status]}
    </span>
  );
}

export function TypePill({ type }: { type: WorkoutType }) {
  const cat = categoryOf(type);
  return (
    <span className={`pill ${cat ? `cat-${cat}` : ''}`}>
      <WorkoutIcon type={type} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub != null && <span className="sub">{sub}</span>}
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  today: <path d="M4 7h16M4 7v12h16V7M4 7l0-2h16v2M9 3v4M15 3v4M8 12h3v3H8z" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2" />,
  progress: <path d="M5 20V12M10 20V6M15 20V10M20 20V4M3 20h18" />,
  cross: <path d="M6 9v6M18 9v6M3 11v2M21 11v2M6 12h12M9 8v8M15 8v8" />,
  plan: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4L10.7 6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4z" />,
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
