import { db } from '../db';
import { addDays, type ISODate } from './dates';
import type { CrossActivity, CrossLog } from '../types';

export const SUGGESTED_ACTIVITIES = ['PT', 'Boxing', 'Rowing'];

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Add an activity by name, or restore it if it's archived. The existence check and the write
 * happen in one transaction, so repeated taps (e.g. queued while the database was stalled)
 * can never create duplicates.
 */
export async function addActivity(name: string, today: ISODate): Promise<'added' | 'restored' | 'exists'> {
  return db.transaction('rw', db.crossActivities, async () => {
    const match = (await db.crossActivities.toArray()).find((a) => sameName(a.name, name));
    if (match?.active) return 'exists';
    if (match) {
      await db.crossActivities.update(match.id!, { active: true });
      return 'restored';
    }
    await db.crossActivities.add({ name: name.trim(), active: true, createdAt: today });
    return 'added';
  });
}

/**
 * Merge activities that share a name (keeping the oldest, and every day ticked on any copy).
 * Returns how many duplicates were removed.
 */
export async function mergeDuplicateActivities(): Promise<number> {
  return db.transaction('rw', db.crossActivities, db.crossLogs, async () => {
    const all = (await db.crossActivities.toArray()).sort((a, b) => a.id! - b.id!);
    const keepers = new Map<string, CrossActivity>();
    let removed = 0;
    for (const a of all) {
      const key = a.name.trim().toLowerCase();
      const keep = keepers.get(key);
      if (!keep) {
        keepers.set(key, a);
        continue;
      }
      const keepDates = new Set((await db.crossLogs.where('activityId').equals(keep.id!).toArray()).map((l) => l.date));
      for (const log of await db.crossLogs.where('activityId').equals(a.id!).toArray()) {
        if (keepDates.has(log.date)) await db.crossLogs.delete(log.id!);
        else {
          await db.crossLogs.update(log.id!, { activityId: keep.id! });
          keepDates.add(log.date);
        }
      }
      if (a.active && !keep.active) await db.crossActivities.update(keep.id!, { active: true });
      if (a.createdAt < keep.createdAt) await db.crossActivities.update(keep.id!, { createdAt: a.createdAt });
      await db.crossActivities.delete(a.id!);
      removed++;
    }
    return removed;
  });
}

export async function toggleActivity(date: ISODate, activityId: number) {
  const match = db.crossLogs.where('[date+activityId]').equals([date, activityId]);
  if (await match.count()) await match.delete();
  else await db.crossLogs.add({ date, activityId });
}

/** Days the activity was done in each Monday-starting week. */
export function daysPerWeek(logs: CrossLog[], activityId: number, weekStarts: ISODate[]): number[] {
  const dates = new Set(logs.filter((l) => l.activityId === activityId).map((l) => l.date));
  return weekStarts.map((ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => dates.has(d)).length);
}

export type Trend = 'up' | 'down' | 'steady';

/** Compare the last 4 complete weeks with the 4 before them. */
export function trend(counts: number[]): { trend: Trend; recentAvg: number; previousAvg: number } {
  const complete = counts.slice(0, -1); // the final entry is the current, partial week
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const recentAvg = avg(complete.slice(-4));
  const previousAvg = avg(complete.slice(-8, -4));
  const diff = recentAvg - previousAvg;
  return { trend: diff >= 0.5 ? 'up' : diff <= -0.5 ? 'down' : 'steady', recentAvg, previousAvg };
}
