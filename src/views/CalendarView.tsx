import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../context';
import { db } from '../db';
import { CheckList, Stat, StatusBadge, TypePill } from '../components/ui';
import {
  addDays, addMonths, daysInMonth, diffDays, formatMonth, formatWeekRange, startOfMonth, startOfWeek,
  weekDates, WEEKDAY_SHORT, type ISODate,
} from '../lib/dates';
import { weeklyChecks } from '../lib/heuristics';
import { between, dayStatus, groupByDate, plannedAsActivities, sumKm, weekVolume } from '../lib/stats';
import { fmtDist, fromKm } from '../lib/units';
import { WorkoutIcon } from '../components/WorkoutIcon';
import { categoryOf, type Run, TYPE_LABEL } from '../types';

export function CalendarView() {
  const { today } = useApp();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<ISODate>(today);
  return (
    <>
      <div className="row" style={{ justifyContent: 'center' }}>
        <div className="seg" role="group" aria-label="Calendar view">
          <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
            Week
          </button>
          <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
            Month
          </button>
        </div>
      </div>
      {mode === 'week' ? (
        <WeekView anchor={anchor} setAnchor={setAnchor} />
      ) : (
        <MonthView
          anchor={anchor}
          setAnchor={setAnchor}
          onPickWeek={(d) => {
            setAnchor(d);
            setMode('week');
          }}
        />
      )}
    </>
  );
}

function Nav({ label, onPrev, onNext, onToday }: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  return (
    <div className="week-nav">
      <button className="btn icon" onClick={onPrev} aria-label="Previous">
        ‹
      </button>
      <h2>{label}</h2>
      <button className="btn small" onClick={onToday}>
        Today
      </button>
      <button className="btn icon" onClick={onNext} aria-label="Next">
        ›
      </button>
    </div>
  );
}

