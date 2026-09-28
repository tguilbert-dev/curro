import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { db } from '../db';
import { addActivity, daysPerWeek, SUGGESTED_ACTIVITIES, toggleActivity, trend, type Trend } from '../lib/activities';
import { addDays, formatShort, formatWeekRange, startOfWeek, weekDates, WEEKDAY_SHORT } from '../lib/dates';
import type { CrossActivity } from '../types';
import { useSwipe } from '../components/useSwipe';

const WEEKS = 12;
const TREND_LABEL: Record<Trend, string> = { up: '↑ up', down: '↓ down', steady: '→ steady' };

export function ActivitiesView() {
  const { today } = useApp();
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => (w < thisWeek ? addDays(w, 7) : w));
  const swipeRef = useSwipe<HTMLElement>(prevWeek, nextWeek);
  const activities = useLiveQuery(() => db.crossActivities.toArray(), []);
  // Load back to whichever is earlier: the trend window or the week being viewed.
  const from = [addDays(thisWeek, -7 * WEEKS), weekStart].sort()[0];
  const logs = useLiveQuery(() => db.crossLogs.where('date').aboveOrEqual(from).toArray(), [from]);
  if (!activities || !logs) return null;

  const active = activities.filter((a) => a.active);
  const archived = activities.filter((a) => !a.active);
  const done = new Set(logs.map((l) => `${l.date}|${l.activityId}`));
  const dates = weekDates(weekStart);
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, -7 * (WEEKS - 1 - i)));

  return (
    <>
      {active.length === 0 ? (
        <section className="card empty">
          <h2>Cross-training</h2>
          <p className="secondary">Track anything besides running with one tap a day, and see how often you do it over time.</p>
          <AddActivity existing={activities} />
          <ArchivedList archived={archived} />
        </section>
      ) : (
        <>
          <section className="card swipeable" ref={swipeRef}>
            <div className="week-nav">
              <button className="btn icon" onClick={prevWeek} aria-label="Previous week">
                ‹
              </button>
              <h2>{formatWeekRange(weekStart)}</h2>
              <button className="btn icon" onClick={nextWeek} aria-label="Next week" disabled={weekStart >= thisWeek}>
                ›
              </button>
            </div>
            <div className="act-grid">
              <span />
              {WEEKDAY_SHORT.map((d, i) => (
                <span key={d} className="h" style={dates[i] === today ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                  {d.slice(0, 2)}
                </span>
              ))}
              {active.map((a) => [
                <span key={a.id} className="name" title={a.name}>
                  {a.name}
                </span>,
                ...dates.map((d) => {
                  const isDone = done.has(`${d}|${a.id}`);
                  return (
                    <button
                      key={`${a.id}-${d}`}
                      className={`c ${isDone ? 'done' : ''}`}
                      disabled={d > today}
                      onClick={() => toggleActivity(d, a.id!)}
                      aria-label={`${a.name} on ${d}`}
                      aria-pressed={isDone}
                    >
                      {isDone ? '✓' : ''}
                    </button>
                  );
                }),
              ])}
            </div>
            <p className="small muted">Tap a square to mark a day done. Swipe to change week.</p>
          </section>

          <section className="card">
            <div>
              <h2>Trends</h2>
              <p className="small muted">Days per week, last {WEEKS} weeks</p>
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {active.map((a) => {
                const counts = daysPerWeek(logs, a.id!, weekStarts);
                const t = trend(counts);
                // Until there's at least one complete week, an average or trend means nothing.
                const isNew = a.createdAt >= thisWeek;
                return (
                  <div key={a.id} className="trend-row">
                    <div className="trend-head">
                      <strong>{a.name}</strong>
                      <span className="small secondary num">
                        {counts.at(-1)} this week · {isNew ? 'new' : `${t.recentAvg.toFixed(1)}/wk avg · ${TREND_LABEL[t.trend]}`}
                      </span>
                    </div>
                    <MiniBars counts={counts} weekStarts={weekStarts} name={a.name} />
                  </div>
                );
              })}
            </div>
            <p className="small muted">Average is over the last 4 complete weeks; the trend compares it with the 4 weeks before.</p>
          </section>

          <section className="card">
            <h2>Manage</h2>
            <div className="stack">
              {active.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </div>
            <AddActivity existing={activities} />
            <ArchivedList archived={archived} />
          </section>
        </>
      )}
    </>
  );
}

/** Archived activities, so they can always be restored (even when nothing is active). */
function ArchivedList({ archived }: { archived: CrossActivity[] }) {
  if (archived.length === 0) return null;
  return (
    <details style={{ textAlign: 'left', width: '100%' }}>
      <summary className="small">Archived ({archived.length})</summary>
      <div className="stack" style={{ marginTop: 8 }}>
        {archived.map((a) => (
          <ActivityRow key={a.id} activity={a} />
        ))}
      </div>
    </details>
  );
}

/** Small multiple: one column per week, 0–7 days, shared scale across activities. */
function MiniBars({ counts, weekStarts, name }: { counts: number[]; weekStarts: string[]; name: string }) {
  const H = 44;
  return (
    <div className="minibars" role="img" aria-label={`${name}: ${counts.join(', ')} days per week`}>
      {counts.map((c, i) => (
        <span key={weekStarts[i]} className="mb-col" title={`Week of ${formatShort(weekStarts[i])}: ${c} day${c === 1 ? '' : 's'}`}>
          <span className={`mb-bar ${i === counts.length - 1 ? 'current' : ''}`} style={{ height: c ? Math.max(3, (c / 7) * H) : 0 }} />
        </span>
      ))}
    </div>
  );
}

function ActivityRow({ activity }: { activity: CrossActivity }) {
  const [name, setName] = useState(activity.name);
  const save = () => name.trim() && name.trim() !== activity.name && db.crossActivities.update(activity.id!, { name: name.trim() });
  async function remove() {
    if (!confirm(`Delete "${activity.name}" and all its history? Archive it instead to keep the history.`)) return;
    await db.transaction('rw', db.crossActivities, db.crossLogs, async () => {
      await db.crossLogs.where('activityId').equals(activity.id!).delete();
      await db.crossActivities.delete(activity.id!);
    });
  }
  return (
    <div className="row">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} aria-label="Activity name" style={{ flex: 1, minWidth: 120 }} />
      <button className="btn small" onClick={() => db.crossActivities.update(activity.id!, { active: !activity.active })}>
        {activity.active ? 'Archive' : 'Restore'}
      </button>
      <button className="btn small danger" onClick={remove}>
        Delete
      </button>
    </div>
  );
}

