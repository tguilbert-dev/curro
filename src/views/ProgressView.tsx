import { useState } from 'react';
import { useApp } from '../context';
import { Stat } from '../components/ui';
import { VolumeChart, type WeekDatum } from '../components/VolumeChart';
import { addDays, diffDays, formatShort, startOfWeek } from '../lib/dates';
import { weeklyChecks } from '../lib/heuristics';
import { between, paceSecPerKm, plannedAsActivities, sumKm, weekVolume } from '../lib/stats';
import { fmtDist, fmtPace } from '../lib/units';
import { categoryOf, CATEGORY_LABEL, EASY_TYPES, RUN_CATEGORIES, type RunCategory } from '../types';

type Range = '12' | '26' | 'plan';

export function ProgressView() {
  const { settings, plan, runs, today } = useApp();
  const unit = settings.units;
  const [range, setRange] = useState<Range>(plan ? 'plan' : '12');
  const [showTable, setShowTable] = useState(false);
  const thisWeek = startOfWeek(today);

  let first: string;
  let last: string;
  if (range === 'plan' && plan) {
    first = plan.startDate;
    last = startOfWeek(plan.race.date);
  } else {
    first = addDays(thisWeek, -7 * (Number(range) - 1));
    last = thisWeek;
  }
  const n = Math.max(1, diffDays(last, first) / 7 + 1);
  const plannedActs = plan ? plannedAsActivities(plan.workouts) : [];
  const data: WeekDatum[] = Array.from({ length: n }, (_, i) => {
    const start = addDays(first, 7 * i);
    return {
      start,
      actualKm: weekVolume(runs, start),
      byCat: Object.fromEntries(
        RUN_CATEGORIES.map((c) => [c, sumKm(between(runs, start, addDays(start, 7)).filter((r) => categoryOf(r.type) === c))]),
      ) as Record<RunCategory, number>,
      plannedKm: weekVolume(plannedActs, start),
      isCurrent: start === thisWeek,
      isRace: !!plan && start === startOfWeek(plan.race.date),
    };
  });
  const showPlanned = data.some((d) => d.plannedKm > 0);

  const last4 = between(runs, addDays(thisWeek, -28), thisWeek);
  const longest = runs.length ? runs.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a)) : null;
  const sincePlan = plan ? between(runs, plan.startDate, addDays(today, 1)) : [];
  const easyTimed = between(runs, addDays(today, -27), addDays(today, 1)).filter((r) => EASY_TYPES.has(r.type) && paceSecPerKm(r));
  const easyPace = easyTimed.length ? easyTimed.reduce((a, r) => a + r.durationSec!, 0) / sumKm(easyTimed) : null;

  return (
    <>
      <div className="stats">
        <Stat label="Avg week (last 4)" value={fmtDist(sumKm(last4) / 4, unit)} />
        {plan ? (
          <Stat label="Since plan start" value={fmtDist(sumKm(sincePlan), unit)} sub={`${sincePlan.length} runs`} />
        ) : (
          <Stat label="All time" value={fmtDist(sumKm(runs), unit)} sub={`${runs.length} runs`} />
        )}
        <Stat label="Longest run" value={longest ? fmtDist(longest.distanceKm, unit) : '—'} sub={longest ? formatShort(longest.date) : undefined} />
        <Stat label="Easy pace (28 days)" value={easyPace ? fmtPace(easyPace, unit) : '—'} sub={easyPace ? `${easyTimed.length} timed easy runs` : 'log times to see this'} />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Weekly distance</h2>
            <p className="small muted">{unit} per week, Monday to Sunday</p>
          </div>
          <div className="seg" role="group" aria-label="Range">
            {plan && (
              <button aria-pressed={range === 'plan'} onClick={() => setRange('plan')}>
                Plan
              </button>
            )}
            <button aria-pressed={range === '12'} onClick={() => setRange('12')}>
              12 wk
            </button>
            <button aria-pressed={range === '26'} onClick={() => setRange('26')}>
              26 wk
            </button>
          </div>
        </div>
        <div className="legend">
          {RUN_CATEGORIES.map((c) => (
            <span key={c}>
              <span className="sw" style={{ background: `var(--cat-${c})`, borderRadius: 3 }} /> {CATEGORY_LABEL[c]}
            </span>
          ))}
          {showPlanned && (
            <span>
              <span className="sw" style={{ background: 'var(--ink-2)', height: 3, borderRadius: 2, width: 14 }} /> Planned
            </span>
          )}
        </div>
        <VolumeChart data={data} unit={unit} showPlanned={showPlanned} />
        <button className="btn ghost small" style={{ justifySelf: 'start' }} onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
        {showTable && <WeekTable data={data} />}
      </section>
    </>
  );
}

function WeekTable({ data }: { data: WeekDatum[] }) {
  const { settings, runs, today, plan } = useApp();
  const unit = settings.units;
  const LEVEL_MARK = { good: '✓', warning: '!', critical: '!!', info: '·' } as const;
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Week</th>
            <th>Actual</th>
            {plan && <th>Planned</th>}
            <th>Change</th>
            <th>Easy / long / hard</th>
            <th>Long run</th>
            <th>10% rule</th>
            <th>Long ≤ 50%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const checks = d.start <= today ? weeklyChecks({ weekStart: d.start, runs, today, unit }) : [];
            const vol = checks.find((c) => c.id === 'volume');
            const ls = checks.find((c) => c.id === 'long-share');
            const wr = between(runs, d.start, addDays(d.start, 7));
            const prev = i > 0 ? data[i - 1].actualKm : 0;
            return (
              <tr key={d.start}>
                <td>{formatShort(d.start)}</td>
                <td>{d.actualKm > 0 ? fmtDist(d.actualKm, unit) : '—'}</td>
                {plan && <td>{d.plannedKm > 0 ? fmtDist(d.plannedKm, unit) : '—'}</td>}
                <td>{prev > 0 && d.actualKm > 0 ? `${d.actualKm >= prev ? '+' : ''}${Math.round((d.actualKm / prev - 1) * 100)}%` : '—'}</td>
                <td>{d.actualKm > 0 ? RUN_CATEGORIES.map((c) => `${Math.round((d.byCat[c] / d.actualKm) * 100)}%`).join(' / ') : '—'}</td>
                <td>{wr.length ? fmtDist(Math.max(...wr.map((r) => r.distanceKm)), unit) : '—'}</td>
                <td>{vol ? `${LEVEL_MARK[vol.level]} ${vol.level === 'good' ? 'OK' : vol.level}` : '—'}</td>
                <td>{ls ? `${LEVEL_MARK[ls.level]} ${ls.value}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
