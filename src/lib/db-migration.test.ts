import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';

// Runs in its own file so the database starts empty: build a version-1 (PT exercises) database
// the way the first release did, then open it with the current code.
it('upgrades PT-era data to a single "PT" cross-training activity', async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('curro', 10); // Dexie version 1 = native version 10
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('runs', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
      d.createObjectStore('plans', { keyPath: 'id', autoIncrement: true }).createIndex('status', 'status');
      d.createObjectStore('ptExercises', { keyPath: 'id', autoIncrement: true });
      const logs = d.createObjectStore('ptLogs', { keyPath: 'id', autoIncrement: true });
      logs.createIndex('date', 'date');
      logs.createIndex('exerciseId', 'exerciseId');
      logs.createIndex('[date+exerciseId]', ['date', 'exerciseId']);
      d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const d = req.result;
      const tx = d.transaction(['ptExercises', 'ptLogs', 'runs'], 'readwrite');
      tx.objectStore('ptExercises').add({ name: 'Calf raises', days: [], active: true, createdAt: '2026-09-01' });
      tx.objectStore('ptExercises').add({ name: 'Clamshells', days: [0, 2], active: true, createdAt: '2026-09-01' });
      for (const [date, exerciseId] of [['2026-09-21', 1], ['2026-09-21', 2], ['2026-09-14', 1]] as const) tx.objectStore('ptLogs').add({ date, exerciseId });
      tx.objectStore('runs').add({ date: '2026-09-22', distanceKm: 6, type: 'easy' });
      tx.oncomplete = () => {
        d.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });

  const { db } = await import('../db');
  expect((await db.crossActivities.toArray()).map((a) => [a.name, a.createdAt])).toEqual([['PT', '2026-09-14']]);
  expect((await db.crossLogs.toArray()).map((l) => l.date).sort()).toEqual(['2026-09-14', '2026-09-21']);
  expect(await db.runs.count()).toBe(1);
  expect(db.tables.map((t) => t.name).sort()).toEqual(['crossActivities', 'crossLogs', 'plans', 'runs', 'settings']);
});
