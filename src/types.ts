import type { ISODate, WeekStart } from './lib/dates';
import type { Unit } from './lib/units';

export const WORKOUT_TYPES = [
  'easy', 'recovery', 'long', 'tempo', 'intervals', 'hills', 'fartlek',
  'progression', 'race-pace', 'time-trial', 'race', 'cross-training', 'rest',
] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const EASY_TYPES: ReadonlySet<WorkoutType> = new Set(['easy', 'recovery', 'long']);
export const HARD_TYPES: ReadonlySet<WorkoutType> = new Set([
  'tempo', 'intervals', 'hills', 'fartlek', 'progression', 'race-pace', 'time-trial', 'race',
]);
/** Types a logged run can have (a run is always running). */
export const RUN_TYPES: readonly WorkoutType[] = WORKOUT_TYPES.filter((t) => t !== 'rest' && t !== 'cross-training');

export const TYPE_LABEL: Record<WorkoutType, string> = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long run', tempo: 'Tempo', intervals: 'Intervals',
  hills: 'Hills', fartlek: 'Fartlek', progression: 'Progression', 'race-pace': 'Race pace',
  'time-trial': 'Time trial', race: 'Race', 'cross-training': 'Cross-training', rest: 'Rest',
};

export function isRunningType(t: WorkoutType): boolean {
  return EASY_TYPES.has(t) || HARD_TYPES.has(t);
}

/** Colour category for a run. Races count as hard; they get their own icon rather than a colour. */
export type RunCategory = 'easy' | 'long' | 'hard';
export const RUN_CATEGORIES: readonly RunCategory[] = ['easy', 'long', 'hard'];
export const CATEGORY_LABEL: Record<RunCategory, string> = { easy: 'Easy', long: 'Long', hard: 'Hard' };

export function categoryOf(t: WorkoutType): RunCategory | null {
  if (t === 'long') return 'long';
  if (EASY_TYPES.has(t)) return 'easy';
  if (HARD_TYPES.has(t)) return 'hard';
  return null;
}

export interface Run {
  id?: number;
  date: ISODate;
  distanceKm: number;
  durationSec?: number;
  type: WorkoutType;
  notes?: string;
}

export interface PlannedWorkout {
  date: ISODate;
  type: WorkoutType;
  distanceKm?: number;
  durationMin?: number;
  title?: string;
  description?: string;
  targetPaceSecPerKm?: number;
  weekIndex: number;
}

export interface PlanWeekInfo {
  start: ISODate;
  focus?: string;
  notes?: string;
}

export interface StoredPlan {
  id?: number;
  status: 'active' | 'archived';
  importedAt: string;
  name: string;
  description?: string;
  author?: string;
  sourceUnits: Unit;
  race: { name: string; date: ISODate; distanceKm: number; goalTime?: string; location?: string };
  easyPaceSecPerKm?: number;
  startDate: ISODate;
  weeks: PlanWeekInfo[];
  workouts: PlannedWorkout[];
  /** The file exactly as imported, kept so it can be re-exported. */
  raw: unknown;
}

/** Something besides running tracked as a simple "did it today" (PT, boxing, rowing…). */
export interface CrossActivity {
  id?: number;
  name: string;
  active: boolean;
  createdAt: ISODate;
}

/** One row per activity per day it was done. */
export interface CrossLog {
  id?: number;
  date: ISODate;
  activityId: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  units: Unit;
  theme: ThemePref;
  weekStart: WeekStart;
}

export const DEFAULT_SETTINGS: Settings = { units: 'km', theme: 'system', weekStart: 'mon' };
