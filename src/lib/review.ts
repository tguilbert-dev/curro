import { addDays, diffDays, formatShort, mondayOf, weekdayIndex, WEEKDAY_SHORT, type ISODate } from './dates';
import { weeklyChecks } from './heuristics';
import { planSchema } from './plan';
import { between, paceSecPerKm, plannedAsActivities, sumKm, weekVolume } from './stats';
import { fmtClock, fmtPace, fromKm } from './units';
import { HARD_TYPES, isRunningType, TYPE_LABEL, type CrossActivity, type CrossLog, type PlannedWorkout, type Run, type StoredPlan } from '../types';

export interface ReviewInput {
  plan: StoredPlan;
  runs: Run[];
  today: ISODate;
  /** How many weeks of history to include, ending with the current week. */
  weeksBack: number;
  cross?: { activities: CrossActivity[]; logs: CrossLog[] };
  note?: string;
}

/** Prompt asking a chatbot to compare recent training with the plan and return an adjusted plan. */
export function buildReviewPrompt({ plan, runs, today, weeksBack, cross, note }: ReviewInput): string {
  const unit = plan.sourceUnits;
  const d = (km: number) => `${fromKm(km, unit).toFixed(1)} ${unit}`;
  const thisWeek = mondayOf(today); // the prompt talks in the plan's Monday-to-Sunday weeks
  const planWeek = Math.floor(diffDays(thisWeek, plan.startDate) / 7) + 1;
  const weekStarts = Array.from({ length: weeksBack }, (_, i) => addDays(thisWeek, -7 * (weeksBack - 1 - i)));
  const planned = plannedAsActivities(plan.workouts);
  const plannedByDate = new Map(plan.workouts.map((w) => [w.date, w]));
  const weekLabel = (ws: ISODate) => {
    const n = Math.floor(diffDays(ws, plan.startDate) / 7) + 1;
    return n >= 1 && n <= plan.weeks.length ? `${n}` : 'before plan';
  };
  const describe = (w: PlannedWorkout) => `${w.title ?? TYPE_LABEL[w.type]}${w.distanceKm != null ? ` ${d(w.distanceKm)}` : ''}`;

  // Week-by-week plan vs actual.
  const weekRows = weekStarts.map((ws) => {
    const end = addDays(ws, 7);
    const wr = between(runs, ws, end);
    const plannedWeek = plan.workouts.filter((w) => w.date >= ws && w.date < end);
    const plannedLong = Math.max(0, ...plannedWeek.filter((w) => w.type === 'long').map((w) => w.distanceKm ?? 0));
    const ranDates = new Set(wr.map((r) => r.date));
    const missed = plannedWeek.filter((w) => w.date < today && (w.type === 'long' || HARD_TYPES.has(w.type)) && !ranDates.has(w.date));
    const idx = Math.floor(diffDays(ws, plan.startDate) / 7);
    const focus = plan.weeks[idx]?.focus ?? '';
    const partial = ws === thisWeek ? ' (so far)' : '';
    return `| ${formatShort(ws)} | ${weekLabel(ws)} | ${focus} | ${plannedWeek.length ? d(weekVolume(planned, ws)) : '–'} | ${d(sumKm(wr))}${partial} | ${plannedLong ? d(plannedLong) : '–'} | ${wr.length ? d(Math.max(...wr.map((r) => r.distanceKm))) : '–'} | ${wr.length} | ${missed.map((w) => `${WEEKDAY_SHORT[weekdayIndex(w.date)]} ${w.title ?? w.type}`).join(', ') || '–'} |`;
  });

  // Day-by-day log: every day with a run or a planned run, up to today.
  const from = weekStarts[0];
  const days = [...new Set([...runs.filter((r) => r.date >= from && r.date <= today).map((r) => r.date), ...plan.workouts.filter((w) => w.date >= from && w.date <= today && isRunningType(w.type)).map((w) => w.date)])].sort();
  const logLines = days.flatMap((date) => {
    const p = plannedByDate.get(date);
    const dayRuns = runs.filter((r) => r.date === date);
    const head = `${date} ${WEEKDAY_SHORT[weekdayIndex(date)]}`;
    const plannedText = p && isRunningType(p.type) ? `planned: ${describe(p)}` : 'unplanned';
    if (dayRuns.length === 0) return date < today ? [`${head} | MISSED | ${plannedText}`] : [`${head} | not yet run today | ${plannedText}`];
    return dayRuns.map((r) => {
      const pace = paceSecPerKm(r);
      const time = r.durationSec ? ` | ${fmtClock(r.durationSec)} (${fmtPace(pace!, unit)})` : '';
      return `${head} | ${TYPE_LABEL[r.type]} ${d(r.distanceKm)}${time} | ${plannedText}${r.notes ? ` | notes: ${r.notes}` : ''}`;
    });
  });

  // App's rule checks for last week and this week.
  const checkLines = [addDays(thisWeek, -7), thisWeek].flatMap((ws) =>
    weeklyChecks({ weekStart: ws, runs, today, unit, planned: plan.workouts, easyPaceSecPerKm: plan.easyPaceSecPerKm, raceDate: plan.race.date })
      .filter((c) => c.level === 'warning' || c.level === 'critical')
      .map((c) => `- Week of ${formatShort(ws)}: ${c.title} (${c.level}${c.value ? `, ${c.value}` : ''}): ${c.detail}`),
  );

  // Cross-training, days per week.
  let crossSection = '';
  if (cross && cross.activities.length) {
    const rows = cross.activities.map((a) => {
      const cells = weekStarts.map((ws) => {
        const done = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((day) => cross.logs.some((l) => l.activityId === a.id && l.date === day));
        return done.length ? `${done.length} (${done.map((day) => WEEKDAY_SHORT[weekdayIndex(day)]).join(' ')})` : '0';
      });
      return `| ${a.name} | ${cells.join(' | ')} |`;
    });
    crossSection = `
## Cross-training (days done per week)
I track these as done/not done per day, with no details.

| Activity | ${weekStarts.map(formatShort).join(' | ')} |
|---|${weekStarts.map(() => '---').join('|')}|
${rows.join('\n')}
`;
  }

  const daysToRace = diffDays(plan.race.date, today);
  return `You are an experienced running coach. I'm following the training plan below. Compare what I've actually done with the plan, then adjust the plan so the rest of it fits where I really am.

## Situation
- Today: ${today} (${WEEKDAY_SHORT[weekdayIndex(today)]}). This is plan week ${planWeek} of ${plan.weeks.length}.
- Race: ${plan.race.name}, ${plan.race.date} (${daysToRace} days away), ${d(plan.race.distanceKm)}${plan.race.goalTime ? `, goal ${plan.race.goalTime}` : ''}.
- Units: ${unit}. Weeks run Monday to Sunday.
${note?.trim() ? `- In my own words: ${note.trim()}\n` : ''}
## Plan vs actual, last ${weeksBack} weeks
| Week of | Plan week | Focus | Planned | Actual | Planned long run | Longest run | Runs | Missed key sessions |
|---|---|---|---|---|---|---|---|---|
${weekRows.join('\n')}

## Day-by-day log
${logLines.length ? logLines.join('\n') : '(no runs logged in this period)'}

## Warnings from my app
${checkLines.length ? checkLines.join('\n') : '- None for last week or this week.'}
${crossSection}
## What I want
1. A short assessment (under 150 words): am I on track, what's going well, what's worrying, and is the goal still realistic?
2. The complete adjusted plan as JSON, in a single \`\`\`json code block, that validates against the schema below.

Rules for the adjusted plan:
- Keep the same race and race date, and exactly ${plan.weeks.length} weeks, so the dates stay aligned.
- Leave weeks 1–${Math.max(planWeek - 1, 0)} exactly as they are${planWeek > 1 ? ' (they are my history)' : ''}. In week ${planWeek}, keep days up to and including today (${WEEKDAY_SHORT[weekdayIndex(today)]}) unchanged; adjust from tomorrow on.
- Build from what I've actually been running, not from what was planned. Never increase weekly volume by more than 10% over my recent actual weeks.
- Keep the long run at no more than 50% of weekly volume, about 80% of running easy, at most two hard sessions per week (never back to back), and at least one rest day per week.
- If I've missed training or mentioned pain or illness, be conservative rather than trying to catch up.${cross ? '\n- Take my cross-training into account: count hard sessions (e.g. boxing) toward total fatigue, and avoid quality runs the day after one.' : ''}
- Keep the taper. Update \`paces\` if my logged runs show my fitness is different from what the plan assumed.
- Update \`description\` with a one-line summary of what you changed and why.

## Current plan
\`\`\`json
${JSON.stringify(plan.raw, null, 2)}
\`\`\`

## Schema
\`\`\`json
${JSON.stringify(planSchema, null, 2)}
\`\`\`
`;
}

