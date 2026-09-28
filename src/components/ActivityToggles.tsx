import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../context';
import { db } from '../db';
import { toggleActivity } from '../lib/activities';
import type { ISODate } from '../lib/dates';

/** Tap-to-toggle chips for each active activity on one day. */
export function ActivityToggles({ date }: { date: ISODate }) {
  const { goTo } = useApp();
  const activities = useLiveQuery(() => db.crossActivities.toArray(), []);
  const logs = useLiveQuery(() => db.crossLogs.where('date').equals(date).toArray(), [date]);
  if (!activities || !logs) return null;
  const done = new Set(logs.map((l) => l.activityId));
  // Show archived activities only if they were done that day, so history stays visible.
  const shown = activities.filter((a) => a.active || done.has(a.id!));
  if (shown.length === 0) {
    return (
      <p className="small secondary">
        Track PT, boxing, rowing and more.{' '}
        <button className="btn ghost small" onClick={() => goTo('cross')}>
          Set up cross-training →
        </button>
      </p>
    );
  }
  return (
    <div className="chips" role="group" aria-label="Cross-training done">
      {shown.map((a) => (
        <button key={a.id} className="chip" aria-pressed={done.has(a.id!)} onClick={() => toggleActivity(date, a.id!)}>
          <span className="tick" aria-hidden="true">
            {done.has(a.id!) ? '✓' : ''}
          </span>
          {a.name}
        </button>
      ))}
    </div>
  );
}
