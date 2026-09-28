import { addDays, type ISODate } from './dates';
import { isRunningType, type PlannedWorkout, type Run, type WorkoutType } from '../types';

/** Anything with a date, distance and type: a logged run or a planned workout. */
export interface Activity {
  date: ISODate;
  distanceKm: number;
  type: WorkoutType;
  durationSec?: number;
}

export function plannedAsActivities(workouts: PlannedWorkout[]): Activity[] {
  return workouts
    .filter((w) => isRunningType(w.type) && (w.distanceKm ?? 0) > 0)
    .map((w) => ({ date: w.date, distanceKm: w.distanceKm!, type: w.type }));
}

/** Running activities with from <= date < to. */
export function between<T extends Activity>(list: T[], from: ISODate, to: ISODate): T[] {
  return list.filter((a) => a.date >= from && a.date < to && isRunningType(a.type));
}

export function sumKm(list: Activity[]): number {
  return list.reduce((acc, a) => acc + a.distanceKm, 0);
}

export function weekVolume(list: Activity[], weekStart: ISODate): number {
  return sumKm(between(list, weekStart, addDays(weekStart, 7)));
}

export function groupByDate<T extends { date: ISODate }>(list: T[]): Map<ISODate, T[]> {
  const map = new Map<ISODate, T[]>();
  for (const item of list) {
    const bucket = map.get(item.date);
    if (bucket) bucket.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}

export function paceSecPerKm(run: Run): number | undefined {
  return run.durationSec && run.distanceKm > 0 ? run.durationSec / run.distanceKm : undefined;
}

export type DayStatus = 'done' | 'partial' | 'missed' | 'upcoming' | 'today' | 'rest' | 'extra' | 'cross';

/** How a day went against the plan. */
export function dayStatus(date: ISODate, planned: PlannedWorkout | undefined, runs: Run[], now: ISODate): DayStatus {
  const ranKm = sumKm(runs.filter((r) => isRunningType(r.type)));
  const plannedRun = planned && isRunningType(planned.type);
  if (!plannedRun) {
    if (ranKm > 0) return 'extra';
    return planned?.type === 'cross-training' ? 'cross' : 'rest';
  }
  const target = planned.distanceKm ?? 0;
  if (ranKm > 0) return target === 0 || ranKm >= target * 0.9 ? 'done' : 'partial';
  if (date === now) return 'today';
  return date < now ? 'missed' : 'upcoming';
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  done: 'Done',
  partial: 'Partly done',
  missed: 'Missed',
  upcoming: 'Planned',
  today: 'Today',
  rest: 'Rest',
  extra: 'Unplanned run',
  cross: 'Cross-training',
};
