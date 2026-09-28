import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { db } from '../db';
import { daysPerWeek, SUGGESTED_ACTIVITIES, toggleActivity, trend, type Trend } from '../lib/activities';
import { addDays, formatShort, formatWeekRange, startOfWeek, weekDates, WEEKDAY_SHORT } from '../lib/dates';
import type { CrossActivity } from '../types';

const WEEKS = 12;
const TREND_LABEL: Record<Trend, string> = { up: '↑ up', down: '↓ down', steady: '→ steady' };

export function ActivitiesView() {
  const { today } = useApp();
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const activities = useLiveQuery(() => db.crossActivities.toArray(), []);
  const logs = useLiveQuery(() => db.crossLogs.where('date').aboveOrEqual(addDays(thisWeek, -7 * WEEKS)).toArray(), [thisWeek]);
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
        </section>
      ) : (
        <>
          <section className="card">
            <div className="week-nav">
              <button className="btn icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
                ‹
              </button>
              <h2>{formatWeekRange(weekStart)}</h2>
              <button className="btn icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week" disabled={weekStart >= thisWeek}>
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
            <p className="small muted">Tap a square to mark a day done.</p>
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
            {archived.length > 0 && (
              <details>
                <summary className="small">Archived ({archived.length})</summary>
                <div className="stack" style={{ marginTop: 8 }}>
                  {archived.map((a) => (
                    <ActivityRow key={a.id} activity={a} />
                  ))}
                </div>
              </details>
            )}
          </section>
        </>
      )}
    </>
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
  const taken = new Set(existing.map((a) => a.name.toLowerCase()));
  const add = (n: string) => n.trim() && !taken.has(n.trim().toLowerCase()) && db.crossActivities.add({ name: n.trim(), active: true, createdAt: today });
  function submit(e: FormEvent) {
    e.preventDefault();
    add(name);
    setName('');
  }
  const suggestions = SUGGESTED_ACTIVITIES.filter((s) => !taken.has(s.toLowerCase()));
  return (
    <div className="stack">
      <form className="row" onSubmit={submit}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New activity, e.g. Boxing" style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
