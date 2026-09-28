import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import schema from '../../schema/curro-plan.v1.schema.json';
import { addDays, isValidDate, startOfWeek, today, weekdayIndex, WEEKDAYS, type ISODate, type Weekday } from './dates';
import { paceToSecPerKm, toKm, type Unit } from './units';
import { isRunningType, type PlannedWorkout, type StoredPlan, type WorkoutType } from '../types';

export { schema as planSchema };

/** Shape of a plan file, mirroring schema/curro-plan.v1.schema.json. */
export interface PlanFileV1 {
  $schema?: string;
  schemaVersion: 1;
  name: string;
  description?: string;
  author?: string;
  units: Unit;
  race: { name: string; date: ISODate; distance: number; goalTime?: string; location?: string };
  paces?: Partial<Record<'easy' | 'long' | 'marathon' | 'threshold' | 'interval' | 'race', string>>;
  weeks: {
    focus?: string;
    notes?: string;
    days: {
      day: Weekday;
      type: WorkoutType;
      distance?: number;
      durationMin?: number;
      title?: string;
      description?: string;
      targetPace?: string;
    }[];
  }[];
}

export type ImportResult =
  | { ok: true; plan: StoredPlan; warnings: string[] }
  | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile<PlanFileV1>(schema);

/**
 * Pull a JSON object out of pasted text. Chatbots often wrap JSON in ``` fences or write an
 * assessment before/after it, so try the whole text, then fenced blocks (largest first),
 * then everything from the first "{" to the last "}".
 */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^﻿/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const fenced = [...cleaned.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
    for (const block of fenced) {
      try {
        return JSON.parse(block);
      } catch {
        // try the next block
      }
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object found in the text.');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function describeError(e: ErrorObject): string {
  const where = e.instancePath ? e.instancePath.replace(/^\//, '').replace(/\//g, ' › ') : 'plan';
  if (e.keyword === 'additionalProperties') {
    return `${where}: unknown field "${(e.params as { additionalProperty: string }).additionalProperty}"`;
  }
  if (e.keyword === 'enum') {
    return `${where}: must be one of ${(e.params as { allowedValues: unknown[] }).allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
  }
  return `${where}: ${e.message ?? 'is invalid'}`;
}

export function parsePlan(text: string, now: ISODate = today()): ImportResult {
  let data: unknown;
  try {
    data = extractJson(text);
  } catch (err) {
    return { ok: false, errors: [`Not valid JSON: ${(err as Error).message}`] };
  }
  return importPlan(data, now);
}

export function importPlan(data: unknown, now: ISODate = today()): ImportResult {
  if (!validate(data)) {
    const errors = (validate.errors ?? []).map(describeError);
    return { ok: false, errors: [...new Set(errors)].slice(0, 25) };
  }
  const file = data;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isValidDate(file.race.date)) errors.push(`race › date: ${file.race.date} is not a real calendar date`);
  file.weeks.forEach((w, i) => {
    const seen = new Set<string>();
    for (const d of w.days) {
      if (seen.has(d.day)) errors.push(`weeks › ${i + 1}: "${d.day}" is listed more than once`);
      seen.add(d.day);
    }
  });
  if (errors.length) return { ok: false, errors };

  const unit = file.units;
  const raceWeekStart = startOfWeek(file.race.date);
  const n = file.weeks.length;
  const weekStart = (i: number) => addDays(raceWeekStart, -7 * (n - 1 - i));

  const workouts: PlannedWorkout[] = [];
  let missingDistance = 0;
  file.weeks.forEach((w, i) => {
    for (const d of w.days) {
      if (isRunningType(d.type) && d.distance == null) missingDistance++;
      workouts.push({
        date: addDays(weekStart(i), WEEKDAYS.indexOf(d.day)),
        type: d.type,
        distanceKm: d.distance != null ? toKm(d.distance, unit) : undefined,
        durationMin: d.durationMin,
        title: d.title,
        description: d.description,
        targetPaceSecPerKm: d.targetPace ? paceToSecPerKm(d.targetPace, unit) ?? undefined : undefined,
        weekIndex: i,
      });
    }
  });

  const raceDay = workouts.find((w) => w.date === file.race.date);
  if (!raceDay) {
    warnings.push(`Race day (${WEEKDAYS[weekdayIndex(file.race.date)]}) isn't in the final week, so it was added automatically.`);
    workouts.push({
      date: file.race.date,
      type: 'race',
      distanceKm: toKm(file.race.distance, unit),
      title: file.race.name,
      weekIndex: n - 1,
    });
  } else if (raceDay.type !== 'race') {
    warnings.push(`Race day is planned as "${raceDay.type}" rather than "race". Check that the final week is really race week.`);
  }
  if (missingDistance) {
    warnings.push(`${missingDistance} running day${missingDistance > 1 ? 's have' : ' has'} no distance, so they won't count toward planned weekly volume.`);
  }
  if (file.race.date < now) warnings.push('The race date is in the past.');

  workouts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const easyPace = file.paces?.easy ? paceToSecPerKm(file.paces.easy, unit) ?? undefined : undefined;
  const plan: StoredPlan = {
    status: 'active',
    importedAt: new Date().toISOString(),
    name: file.name,
    description: file.description,
    author: file.author,
    sourceUnits: unit,
    race: {
      name: file.race.name,
      date: file.race.date,
      distanceKm: toKm(file.race.distance, unit),
      goalTime: file.race.goalTime,
      location: file.race.location,
    },
    easyPaceSecPerKm: easyPace,
    startDate: weekStart(0),
    weeks: file.weeks.map((w, i) => ({ start: weekStart(i), focus: w.focus, notes: w.notes })),
    workouts,
    raw: file,
  };
  return { ok: true, plan, warnings };
}
