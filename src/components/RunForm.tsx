import { useState, type FormEvent } from 'react';
import { db } from '../db';
import { useApp } from '../context';
import { formatLong, isValidDate, type ISODate } from '../lib/dates';
import { fmtClock, fmtPace, fromKm, parseClock, toKm } from '../lib/units';
import { RUN_TYPES, TYPE_LABEL, type Run, type WorkoutType } from '../types';
import { Modal } from './ui';

export function RunForm({ date, run, onClose }: { date?: ISODate; run?: Run; onClose: () => void }) {
  const { settings, today, plan } = useApp();
  const unit = settings.units;
  const initialDate = run?.date ?? date ?? today;
  const planned = plan?.workouts.find((w) => w.date === initialDate);

  const [day, setDay] = useState(initialDate);
  const [distance, setDistance] = useState(
    run ? String(+fromKm(run.distanceKm, unit).toFixed(2)) : planned?.distanceKm ? String(+fromKm(planned.distanceKm, unit).toFixed(2)) : '',
  );
  const [time, setTime] = useState(run?.durationSec ? fmtClock(run.durationSec) : '');
  const [type, setType] = useState<WorkoutType>(run?.type ?? (planned && RUN_TYPES.includes(planned.type) ? planned.type : 'easy'));
  const [notes, setNotes] = useState(run?.notes ?? '');
  const [error, setError] = useState('');

  const dist = parseFloat(distance.replace(',', '.'));
  const durationSec = time.trim() ? parseClock(time.includes(':') ? time : `${time}:00`) : undefined;
  const pace = dist > 0 && durationSec ? durationSec / toKm(dist, unit) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidDate(day)) return setError('Pick a date.');
    if (!(dist > 0)) return setError(`Enter a distance in ${unit}.`);
    if (durationSec === null) return setError('Time should look like 45:30 or 1:05:00.');
    const record: Run = { date: day, distanceKm: toKm(dist, unit), type, notes: notes.trim() || undefined, durationSec: durationSec || undefined };
    if (run?.id != null) await db.runs.update(run.id, { ...record, durationSec: record.durationSec, notes: record.notes });
    else await db.runs.add(record);
    onClose();
  }

  async function remove() {
    if (run?.id != null && confirm('Delete this run?')) {
      await db.runs.delete(run.id);
      onClose();
    }
  }

  return (
    <Modal title={run ? 'Edit run' : 'Log a run'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {planned && !run && (
          <div className="planned-box small">
            <strong>Planned for {formatLong(initialDate)}:</strong> {planned.title ?? TYPE_LABEL[planned.type]}
          </div>
        )}
        <div className="grid-2">
          <label className="field">
            Date
            <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
          </label>
          <label className="field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as WorkoutType)}>
              {RUN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Distance ({unit})
            <input type="number" inputMode="decimal" step="0.01" min="0" value={distance} onChange={(e) => setDistance(e.target.value)} autoFocus required />
          </label>
          <label className="field">
            Time (optional)
            <input type="text" inputMode="numeric" placeholder="45:30" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        {pace && <p className="small secondary">Pace: {fmtPace(pace, unit)}</p>}
        <label className="field">
          Notes
          <input type="text" placeholder="How did it feel? Any niggles?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="notice error">{error}</p>}
        <div className="row">
          {run && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save run
          </button>
        </div>
      </form>
    </Modal>
  );
}
