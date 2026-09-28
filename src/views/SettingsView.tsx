import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { db, requestPersistentStorage, saveSetting } from '../db';
import { downloadText, exportBackup, restoreBackup } from '../lib/backup';
import { today as todayISO } from '../lib/dates';
import type { ThemePref } from '../types';

export function SettingsView() {
  const { settings } = useApp();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  async function backup() {
    downloadText(`curro-backup-${todayISO()}.json`, await exportBackup());
    setMessage('Backup downloaded.');
  }

  async function restore(text: string) {
    if (!confirm('Replace ALL current data with this backup?')) return;
    try {
      await restoreBackup(text);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function wipe() {
    if (!confirm('Delete all runs, plans and activity data from this device? Download a backup first if you want to keep it.')) return;
    await Promise.all([db.runs.clear(), db.plans.clear(), db.crossActivities.clear(), db.crossLogs.clear()]);
    setMessage('All data deleted.');
  }

  return (
    <>
      <section className="card">
        <h2>Preferences</h2>
        <div className="row">
          <span style={{ width: 90 }}>Units</span>
          <div className="seg" role="group" aria-label="Units">
            {(['km', 'mi'] as const).map((u) => (
              <button key={u} aria-pressed={settings.units === u} onClick={() => saveSetting('units', u)}>
                {u === 'km' ? 'Kilometres' : 'Miles'}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span style={{ width: 90 }}>Week starts</span>
          <div className="seg" role="group" aria-label="Week starts on">
            {(['mon', 'sun'] as const).map((d) => (
              <button key={d} aria-pressed={settings.weekStart === d} onClick={() => saveSetting('weekStart', d)}>
                {d === 'mon' ? 'Monday' : 'Sunday'}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span style={{ width: 90 }}>Theme</span>
          <div className="seg" role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} aria-pressed={settings.theme === t} onClick={() => saveSetting('theme', t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="small secondary">
          Everything is stored only on this device, in this browser. There is no account and nothing is uploaded. Download a backup now and then, and use it to move to a
          new phone.
        </p>
        <p className="small">
          Storage:{' '}
          {persisted ? (
            <span>✓ persistent (the browser won't clear it automatically)</span>
          ) : (
            <>
              <span className="secondary">may be cleared by the browser if space runs low. </span>
              <button className="btn ghost small" onClick={async () => setPersisted(await requestPersistentStorage())}>
                Request persistent storage
              </button>
            </>
          )}
        </p>
        <p className="small muted">On iPhone, add Curro to your Home Screen (Share → Add to Home Screen) so Safari doesn't delete its data after a week of not using it.</p>
        <div className="row">
          <button className="btn primary" onClick={backup}>
            Download backup
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Restore backup…
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await restore(await f.text());
              e.target.value = '';
            }}
          />
          <span className="spacer" />
          <button className="btn danger" onClick={wipe}>
            Delete all data
          </button>
        </div>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="card">
        <h2>About the checks</h2>
        <ul className="small secondary" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li><strong>10% rule:</strong> weekly distance shouldn't grow more than 10% over the previous week. Coming back from a cutback week is allowed.</li>
          <li><strong>Long run ≤ 50%:</strong> the longest run shouldn't be more than half the week's distance; 25–35% is typical.</li>
          <li><strong>80/20:</strong> about 80% of distance should be easy (easy, recovery and long runs).</li>
          <li><strong>Hard sessions:</strong> at most two per week, never on back-to-back days.</li>
          <li><strong>Rest day:</strong> at least one full day off per week.</li>
          <li><strong>Long run progression:</strong> don't jump more than about 15% beyond your longest run of the last 4 weeks.</li>
          <li><strong>Acute:chronic load:</strong> last 7 days divided by your 4-week weekly average. 0.8–1.3 is the sweet spot; above 1.5 is a spike.</li>
          <li><strong>Easy pace:</strong> easy runs shouldn't be faster than your plan's easy pace (or close to your hard-session pace).</li>
          <li><strong>Taper:</strong> roughly 85%, 70% and 50% of peak volume in the last three weeks.</li>
          <li><strong>Plan vs actual:</strong> how much of the planned distance you've run, and missed key sessions.</li>
        </ul>
        <p className="small muted">These are rules of thumb, not medical advice. Listen to your body and a professional over any app.</p>
      </section>
    </>
  );
}
