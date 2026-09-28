import { useApp } from '../context';
import { formatLong, type ISODate } from '../lib/dates';
import { dayStatus, paceSecPerKm } from '../lib/stats';
import { fmtClock, fmtDist, fmtPace } from '../lib/units';
import { TYPE_LABEL } from '../types';
import { ActivityToggles } from './ActivityToggles';
import { Modal, StatusBadge, TypePill } from './ui';

export function DayDetail({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { settings, plan, runs, today, openRunForm } = useApp();
  const unit = settings.units;
  const planned = plan?.workouts.find((w) => w.date === date);
  const dayRuns = runs.filter((r) => r.date === date);

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