function WeekView({ anchor, setAnchor }: { anchor: ISODate; setAnchor: (d: ISODate) => void }) {
  const { settings, plan, runs, today, openDay } = useApp();
  const unit = settings.units;
  const weekStart = startOfWeek(anchor);
  const dates = weekDates(weekStart);
  const byDate = groupByDate(runs);
  const plannedByDate = new Map(plan?.workouts.map((w) => [w.date, w]) ?? []);
  const activityNames = new Map((useLiveQuery(() => db.crossActivities.toArray(), []) ?? []).map((a) => [a.id!, a.name]));
  const crossLogs = useLiveQuery(() => db.crossLogs.where('date').between(dates[0], dates[6], true, true).toArray(), [weekStart]) ?? [];

  const total = weekVolume(runs, weekStart);
  const prev = weekVolume(runs, addDays(weekStart, -7));
  const plannedTotal = plan ? weekVolume(plannedAsActivities(plan.workouts), weekStart) : 0;
  const weekRuns = between(runs, weekStart, addDays(weekStart, 7));
  const longest = weekRuns.length ? Math.max(...weekRuns.map((r) => r.distanceKm)) : 0;
  const planWeekIdx = plan ? plan.weeks.findIndex((w) => w.start === weekStart) : -1;
  const planWeek = plan && planWeekIdx >= 0 ? plan.weeks[planWeekIdx] : undefined;

  const checks = weeklyChecks({
    weekStart, runs, today, unit,
    planned: plan?.workouts, easyPaceSecPerKm: plan?.easyPaceSecPerKm, raceDate: plan?.race.date,
  });

  return (
    <>
      <Nav
        label={formatWeekRange(weekStart)}
        onPrev={() => setAnchor(addDays(weekStart, -7))}
        onNext={() => setAnchor(addDays(weekStart, 7))}
        onToday={() => setAnchor(today)}
      />
      {planWeek && (
        <p className="small secondary" style={{ textAlign: 'center' }}>
          Plan week {planWeekIdx + 1} of {plan!.weeks.length}
          {planWeek.focus && ` · ${planWeek.focus}`}
          {planWeek.notes && ` · ${planWeek.notes}`}
        </p>
      )}
      <div className="stats">
        <Stat label="Distance" value={fmtDist(total, unit)} sub={plannedTotal > 0 ? `${fmtDist(plannedTotal, unit)} planned` : undefined} />
        <Stat
          label="vs last week"
          value={prev > 0 ? `${total >= prev ? '+' : ''}${Math.round(((total - prev) / prev) * 100)}%` : '—'}
          sub={prev > 0 ? `${fmtDist(prev, unit)} last week` : 'no runs last week'}
        />
        <Stat label="Longest run" value={longest ? fmtDist(longest, unit) : '—'} sub={total > 0 ? `${Math.round((longest / total) * 100)}% of week` : undefined} />
        <Stat label="Runs" value={weekRuns.length} sub={`${new Set(weekRuns.map((r) => r.date)).size} day${new Set(weekRuns.map((r) => r.date)).size === 1 ? '' : 's'}`} />
      </div>

      <section className="card">
        <div className="days">
          {dates.map((d, i) => {
            const planned = plannedByDate.get(d);
            const dayRuns = byDate.get(d) ?? [];
            const km = sumKm(dayRuns);
            const doneNames = crossLogs.filter((l) => l.date === d).map((l) => activityNames.get(l.activityId)).filter(Boolean);
            return (
              <button key={d} className={`day ${d === today ? 'is-today' : ''}`} onClick={() => openDay(d)}>
                <span>
                  <span className="dname">{WEEKDAY_SHORT[i]}</span>
                  <br />
                  <span className="ddate">{d.slice(8)}</span>
                </span>
                <span className="plan">
                  {planned && planned.type !== 'rest' ? (
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <TypePill type={planned.type} />
                      <span className="t">{planned.title ?? TYPE_LABEL[planned.type]}</span>
                    </span>
                  ) : (
                    <span className="muted">{plan ? 'Rest' : dayRuns.length ? '' : '—'}</span>
                  )}
                  {doneNames.length > 0 && <span className="act-mark">+ {doneNames.join(', ')}</span>}
                </span>
                <span className="actual">
                  {km > 0 ? (
                    <strong className="ran">
                      {[...new Set(dayRuns.map((r) => r.type))].map((t) => (
                        <span key={t} className={`cat-ink-${categoryOf(t)}`} title={TYPE_LABEL[t]}>
                          <WorkoutIcon type={t} />
                        </span>
                      ))}
                      {fmtDist(km, unit)}
                    </strong>
                  ) : planned?.distanceKm ? <span className="muted">{fmtDist(planned.distanceKm, unit)}</span> : null}
                  <br />
                  <StatusBadge status={dayStatus(d, planned, dayRuns, today)} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Training checks</h2>
        <CheckList checks={checks} empty={weekStart > today ? 'Checks appear once the week starts.' : undefined} />
      </section>
    </>
  );
}

function MonthView({ anchor, setAnchor, onPickWeek }: { anchor: ISODate; setAnchor: (d: ISODate) => void; onPickWeek: (d: ISODate) => void }) {
  const { settings, plan, runs, today, openDay } = useApp();
  const unit = settings.units;
  const monthStart = startOfMonth(anchor);
  const monthEnd = addMonths(monthStart, 1);
  const gridStart = startOfWeek(monthStart);
  const weeks = Math.ceil((diffDays(monthStart, gridStart) + daysInMonth(monthStart)) / 7);
  const byDate = groupByDate(runs);
  const plannedByDate = new Map(plan?.workouts.map((w) => [w.date, w]) ?? []);
  const plannedActs = plan ? plannedAsActivities(plan.workouts) : [];

  const monthRuns = between(runs, monthStart, monthEnd);
  const monthKm = sumKm(monthRuns);
  const plannedMonthKm = sumKm(between(plannedActs, monthStart, monthEnd));
  const dayTotals = [...groupByDate(monthRuns).values()].map(sumKm);
  const maxKm = Math.max(10, ...dayTotals, ...between(plannedActs, gridStart, addDays(gridStart, weeks * 7)).map((a) => a.distanceKm));
  const size = (km: number) => `${Math.round(8 + 22 * Math.sqrt(km / maxKm))}px`;

  return (
    <>
      <Nav
        label={formatMonth(monthStart)}
        onPrev={() => setAnchor(addMonths(monthStart, -1))}
        onNext={() => setAnchor(addMonths(monthStart, 1))}
        onToday={() => setAnchor(today)}
      />
      <div className="stats">
        <Stat label="Distance" value={fmtDist(monthKm, unit)} sub={plannedMonthKm > 0 ? `${fmtDist(plannedMonthKm, unit)} planned` : undefined} />
        <Stat label="Runs" value={monthRuns.length} sub={`${new Set(monthRuns.map((r) => r.date)).size} days run`} />
        <Stat label="Longest run" value={monthRuns.length ? fmtDist(Math.max(...monthRuns.map((r) => r.distanceKm)), unit) : '—'} />
      </div>
      <section className="card">
        <div className="month">
          {WEEKDAY_SHORT.map((d) => (
            <span key={d} className="dow">
              {d.slice(0, 2)}
            </span>
          ))}
          <span className="dow">Week</span>
          {Array.from({ length: weeks }, (_, w) => {
            const ws = addDays(gridStart, w * 7);
            const wk = weekVolume(runs, ws);
            const wp = weekVolume(plannedActs, ws);
            return [
              ...weekDates(ws).map((d) => {
                const planned = plannedByDate.get(d);
                const km = sumKm(byDate.get(d) ?? []);
                const status = dayStatus(d, planned, byDate.get(d) ?? [], today);
                const plannedKm = planned?.distanceKm ?? 0;
                const cls = ['mcell', d < monthStart || d >= monthEnd ? 'out' : '', d === today ? 'is-today' : '', planned?.type === 'race' ? 'race' : ''].join(' ');
                const label = `${d}: ${km > 0 ? `ran ${fmtDist(km, unit)}` : status}${planned ? `, planned ${planned.title ?? TYPE_LABEL[planned.type]}` : ''}`;
                return (
                  <button key={d} className={cls} onClick={() => openDay(d)} aria-label={label} title={label}>
                    <span className="n">
                      {Number(d.slice(8))}
                      {planned?.type === 'race' && <WorkoutIcon type="race" size={11} />}
                    </span>
                    {km > 0 ? (
                      <span className={`bubble cat-${dayCategory(byDate.get(d) ?? [])}`} style={{ width: size(km), height: size(km) }} />
                    ) : plannedKm > 0 && (status === 'upcoming' || status === 'today' || status === 'missed') ? (
                      <span className={`bubble ${status === 'missed' ? 'missed' : 'planned'}`} style={{ width: size(plannedKm), height: size(plannedKm) }} />
                    ) : (
                      <span />
                    )}
                    <span className="km">{km > 0 ? fromKm(km, unit).toFixed(1) : plannedKm > 0 && d >= today ? fromKm(plannedKm, unit).toFixed(0) : ''}</span>
                  </button>
                );
              }),
              <button key={`w${ws}`} className="wtotal btn ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => onPickWeek(ws)} aria-label={`Open week of ${ws}`}>
                <span>
                  <strong>{fromKm(wk, unit).toFixed(0)}</strong>
                  {wp > 0 && (
                    <>
                      <br />
                      <span className="muted">/{fromKm(wp, unit).toFixed(0)}</span>
                    </>
                  )}
                </span>
              </button>,
            ];
          })}
        </div>
        <div className="legend">
          <span>
            <span className="sw" style={{ background: 'var(--cat-easy)' }} /> Easy
          </span>
          <span>
            <span className="sw" style={{ background: 'var(--cat-long)' }} /> Long
          </span>
          <span>
            <span className="sw" style={{ background: 'var(--cat-hard)' }} /> Hard
          </span>
          <span>
            <span className="sw" style={{ border: '2px solid var(--axis)' }} /> Planned
          </span>
          <span>
            <span className="sw" style={{ border: '2px solid var(--critical)' }} /> Missed
          </span>
          <span>
            <WorkoutIcon type="race" size={11} /> Race day
          </span>
          <span>Dot size = distance · week column: run / planned {unit}</span>
        </div>
      </section>
    </>
  );
}


/** The day's colour: any hard run wins, then a long run, otherwise easy. */
function dayCategory(runs: Run[]): 'easy' | 'long' | 'hard' {
  const cats = runs.map((r) => categoryOf(r.type));
  return cats.includes('hard') ? 'hard' : cats.includes('long') ? 'long' : 'easy';
}
