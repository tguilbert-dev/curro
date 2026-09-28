import { useRef, useState } from 'react';
import { useApp } from '../context';
import { db } from '../db';
import { addDays, formatLong, weekdayIndex, WEEKDAY_SHORT, type ISODate } from '../lib/dates';
import { moveWorkout } from '../lib/plan';
import { dayStatus, paceSecPerKm } from '../lib/stats';
import { fmtClock, fmtDist, fmtPace } from '../lib/units';
import { TYPE_LABEL } from '../types';
import { ActivityToggles } from './ActivityToggles';
import { Modal, StatusBadge, TypePill } from './ui';

export function DayDetail({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { settings, plan, runs, today, openRunForm, openDay } = useApp();
  const unit = settings.units;
  const planned = plan?.workouts.find((w) => w.date === date);
  const dayRuns = runs.filter((r) => r.date === date);
  const [moveError, setMoveError] = useState('');
  const moving = useRef(false);

  // Nudge the planned workout a day earlier/later; the dialog follows it to its new day.
  const canMove = plan && planned && planned.type !== 'rest';
  const target = (offset: number) => {
    const to = addDays(date, offset);
    if (!plan || typeof moveWorkout(plan, date, to, today) === 'string') return null;
    const occupied = plan.workouts.some((w) => w.date === to && w.type !== 'rest');
    return { to, label: `${occupied ? 'Swap with' : 'Move to'} ${WEEKDAY_SHORT[weekdayIndex(to)]}` };
  };
  async function move(to: ISODate) {
    if (!plan || moving.current) return;
    const next = moveWorkout(plan, date, to, today);
    if (typeof next === 'string') return setMoveError(next);
    moving.current = true;
    try {
      await db.plans.put(next);
      setMoveError('');
      openDay(to);
    } finally {
      moving.current = false;
    }
  }
  const earlier = canMove ? target(-1) : null;
  const later = canMove ? target(1) : null;

  return (
    <Modal title={formatLong(date)} onClose={onClose}>
      <StatusBadge status={dayStatus(date, planned, dayRuns, today)} />
      {planned ? (
        <div className="planned-box">
          <div className="row">
            <TypePill type={planned.type} />
            <strong>{planned.title ?? TYPE_LABEL[planned.type]}</strong>
            <span className="spacer" />
            {planned.distanceKm != null && <span className="num">{fmtDist(planned.distanceKm, unit)}</span>}
          </div>
          {planned.description && <p className="small secondary">{planned.description}</p>}
          {planned.targetPaceSecPerKm && <p className="small secondary">Target pace {fmtPace(planned.targetPaceSecPerKm, unit)}</p>}
          {planned.durationMin && <p className="small secondary">{planned.durationMin} min</p>}
          {(earlier || later) && (
            <div className="row nudge">
              {earlier && (
                <button className="btn small" onClick={() => move(earlier.to)}>
                  ‹ {earlier.label}
                </button>
              )}
              <span className="spacer" />
              {later && (
                <button className="btn small" onClick={() => move(later.to)}>
                  {later.label} ›
                </button>
              )}
            </div>
          )}
          {moveError && <p className="small notice error">{moveError}</p>}
        </div>
      ) : (
        <p className="muted small">{plan ? 'Rest day in your plan.' : 'No plan imported.'}</p>
      )}

      <div className="stack">
        <h3>Runs</h3>
        {dayRuns.length === 0 && <p className="muted small">Nothing logged.</p>}
        {dayRuns.map((r) => (
          <button key={r.id} className="run-row btn" style={{ justifyContent: 'flex-start' }} onClick={() => openRunForm({ run: r })}>
            <TypePill type={r.type} />
            <strong className="num">{fmtDist(r.distanceKm, unit, 2)}</strong>
            {r.durationSec && (
              <span className="small secondary num">
                {fmtClock(r.durationSec)} · {fmtPace(paceSecPerKm(r)!, unit)}
              </span>
            )}
            <span className="spacer" />
            <span className="small muted">Edit</span>
          </button>
        ))}
        {dayRuns.some((r) => r.notes) && (
          <ul className="small secondary" style={{ margin: 0, paddingLeft: 18 }}>
            {dayRuns.filter((r) => r.notes).map((r) => (
              <li key={r.id}>{r.notes}</li>
            ))}
          </ul>
        )}
      </div>

      {date <= today && (
        <div className="stack">
          <h3>Cross-training</h3>
          <ActivityToggles date={date} />
        </div>
      )}

      {date <= today && (
        <button className="btn primary" onClick={() => openRunForm({ date })}>
          + Log a run for this day
        </button>
      )}
    </Modal>
  );
}
