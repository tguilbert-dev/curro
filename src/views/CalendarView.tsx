import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useApp } from '../context';
import { db } from '../db';
import { Section } from '../components/Section';
import { CheckList, Stat, StatusBadge, TypePill } from '../components/ui';
import type { Check } from '../lib/heuristics';
import {
  addDays, addMonths, daysInMonth, diffDays, formatMonth, formatWeekRange, startOfMonth, startOfWeek,
  mondayOf, weekDates, weekdayIndex, weekdayLabels, WEEKDAY_SHORT, type ISODate,
} from '../lib/dates';
import { weeklyChecks } from '../lib/heuristics';
import { between, dayStatus, groupByDate, plannedAsActivities, sumKm, weekVolume } from '../lib/stats';
import { fmtDist, fromKm } from '../lib/units';
import { WorkoutIcon } from '../components/WorkoutIcon';
import { categoryOf, isRunningType, type CrossActivity, type Run, TYPE_LABEL } from '../types';
import { useSwipe } from '../components/useSwipe';

type CalendarMode = 'week' | 'month';
const MODE_KEY = 'curro-calendar-mode';

// Remembered while switching tabs; the mode is also remembered across launches.
let lastAnchor: ISODate | null = null;
let lastMode: CalendarMode | null = null;

function savedMode(): CalendarMode {
  if (lastMode) return lastMode;
  try {
    return localStorage.getItem(MODE_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

/** Make the calendar open on a given date and view next time it's shown. */
export function openCalendarAt(date: ISODate, mode: CalendarMode = 'week') {
  lastAnchor = date;
  lastMode = mode;
}

export function CalendarView() {
  const { today } = useApp();
  const [mode, setModeState] = useState<CalendarMode>(savedMode);
  const [anchor, setAnchorState] = useState<ISODate>(() => lastAnchor ?? today);
  const setAnchor = (d: ISODate) => {
    lastAnchor = d;
    setAnchorState(d);
  };
  const setMode = (m: CalendarMode) => {
    lastMode = m;
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // storage blocked: the mode is still remembered for this session
    }
  };
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
  // Plan weeks are Monday-based; with Sunday-start weeks, match on the week's midpoint.
  const planWeekIdx = plan ? plan.weeks.findIndex((w) => w.start === mondayOf(addDays(weekStart, 3))) : -1;
  const planWeek = plan && planWeekIdx >= 0 ? plan.weeks[planWeekIdx] : undefined;

  const checks = weeklyChecks({
    weekStart, runs, today, unit,
    planned: plan?.workouts, easyPaceSecPerKm: plan?.easyPaceSecPerKm, raceDate: plan?.race.date,
  });
  const swipeRef = useSwipe<HTMLElement>(
    () => setAnchor(addDays(weekStart, -7)),
    () => setAnchor(addDays(weekStart, 7)),
  );

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

      <section className="card swipeable" ref={swipeRef}>
        <div className="days">
          {dates.map((d) => {
            const planned = plannedByDate.get(d);
            const dayRuns = byDate.get(d) ?? [];
            const km = sumKm(dayRuns);
            const doneNames = crossLogs.filter((l) => l.date === d).map((l) => activityNames.get(l.activityId)).filter(Boolean);
            return (
              <button key={d} className={`day ${d === today ? 'is-today' : ''}`} onClick={() => openDay(d)}>
                <span>
                  <span className="dname">{WEEKDAY_SHORT[weekdayIndex(d)]}</span>
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

      <Section id="week-checks" title="Training checks" defaultOpen={false} summary={<ChecksSummary checks={checks} />}>
        <CheckList checks={checks} empty={weekStart > today ? 'Checks appear once the week starts.' : undefined} />
      </Section>
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
  const swipeRef = useSwipe<HTMLElement>(
    () => setAnchor(addMonths(monthStart, -1)),
    () => setAnchor(addMonths(monthStart, 1)),
  );
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const crossActivities = useLiveQuery(() => db.crossActivities.toArray(), []) ?? [];
  const crossLogs = useLiveQuery(() => db.crossLogs.where('date').between(gridStart, gridEnd, true, true).toArray(), [gridStart, gridEnd]) ?? [];
  const badges = crossBadges(crossActivities);
  const crossByDate = groupByDate(crossLogs);
  const crossThisMonth = crossActivities.filter((a) => crossLogs.some((l) => l.activityId === a.id && l.date >= monthStart && l.date < monthEnd));

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
      <section className="card swipeable" ref={swipeRef}>
        <div className="month">
          {weekdayLabels().map((d) => (
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
                const dayRuns = byDate.get(d) ?? [];
                const main = mainRun(dayRuns);
                const showPlanned = !main && planned && isRunningType(planned.type) && (status === 'upcoming' || status === 'today' || status === 'missed');
                const cls = ['mcell', d < monthStart || d >= monthEnd ? 'out' : '', d === today ? 'is-today' : '', main ? `cat-${categoryOf(main.type)}` : ''].join(' ');
                const crossNames = [...new Set((crossByDate.get(d) ?? []).map((l) => crossActivities.find((a) => a.id === l.activityId)?.name).filter(Boolean))];
                const label = `${d}: ${km > 0 ? `ran ${fmtDist(km, unit)}` : status}${planned ? `, planned ${planned.title ?? TYPE_LABEL[planned.type]}` : ''}${crossNames.length ? `, ${crossNames.join(', ')}` : ''}`;
                return (
                  <button key={d} className={cls} onClick={() => openDay(d)} aria-label={label} title={label}>
                    <span className="n">{Number(d.slice(8))}</span>
                    {main ? (
                      <span className={`mk cat-ink-${categoryOf(main.type)}`}>
                        <WorkoutIcon type={main.type} size={18} />
                      </span>
                    ) : showPlanned ? (
                      <span className={`mk ${status === 'missed' ? 'missed' : 'planned'}`}>
                        <WorkoutIcon type={planned!.type} size={18} />
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className={`km ${km > 0 ? "" : "muted"}`}>{km > 0 ? fromKm(km, unit).toFixed(1) : plannedKm > 0 && d >= today ? fromKm(plannedKm, unit).toFixed(0) : ''}</span>
                    <CrossBadges ids={(crossByDate.get(d) ?? []).map((l) => l.activityId)} badges={badges} />
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
          <span className="cat-ink-easy">
            <WorkoutIcon type="easy" /> <span className="secondary">Easy</span>
          </span>
          <span className="cat-ink-long">
            <WorkoutIcon type="long" /> <span className="secondary">Long</span>
          </span>
          <span className="cat-ink-hard">
            <WorkoutIcon type="intervals" /> <span className="secondary">Hard</span>
          </span>
          <span className="mk planned">
            <WorkoutIcon type="tempo" /> <span className="secondary">Planned</span>
          </span>
          <span className="mk missed">
            <WorkoutIcon type="tempo" /> <span className="secondary">Missed</span>
          </span>
          <span>
            <WorkoutIcon type="race" /> Race
          </span>
          {crossThisMonth.length > 0 && (
            <span>
              {crossThisMonth.map((a) => (
                <span key={a.id} style={{ marginRight: 8 }}>
                  <span className="xb">{badges.get(a.id!)}</span> {a.name}
                </span>
              ))}
            </span>
          )}
          <span>Week column: run / planned {unit} · swipe to change month</span>
        </div>
      </section>
    </>
  );
}


/** The run that represents a day: a race, then any hard run, then a long run, then the longest. */
function mainRun(runs: Run[]): Run | undefined {
  const rank = (r: Run) => (r.type === 'race' ? 3 : categoryOf(r.type) === 'hard' ? 2 : r.type === 'long' ? 1 : 0);
  return [...runs].sort((a, b) => rank(b) - rank(a) || b.distanceKm - a.distanceKm)[0];
}

/** Short badge per activity: first letter, or first two if the letter is shared. */
function crossBadges(activities: CrossActivity[]): Map<number, string> {
  const first = (a: CrossActivity) => a.name.trim().charAt(0).toUpperCase();
  const counts = new Map<string, number>();
  for (const a of activities) counts.set(first(a), (counts.get(first(a)) ?? 0) + 1);
  return new Map(activities.map((a) => [a.id!, (counts.get(first(a))! > 1 ? a.name.trim().slice(0, 2) : first(a)) || '•']));
}

/** Up to two cross-training badges in a month cell, then "+n". */
function CrossBadges({ ids, badges }: { ids: number[]; badges: Map<number, string> }) {
  const unique = [...new Set(ids)].filter((id) => badges.has(id));
  if (unique.length === 0) return null;
  const shown = unique.length > 2 ? unique.slice(0, 1) : unique;
  return (
    <span className="xbs" aria-hidden="true">
      {shown.map((id) => (
        <span key={id} className="xb">
          {badges.get(id)}
        </span>
      ))}
      {unique.length > shown.length && <span className="xb">+{unique.length - shown.length}</span>}
    </span>
  );
}

/** One-line status for the collapsed checks heading, e.g. "1 too much · 2 caution" or "All OK". */
function ChecksSummary({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  const critical = checks.filter((c) => c.level === 'critical').length;
  const warning = checks.filter((c) => c.level === 'warning').length;
  const parts = [critical && `${critical} too much`, warning && `${warning} caution`].filter(Boolean);
  return (
    <span className={`checks-summary ${critical ? 'lvl-critical' : warning ? 'lvl-warning' : 'lvl-good'}`}>
      <span className="icon" aria-hidden="true">
        {critical ? '!!' : warning ? '!' : '✓'}
      </span>
      {parts.length ? parts.join(' · ') : 'All OK'}
    </span>
  );
}
