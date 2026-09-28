import { db } from '../db';
import { addDays, type ISODate } from './dates';
import type { CrossLog } from '../types';

export const SUGGESTED_ACTIVITIES = ['PT', 'Boxing', 'Rowing'];

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
