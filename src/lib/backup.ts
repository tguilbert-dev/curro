import { db } from '../db';
import { WORKOUT_TYPES, type CrossActivity, type CrossLog } from '../types';
import { isValidDate } from './dates';

const BACKUP_FORMAT = 'curro-backup';

export async function exportBackup(): Promise<string> {
  const [runs, plans, crossActivities, crossLogs, settings] = await Promise.all([
    db.runs.toArray(), db.plans.toArray(), db.crossActivities.toArray(), db.crossLogs.toArray(), db.settings.toArray(),
  ]);
  return JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), runs, plans, crossActivities, crossLogs, settings }, null, 2);
}

/** Version 1 backups held detailed PT exercises; fold them into one "PT" activity. */
function ptToActivities(ptLogs: { date: string }[] = []): { crossActivities: CrossActivity[]; crossLogs: CrossLog[] } {
  const dates = [...new Set(ptLogs.map((l) => l.date))].sort();
  if (dates.length === 0) return { crossActivities: [], crossLogs: [] };
  return {
    crossActivities: [{ id: 1, name: 'PT', active: true, createdAt: dates[0] }],
    crossLogs: dates.map((date) => ({ date, activityId: 1 })),
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/**
 * Check a parsed backup before anything is replaced. Returns a list of problems (empty if OK),
 * each naming the record, so a damaged or hand-edited file can't half-load.
 */
export function validateBackup(data: unknown): string[] {
  if (!isObj(data) || data.format !== BACKUP_FORMAT) return ['This is not a Curro backup file. To import a training plan, use the Plan tab.'];
  if (data.version !== 1 && data.version !== 2) return [`Unsupported backup version ${String(data.version)}. Update Curro and try again.`];
  const problems: string[] = [];
  const list = (key: string): unknown[] => {
    const v = data[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      problems.push(`"${key}" should be a list.`);
      return [];
    }
    return v;
  };
  const check = (key: string, ok: (x: Record<string, unknown>) => boolean, what: string) =>
    list(key).forEach((x, i) => {
      if (problems.length < 10 && !(isObj(x) && ok(x))) problems.push(`${key} #${i + 1} is not a valid ${what}.`);
    });

  check('runs', (r) => typeof r.date === 'string' && isValidDate(r.date) && isNum(r.distanceKm) && (r.distanceKm as number) > 0 && WORKOUT_TYPES.includes(r.type as never) && (r.durationSec === undefined || isNum(r.durationSec)), 'run');
  check('plans', (p) => (p.status === 'active' || p.status === 'archived') && isObj(p.race) && typeof p.race.date === 'string' && isValidDate(p.race.date) && typeof p.startDate === 'string' && Array.isArray(p.workouts) && Array.isArray(p.weeks), 'plan');
  check('settings', (s) => typeof s.key === 'string', 'setting');
  if (data.version === 1) {
    check('ptLogs', (l) => typeof l.date === 'string' && isValidDate(l.date), 'PT log');
  } else {
    check('crossActivities', (a) => typeof a.name === 'string' && a.name.trim() !== '' && isNum(a.id), 'cross-training activity');
    const ids = new Set(list('crossActivities').filter(isObj).map((a) => a.id));
    check('crossLogs', (l) => typeof l.date === 'string' && isValidDate(l.date) && ids.has(l.activityId), 'cross-training entry');
  }
  if (list('plans').filter((p) => isObj(p) && p.status === 'active').length > 1) problems.push('More than one plan is marked active.');
  return problems;
}

/** Replace all data with the contents of a backup file. Nothing changes unless the whole file is valid. */
export async function restoreBackup(text: string): Promise<void> {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON, so it is not a Curro backup.');
  }
  const problems = validateBackup(data);
  if (problems.length) throw new Error(`Backup not restored; your current data is unchanged. ${problems.join(' ')}`);
  const cross = data.version === 1 ? ptToActivities(data.ptLogs) : { crossActivities: data.crossActivities ?? [], crossLogs: data.crossLogs ?? [] };
  await db.transaction('rw', [db.runs, db.plans, db.crossActivities, db.crossLogs, db.settings], async () => {
    await Promise.all([db.runs.clear(), db.plans.clear(), db.crossActivities.clear(), db.crossLogs.clear(), db.settings.clear()]);
    await db.runs.bulkAdd(data.runs ?? []);
    await db.plans.bulkAdd(data.plans ?? []);
    await db.crossActivities.bulkAdd(cross.crossActivities);
    await db.crossLogs.bulkAdd(cross.crossLogs);
    await db.settings.bulkPut(data.settings ?? []);
  });
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
