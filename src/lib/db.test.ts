import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { activatePlan, db } from '../db';
import { addActivity, mergeDuplicateActivities, toggleActivity } from './activities';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { importPlan } from './plan';
import type { StoredPlan } from '../types';

const example = JSON.parse(readFileSync('examples/half-marathon-12-weeks.json', 'utf8'));
const samplePlan = () => (importPlan(example, '2026-09-27') as { ok: true; plan: StoredPlan }).plan;
const names = async () => (await db.crossActivities.toArray()).map((a) => `${a.name}${a.active ? '' : ' (archived)'}`);

beforeEach(async () => {
  await db.transaction('rw', [db.runs, db.plans, db.crossActivities, db.crossLogs, db.settings], async () => {
    await Promise.all([db.runs.clear(), db.plans.clear(), db.crossActivities.clear(), db.crossLogs.clear(), db.settings.clear()]);
  });
});

describe('cross-training activities', () => {
  it('adds, reports existing names (any case) and restores archived ones', async () => {
    expect(await addActivity('Boxing', '2026-09-27')).toBe('added');
    expect(await addActivity('  boxing ', '2026-09-27')).toBe('exists');
    const boxing = (await db.crossActivities.toArray())[0];
    await db.crossActivities.update(boxing.id!, { active: false });
    expect(await addActivity('BOXING', '2026-09-27')).toBe('restored');
    expect(await names()).toEqual(['Boxing']);
  });

  it('never creates duplicates from simultaneous adds', async () => {
    await Promise.all(Array.from({ length: 15 }, () => addActivity('Rowing', '2026-09-27')));
    expect(await names()).toEqual(['Rowing']);
  });

  it('merges duplicates, keeping every ticked day once', async () => {
    const ids = (await db.crossActivities.bulkAdd(
      [
        { name: 'Rowing', active: true, createdAt: '2026-09-20' },
        { name: 'rowing', active: true, createdAt: '2026-09-10' },
        { name: 'Rowing ', active: false, createdAt: '2026-09-25' },
        { name: 'PT', active: true, createdAt: '2026-09-01' },
      ],
      { allKeys: true },
    )) as number[];
    await db.crossLogs.bulkAdd([
      { date: '2026-09-21', activityId: ids[0] },
      { date: '2026-09-21', activityId: ids[1] }, // same day on two copies
      { date: '2026-09-22', activityId: ids[2] },
      { date: '2026-09-23', activityId: ids[3] },
    ]);
    expect(await mergeDuplicateActivities()).toBe(2);
    const acts = await db.crossActivities.toArray();
    expect(acts.map((a) => a.name)).toEqual(['Rowing', 'PT']);
    expect(acts[0].createdAt).toBe('2026-09-10'); // earliest copy's start date
    const rowingDays = (await db.crossLogs.where('activityId').equals(ids[0]).toArray()).map((l) => l.date).sort();
    expect(rowingDays).toEqual(['2026-09-21', '2026-09-22']);
    expect(await mergeDuplicateActivities()).toBe(0);
  });

  it('toggles a day on and off, and simultaneous taps never double-log', async () => {
    const id = (await db.crossActivities.add({ name: 'PT', active: true, createdAt: '2026-09-01' })) as number;
    await toggleActivity('2026-09-27', id);
    expect(await db.crossLogs.count()).toBe(1);
    await toggleActivity('2026-09-27', id);
    expect(await db.crossLogs.count()).toBe(0);
    await Promise.all([toggleActivity('2026-09-28', id), toggleActivity('2026-09-28', id), toggleActivity('2026-09-28', id)]);
    expect(await db.crossLogs.count()).toBeLessThanOrEqual(1);
  });
});

describe('plans', () => {
  it('activating a plan archives the previous one', async () => {
    await activatePlan(samplePlan());
    await activatePlan({ ...samplePlan(), name: 'Second' });
    const plans = await db.plans.toArray();
    expect(plans.map((p) => `${p.name}:${p.status}`)).toEqual(['12-week half marathon, sub 1:55:archived', 'Second:active']);
  });
});

describe('backups', () => {
  async function seed() {
    await db.runs.bulkAdd([
      { date: '2026-09-22', distanceKm: 5, type: 'easy' },
      { date: '2026-09-27', distanceKm: 10, type: 'long', durationSec: 3600 },
    ]);
    await activatePlan(samplePlan());
    const pt = (await db.crossActivities.add({ name: 'PT', active: true, createdAt: '2026-09-01' })) as number;
    await db.crossLogs.add({ date: '2026-09-23', activityId: pt });
    await db.settings.put({ key: 'units', value: 'mi' });
  }
  const snapshot = async () => JSON.stringify([await db.runs.count(), await db.plans.count(), await names(), await db.crossLogs.count(), await db.settings.toArray()]);

  it('round-trips everything', async () => {
    await seed();
    const before = await snapshot();
    const file = await exportBackup();
    await db.runs.clear();
    await restoreBackup(file);
    expect(await snapshot()).toBe(before);
  });

  it('converts version 1 (PT exercises) backups', async () => {
    const v1 = { format: 'curro-backup', version: 1, runs: [], plans: [], settings: [], ptExercises: [{ id: 1, name: 'Calf raises' }], ptLogs: [{ date: '2026-09-21', exerciseId: 1 }, { date: '2026-09-21', exerciseId: 2 }, { date: '2026-09-23', exerciseId: 1 }] };
    await restoreBackup(JSON.stringify(v1));
    expect(await names()).toEqual(['PT']);
    expect((await db.crossLogs.toArray()).map((l) => l.date)).toEqual(['2026-09-21', '2026-09-23']);
  });

  it('rejects damaged files without touching current data', async () => {
    await seed();
    const before = await snapshot();
    const good = JSON.parse(await exportBackup());
    const cases: [string, (b: typeof good) => void, RegExp][] = [
      ['bad run', (b) => (b.runs[0].distanceKm = 'ten'), /runs #1/],
      ['bad date', (b) => (b.runs[1].date = '2026-02-30'), /runs #2/],
      ['dangling cross log', (b) => (b.crossLogs[0].activityId = 999), /crossLogs #1/],
      ['two active plans', (b) => b.plans.push({ ...b.plans[0], id: 99 }), /more than one plan/i],
      ['not a list', (b) => (b.runs = {}), /"runs" should be a list/],
      ['future version', (b) => (b.version = 9), /Unsupported backup version/],
    ];
    for (const [label, damage, message] of cases) {
      const bad = structuredClone(good);
      damage(bad);
      await expect(restoreBackup(JSON.stringify(bad)), label).rejects.toThrow(message);
      expect(await snapshot(), label).toBe(before);
    }
    await expect(restoreBackup('not json')).rejects.toThrow(/not valid JSON/);
    await expect(restoreBackup(JSON.stringify(example))).rejects.toThrow(/not a Curro backup/);
    expect(await snapshot()).toBe(before);
  });

  it('accepts an empty but valid backup', () => {
    expect(validateBackup({ format: 'curro-backup', version: 2 })).toEqual([]);
  });
});
