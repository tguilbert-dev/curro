import { useState, type ReactNode } from 'react';

const KEY = 'curro-sections';

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** A card with a tappable heading that opens and closes it. The choice is remembered per id. */
export function Section({ id, title, defaultOpen, summary, children }: { id: string; title: string; defaultOpen: boolean; summary?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(() => load()[id] ?? defaultOpen);
  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...load(), [id]: next }));
    } catch {
      // storage blocked: still works for this session
    }
  }
  return (
    <section className="card section">
      <details open={open} onToggle={(e) => e.currentTarget.open !== open && toggle(e.currentTarget.open)}>
        <summary>
          <h2>{title}</h2>
          {summary}
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="stack section-body">{children}</div>
      </details>
    </section>
  );
}