function AddActivity({ existing }: { existing: CrossActivity[] }) {
  const { today } = useApp();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const find = (n: string) => existing.find((a) => a.name.toLowerCase() === n.toLowerCase());

  // Never fail silently: say when a name exists, was restored, is slow to save, or failed.
  async function add(raw: string) {
    const n = raw.trim();
    if (!n || busy) return;
    setBusy(true);
    const slow = setTimeout(
      () => setMessage({ text: 'Still saving… If nothing happens, close the app completely and reopen it.', error: true }),
      2500,
    );
    try {
      const result = await addActivity(n, today);
      const label = find(n)?.name ?? n;
      setMessage(result === 'restored' ? { text: `Restored ${label}, with its history.` } : result === 'exists' ? { text: `${label} is already in your list.` } : null);
      setName('');
    } catch (err) {
      setMessage({ text: `Couldn't save: ${(err as Error).message}. Is this a private window or is site storage blocked?`, error: true });
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    add(name);
  }
  // Archived suggestions stay visible: tapping one restores it.
  const suggestions = SUGGESTED_ACTIVITIES.filter((s) => !find(s)?.active);
  return (
    <div className="stack">
      <form className="row" onSubmit={submit}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New activity, e.g. Boxing" style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" className="btn primary" disabled={!name.trim() || busy}>
          {busy ? 'Saving…' : 'Add'}
        </button>
      </form>
      {message && <p className={`notice small ${message.error ? 'error' : ''}`}>{message.text}</p>}
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" disabled={busy} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
