import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, type CrossActivity, type CrossLog, type Run, type Settings, type StoredPlan } from './types';

interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie('curro') as Dexie & {
  runs: EntityTable<Run, 'id'>;
  plans: EntityTable<StoredPlan, 'id'>;
  crossActivities: EntityTable<CrossActivity, 'id'>;
  crossLogs: EntityTable<CrossLog, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
};

db.version(1).stores({
  runs: '++id, date',
  plans: '++id, status',
  ptExercises: '++id',
  ptLogs: '++id, date, exerciseId, [date+exerciseId]',
  settings: 'key',
});

// v2: detailed PT exercises became simple daily activities. Any PT history becomes a
// single "PT" activity marked done on every day that had at least one exercise ticked.
db.version(2)
  .stores({
    crossActivities: '++id',
    crossLogs: '++id, date, activityId, [date+activityId]',
  })
  .upgrade(async (tx) => {
    const logs: { date: string }[] = await tx.table('ptLogs').toArray();
    if ((await tx.table('ptExercises').count()) === 0) return;
    const dates = [...new Set(logs.map((l) => l.date))].sort();
    const activityId = await tx.table('crossActivities').add({ name: 'PT', active: true, createdAt: dates[0] ?? '2000-01-01' });
    await tx.table('crossLogs').bulkAdd(dates.map((date) => ({ date, activityId })));
  });

// v3: drop the old PT tables once their data has been copied.
db.version(3).stores({ ptExercises: null, ptLogs: null });

/** undefined while loading, so the app can wait instead of flashing defaults. */
export function useSettings(): Settings | undefined {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  if (!rows) return undefined;
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) (settings as Record<string, unknown>)[row.key] = row.value;
  return settings;
}

/** Mirrored outside IndexedDB so index.html can apply the theme before the first paint. */
export const THEME_KEY = 'curro-theme';

export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  if (key === 'theme') {
    try {
      localStorage.setItem(THEME_KEY, String(value));
    } catch {
      // storage blocked: the theme still applies once the app loads
    }
  }
  return db.settings.put({ key, value });
}

export function useActivePlan(): StoredPlan | undefined | null {
  // undefined while loading, null when there is no active plan.
  return useLiveQuery(async () => (await db.plans.where('status').equals('active').first()) ?? null, []);
}

/** undefined while loading. */
export function useRuns(): Run[] | undefined {
  return useLiveQuery(() => db.runs.orderBy('date').toArray(), []);
}

/** Make the newly imported plan active and archive any previous one. */
export async function activatePlan(plan: StoredPlan) {
  await db.transaction('rw', db.plans, async () => {
    await db.plans.where('status').equals('active').modify({ status: 'archived' });
    await db.plans.add({ ...plan, status: 'active' });
  });
}

/** Ask the browser not to evict our data under storage pressure (important on iOS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