export interface WeekChange {
  index: number;
  start: ISODate;
  oldKm: number;
  newKm: number;
  changedDays: number;
}

export interface PlanDiff {
  sameRace: boolean;
  sameWeeks: boolean;
  /** Planned workouts before today that differ between the two plans. */
  pastChanges: number;
  weeks: WeekChange[];
}

/** What an imported plan changes compared with the active one. */
export function comparePlans(current: StoredPlan, next: StoredPlan, today: ISODate): PlanDiff {
  const key = (w?: PlannedWorkout) => (w ? `${w.type}|${w.distanceKm?.toFixed(2) ?? ''}|${w.durationMin ?? ''}|${w.title ?? ''}` : '');
  const oldByDate = new Map(current.workouts.map((w) => [w.date, w]));
  const newByDate = new Map(next.workouts.map((w) => [w.date, w]));
  const changed = [...new Set([...oldByDate.keys(), ...newByDate.keys()])].filter((d) => key(oldByDate.get(d)) !== key(newByDate.get(d)));
  const oldActs = plannedAsActivities(current.workouts);
  const newActs = plannedAsActivities(next.workouts);
  const weeks = next.weeks
    .map((w, index) => ({
      index,
      start: w.start,
      oldKm: weekVolume(oldActs, w.start),
      newKm: weekVolume(newActs, w.start),
      changedDays: changed.filter((d) => d >= w.start && d < addDays(w.start, 7)).length,
    }))
    .filter((w) => w.changedDays > 0);
  return {
    sameRace: current.race.date === next.race.date,
    sameWeeks: current.startDate === next.startDate && current.weeks.length === next.weeks.length,
    pastChanges: changed.filter((d) => d < today).length,
    weeks,
  };
}
