import { useApp } from '../context';
import { ActivityToggles } from '../components/ActivityToggles';
import { CheckList, StatusBadge, TypePill } from '../components/ui';
import { addDays, diffDays, formatLong, mondayOf, startOfWeek } from '../lib/dates';
import { weeklyChecks } from '../lib/heuristics';
import { dayStatus, plannedAsActivities, weekVolume } from '../lib/stats';
import { fmtDist, fmtPace } from '../lib/units';
import { isRunningType, TYPE_LABEL } from '../types';
import { openCalendarAt } from './CalendarView';
import { SamplePlanButton } from './PlanView';

export function TodayView() {
  const { settings, today, plan, runs, goTo } = useApp();
  const unit = settings.units;
  const weekStart = startOfWeek(today);
  const daysToRace = plan ? diffDays(plan.race.date, today) : undefined;

  const checks = weeklyChecks({
    weekStart, runs, today, unit,
    planned: plan?.workouts, easyPaceSecPerKm: plan?.easyPaceSecPerKm, raceDate: plan?.race.date,
  });
  const alerts = checks.filter((c) => c.level === 'warning' || c.level === 'critical');

  const weekKm = weekVolume(runs, weekStart);
  const plannedWeekKm = plan ? weekVolume(plannedAsActivities(plan.workouts), weekStart) : 0;

  return (
    <>
      {plan === null && (
        <section className="card empty">
          <h2>Welcome to Curro</h2>
          <p className="secondary">Import a training plan to get a race countdown, daily workouts and plan-vs-actual tracking. You can also just log runs.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => goTo('plan')}>
              Get a training plan
            </button>
            <SamplePlanButton />
          </div>
        </section>
      )}
      {plan && daysToRace != null && <Countdown daysToRace={daysToRace} />}
      {plan && <TodayWorkout />}

      <section className="card">
        <div className="card-head">
          <h2>This week</h2>
          <button
            className="btn ghost small"
            onClick={() => {
              openCalendarAt(today, 'week');
              goTo('calendar');
            }}
          >
            Week view →
          </button>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 600 }}>{fmtDist(weekKm, unit)}</span>
          {plannedWeekKm > 0 && <span className="secondary">of {fmtDist(plannedWeekKm, unit)} planned</span>}
        </div>
        {alerts.length > 0 ? (
          <CheckList checks={alerts} />
        ) : (
          <p className="small secondary">
            {checks.length ? '✓ No training warnings this week.' : 'Log runs to see training checks here.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Cross-training today</h2>
        <ActivityToggles date={today} />
      </section>
    </>
  );
}

function Countdown({ daysToRace }: { daysToRace: number }) {
  const { plan, settings, today } = useApp();
  if (!plan) return null;
  const totalDays = diffDays(plan.race.date, plan.startDate);
  const elapsed = Math.min(Math.max(diffDays(today, plan.startDate), 0), totalDays);
  const weekIdx = Math.floor(diffDays(mondayOf(today), plan.startDate) / 7);
  const week = plan.weeks[weekIdx];
  const label = daysToRace === 0 ? 'Race day!' : daysToRace > 0 ? (daysToRace === 1 ? 'day to go' : 'days to go') : 'days since the race';
  return (
    <section className="card countdown">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {daysToRace !== 0 && <span className="days">{Math.abs(daysToRace)}</span>}
        <span style={{ fontSize: daysToRace === 0 ? '2rem' : '1.1rem', fontWeight: 600 }}>{label}</span>
      </div>
      <div>
        <strong>{plan.race.name}</strong>
        <p className="secondary small">
          {formatLong(plan.race.date)} · {fmtDist(plan.race.distanceKm, settings.units)}
          {plan.race.goalTime && ` · goal ${plan.race.goalTime}`}
          {plan.race.location && ` · ${plan.race.location}`}
        </p>
      </div>
      {daysToRace >= 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="progress" role="progressbar" aria-valuenow={Math.round((elapsed / totalDays) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${(elapsed / Math.max(totalDays, 1)) * 100}%` }} />
          </div>
          <span className="small secondary">
            {week ? `Week ${weekIdx + 1} of ${plan.weeks.length}${week.focus ? ` · ${week.focus}` : ''}` : weekIdx < 0 ? `Plan starts ${formatLong(plan.startDate)}` : ''}
          </span>
        </div>
      )}
      {daysToRace < 0 && <p className="small secondary">Hope it went well! Import your next plan from the Plan tab.</p>}
    </section>
  );
}

function TodayWorkout() {
  const { plan, runs, today, settings, openRunForm, openDay } = useApp();
  if (!plan) return null;
  const unit = settings.units;
  const planned = plan.workouts.find((w) => w.date === today);
  const tomorrow = plan.workouts.find((w) => w.date === addDays(today, 1));
  const todays = runs.filter((r) => r.date === today);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Today</h2>
        <StatusBadge status={dayStatus(today, planned, todays, today)} />
      </div>
      {planned && planned.type !== 'rest' ? (
        <button className="planned-box" style={{ textAlign: 'left', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => openDay(today)}>
          <div className="row">
            <TypePill type={planned.type} />
            <strong>{planned.title ?? TYPE_LABEL[planned.type]}</strong>
            <span className="spacer" />
            {planned.distanceKm != null && <strong className="num">{fmtDist(planned.distanceKm, unit)}</strong>}
          </div>
          {planned.description && <span className="small secondary">{planned.description}</span>}
          {planned.targetPaceSecPerKm && <span className="small secondary">Target {fmtPace(planned.targetPaceSecPerKm, unit)}</span>}
        </button>
      ) : (
        <p className="secondary">Rest day. Recovery is part of training{planned?.description ? `: ${planned.description}` : '.'}</p>
      )}
      {todays.length > 0 && (
        <p className="small">
          Logged today: <strong>{fmtDist(todays.reduce((a, r) => a + r.distanceKm, 0), unit)}</strong>
        </p>
      )}
      <div className="row">
        {planned && isRunningType(planned.type) && todays.length === 0 && (
          <button className="btn primary" onClick={() => openRunForm({ date: today })}>
            Log this run
          </button>
        )}
        {tomorrow && (
          <span className="small muted">
            Tomorrow: {tomorrow.title ?? TYPE_LABEL[tomorrow.type]}
            {tomorrow.distanceKm != null && ` · ${fmtDist(tomorrow.distanceKm, unit)}`}
          </span>
        )}
      </div>
    </section>
  );
}

