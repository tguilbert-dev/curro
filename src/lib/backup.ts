import { db } from '../db';
import type { CrossActivity, CrossLog } from '../types';

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

/** Replace all data with the contents of a backup file. */
export async function restoreBackup(text: string): Promise<void> {
  const data = JSON.parse(text);
  if (data?.format !== BACKUP_FORMAT) throw new Error('This is not a Curro backup file. To import a training plan, use the Plan tab.');
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
