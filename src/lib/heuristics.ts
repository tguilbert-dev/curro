import { addDays, diffDays, formatShort, weekdayIndex, WEEKDAY_SHORT, type ISODate } from './dates';
import { between, paceSecPerKm, plannedAsActivities, sumKm, weekVolume, type Activity } from './stats';
import { fmtDist, fmtPace, type Unit } from './units';
import { EASY_TYPES, HARD_TYPES, isRunningType, type PlannedWorkout, type Run } from '../types';

export type Level = 'good' | 'warning' | 'critical' | 'info';

export interface Check {
  id: string;
  title: string;
  level: Level;
  value?: string;
  detail: string;
}

export interface WeekContext {
  weekStart: ISODate;
  runs: Run[];
  planned?: PlannedWorkout[];
  easyPaceSecPerKm?: number;
  raceDate?: ISODate;
  today: ISODate;
  unit: Unit;
}

const LOW_BASE_KM = 16;
const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

/** Every weekly check the app knows, for a week that has started. */
export function weeklyChecks(ctx: WeekContext): Check[] {
  const { weekStart, today } = ctx;
  if (today < weekStart) return [];
  const checks = [
    volumeIncrease(ctx),
    longRunShare(ctx),
    easyHardSplit(ctx),
    hardSessions(ctx),
    restDays(ctx),
    longRunJump(ctx),
    workload(ctx),
    easyPace(ctx),
    taper(ctx),
    adherence(ctx),
  ];
  return checks.filter((c): c is Check => c != null);
}

function weekRuns(ctx: WeekContext): Run[] {
  return between(ctx.runs, ctx.weekStart, addDays(ctx.weekStart, 7));
}

function isCurrent(ctx: WeekContext): boolean {
  return ctx.today < addDays(ctx.weekStart, 7);
}

/** The 10% rule: weekly volume shouldn't grow more than 10% over the previous week. */
function volumeIncrease(ctx: WeekContext): Check | null {
  const { weekStart, runs, unit } = ctx;
  const total = weekVolume(runs, weekStart);
  const prev = weekVolume(runs, addDays(weekStart, -7));
  const title = '10% rule';
  if (prev === 0) return null; // nothing to compare with
  const change = (total - prev) / prev;
  const limit = prev * 1.1;
  const lowBase = prev < LOW_BASE_KM ? ' At low volume the rule is very cautious; a small jump in absolute distance is usually fine.' : '';
  if (total <= limit) {
    const detail = isCurrent(ctx)
      ? `${fmtDist(total, unit)} so far against ${fmtDist(prev, unit)} last week. You can run another ${fmtDist(limit - total, unit)} and stay within 10%.`
      : `${fmtDist(total, unit)} against ${fmtDist(prev, unit)} the week before.`;
    return { id: 'volume', title, level: 'good', value: pct(change), detail };
  }
  // Following the plan's own step-up isn't a problem; only running beyond it is.
  const plannedWeek = ctx.planned ? weekVolume(plannedAsActivities(ctx.planned), weekStart) : 0;
  if (plannedWeek > 0 && total <= plannedWeek * 1.05) {
    return {
      id: 'volume', title, level: 'good', value: pct(change),
      detail: `${fmtDist(total, unit)} against ${fmtDist(prev, unit)} last week. Your plan steps up here (${fmtDist(plannedWeek, unit)} planned), and you're within it.`,
    };
  }
  // Returning to normal after a cutback week isn't a real increase.
  const earlierPeak = Math.max(...[2, 3, 4].map((w) => weekVolume(runs, addDays(weekStart, -7 * w))));
  if (earlierPeak > prev && total <= earlierPeak * 1.1) {
    return {
      id: 'volume', title, level: 'good', value: pct(change),
      detail: `Up ${pct(change)} on last week, but last week was lighter. Compared with your recent peak of ${fmtDist(earlierPeak, unit)} this is within 10%, so it looks like a return from a cutback week.`,
    };
  }
  return {
    id: 'volume', title, level: change > 0.2 ? 'critical' : 'warning', value: pct(change),
    detail: `${fmtDist(total, unit)} against ${fmtDist(prev, unit)} last week, which is more than 10% above it (limit ${fmtDist(limit, unit)}). Sudden jumps in volume are a leading cause of running injuries.${lowBase}`,
  };
}

/** Long run should be no more than half of weekly volume. */
function longRunShare(ctx: WeekContext): Check | null {
  const runs = weekRuns(ctx);
  const total = sumKm(runs);
  if (total === 0) return null;
  const longest = runs.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a));
  const share = longest.distanceKm / total;
  const soFar = isCurrent(ctx) ? ' so far' : '';
  const base = `Longest run ${fmtDist(longest.distanceKm, ctx.unit)} on ${WEEKDAY_SHORT[weekdayIndex(longest.date)]} is ${Math.round(share * 100)}% of the week${soFar}.`;
  if (share <= 0.5) {
    const note = share > 0.35 ? ' That is allowed; many coaches aim for 25–35%.' : '';
    return { id: 'long-share', title: 'Long run ≤ 50% of volume', level: 'good', value: `${Math.round(share * 100)}%`, detail: base + note };
  }
  if (isCurrent(ctx)) return null; // still settling mid-week; judged once the week is over
  return {
    id: 'long-share', title: 'Long run ≤ 50% of volume', level: 'warning', value: `${Math.round(share * 100)}%`,
    detail: `${base} When one run carries over half the week, the body is not conditioned for it. Spread volume across more runs, or shorten the long run.`,
  };
}

/** Roughly 80% of running volume should be easy. */
function easyHardSplit(ctx: WeekContext): Check | null {
  const runs = weekRuns(ctx);
  if (runs.length < 3) return null;
  const total = sumKm(runs);
  const easy = sumKm(runs.filter((r) => EASY_TYPES.has(r.type)));
  const share = easy / total;
  const title = '80/20 easy–hard balance';
  const value = `${Math.round(share * 100)}% easy`;
  if (runs.some((r) => r.type === 'race')) return null; // a race week naturally leans hard
  if (share >= 0.75) return { id: 'split', title, level: 'good', value, detail: 'Most of your running is easy, which builds aerobic fitness while leaving you fresh for quality sessions.' };
  return {
    id: 'split', title, level: share >= 0.65 ? 'warning' : 'critical', value,
    detail: 'Aim for about 80% of volume at an easy, conversational effort. Too much hard running increases fatigue and injury risk without extra fitness.',
  };
}

/** No more than two or three quality sessions, and not on consecutive days. */
function hardSessions(ctx: WeekContext): Check | null {
  const runs = weekRuns(ctx);
  if (runs.length === 0) return null;
  const hardDates = [...new Set(runs.filter((r) => HARD_TYPES.has(r.type)).map((r) => r.date))].sort();
  const backToBack = hardDates.filter((d, i) => i > 0 && diffDays(d, hardDates[i - 1]) === 1);
  const title = 'Hard sessions';
  const value = `${hardDates.length}`;
  if (backToBack.length) {
    const pairs = backToBack.map((d) => `${WEEKDAY_SHORT[weekdayIndex(addDays(d, -1))]}–${WEEKDAY_SHORT[weekdayIndex(d)]}`).join(', ');
    return { id: 'hard', title, level: 'warning', value, detail: `Hard days back to back (${pairs}). Put at least one easy day or rest day between quality sessions so you can absorb them.` };
  }
  if (hardDates.length <= 2) return { id: 'hard', title, level: 'good', value, detail: 'Two quality sessions a week is plenty for most runners.' };
  return {
    id: 'hard', title, level: hardDates.length === 3 ? 'warning' : 'critical', value,
    detail: 'More than two hard days in a week is a lot to recover from. Unless you are experienced, turn one into an easy run.',
  };
}

/** At least one full rest day per week. */
function restDays(ctx: WeekContext): Check | null {
  const { weekStart, today } = ctx;
  const runDays = new Set(weekRuns(ctx).map((r) => r.date));
  const title = 'Rest day';
  if (!isCurrent(ctx)) {
    const rest = 7 - runDays.size;
    return rest >= 1
      ? { id: 'rest', title, level: 'good', value: `${rest}`, detail: `${rest} day${rest > 1 ? 's' : ''} off. Adaptation happens during recovery.` }
      : { id: 'rest', title, level: 'warning', value: '0', detail: 'You ran every day this week. At least one full rest day lowers injury risk and helps you absorb training.' };
  }
  const elapsed = diffDays(today, weekStart) + 1;
  const restSoFar = Array.from({ length: elapsed }, (_, i) => addDays(weekStart, i)).filter((d) => !runDays.has(d) && d < today).length;
  if (restSoFar >= 1) return { id: 'rest', title, level: 'good', value: `${restSoFar}`, detail: `You've had ${restSoFar} rest day${restSoFar > 1 ? 's' : ''} so far this week.` };
  if (runDays.size >= 7) return { id: 'rest', title, level: 'warning', value: '0', detail: 'You ran every day this week. At least one full rest day lowers injury risk and helps you absorb training.' };
  return null; // not a problem until the week runs out
}

/** Long runs shouldn't jump much beyond anything done in the last month. */
function longRunJump(ctx: WeekContext): Check | null {
  const runs = weekRuns(ctx);
  if (runs.length === 0 || runs.some((r) => r.type === 'race')) return null;
  const longest = Math.max(...runs.map((r) => r.distanceKm));
  const previous = between(ctx.runs, addDays(ctx.weekStart, -28), ctx.weekStart);
  if (previous.length === 0) return null;
  const prevMax = Math.max(...previous.map((r) => r.distanceKm));
  if (longest <= prevMax) return null;
  const jump = (longest - prevMax) / prevMax;
  const title = 'Long run progression';
  if (jump <= 0.15 || longest - prevMax <= 1.6) {
    return { id: 'long-jump', title, level: 'good', value: pct(jump), detail: `New longest run of the past month, ${fmtDist(longest, ctx.unit)}, a controlled step up from ${fmtDist(prevMax, ctx.unit)}.` };
  }
  return {
    id: 'long-jump', title, level: jump > 0.3 ? 'critical' : 'warning', value: pct(jump),
    detail: `${fmtDist(longest, ctx.unit)} against a previous max of ${fmtDist(prevMax, ctx.unit)} in the last 4 weeks. Grow the long run by about 1–2 km (or 1 mi) at a time.`,
  };
}

/** Acute:chronic workload ratio: last 7 days against the 4-week weekly average. */
function workload(ctx: WeekContext): Check | null {
  const ref = isCurrent(ctx) ? ctx.today : addDays(ctx.weekStart, 6);
  const running = ctx.runs.filter((r) => isRunningType(r.type) && r.date <= ref);
  if (running.length === 0) return null;
  const earliest = running.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const title = 'Training load (acute : chronic)';
  if (diffDays(ref, earliest) < 21) return null; // needs ~4 weeks of history
  const acute = sumKm(between(running, addDays(ref, -6), addDays(ref, 1)));
  const chronic = sumKm(between(running, addDays(ref, -27), addDays(ref, 1))) / 4;
  if (chronic === 0) return null;
  const ratio = acute / chronic;
  const value = ratio.toFixed(2);
  const base = `Last 7 days ${fmtDist(acute, ctx.unit)} against a 4-week average of ${fmtDist(chronic, ctx.unit)}/week.`;
  if (ratio > 1.5) return { id: 'acwr', title, level: 'critical', value, detail: `${base} A ratio above 1.5 is a load spike and carries a clearly higher injury risk. Ease off for a few days.` };
  if (ratio > 1.3) return { id: 'acwr', title, level: 'warning', value, detail: `${base} Above 1.3 you are building quickly. Keep the next few runs easy.` };
  if (ratio < 0.8) return null; // a lighter week (taper, cutback, recovery) isn't a problem
  return { id: 'acwr', title, level: 'good', value, detail: `${base} Between 0.8 and 1.3 is the sweet spot.` };
}

/** Easy runs should actually be easy. */
function easyPace(ctx: WeekContext): Check | null {
  const timedEasy = weekRuns(ctx).filter((r) => EASY_TYPES.has(r.type) && paceSecPerKm(r) != null);
  if (timedEasy.length === 0) return null;
  const title = 'Easy runs are easy';
  let floor: number | undefined;
  let source = '';
  if (ctx.easyPaceSecPerKm) {
    floor = ctx.easyPaceSecPerKm - 5;
    source = `your plan's easy pace of ${fmtPace(ctx.easyPaceSecPerKm, ctx.unit)}`;
  } else {
    const recentHard = between(ctx.runs, addDays(ctx.weekStart, -28), addDays(ctx.weekStart, 7)).filter((r) => HARD_TYPES.has(r.type) && paceSecPerKm(r) != null);
    if (recentHard.length) {
      const hardPace = recentHard.reduce((a, r) => a + r.durationSec!, 0) / sumKm(recentHard);
      floor = hardPace * 1.08;
      source = `your recent hard-session pace of ${fmtPace(hardPace, ctx.unit)}`;
    }
  }
  if (floor == null) return null; // no plan pace or timed hard runs to compare against
  const tooFast = timedEasy.filter((r) => paceSecPerKm(r)! < floor!);
  if (tooFast.length === 0) return { id: 'easy-pace', title, level: 'good', detail: `All timed easy runs were comfortably slower than ${source}.` };
  const list = tooFast.map((r) => `${formatShort(r.date)} (${fmtPace(paceSecPerKm(r)!, ctx.unit)})`).join(', ');
  return {
    id: 'easy-pace', title, level: 'warning', value: `${tooFast.length}`,
    detail: `Easy runs faster than expected compared with ${source}: ${list}. Running easy days too fast is one of the most common training mistakes.`,
  };
}

/** Volume should come down in the last 2–3 weeks before a race. */
function taper(ctx: WeekContext): Check | null {
  if (!ctx.raceDate) return null;
  const weeksOut = Math.floor(diffDays(ctx.raceDate, ctx.weekStart) / 7);
  if (weeksOut < 0 || weeksOut > 2) return null;
  const peak = Math.max(0, ...Array.from({ length: 8 }, (_, i) => weekVolume(ctx.runs, addDays(ctx.weekStart, -7 * (i + 1)))));
  if (peak === 0) return null;
  const target = [0.5, 0.7, 0.85][weeksOut];
  const volume = sumKm(weekRuns(ctx).filter((r) => r.type !== 'race'));
  const label = weeksOut === 0 ? 'race week' : `${weeksOut} week${weeksOut > 1 ? 's' : ''} out`;
  const detail = `${label}: aim for no more than ~${Math.round(target * 100)}% of your peak week (${fmtDist(peak * target, ctx.unit)} of ${fmtDist(peak, ctx.unit)}). Keep some intensity but cut volume, so you arrive rested.`;
  return volume <= peak * target * 1.05
    ? { id: 'taper', title: 'Taper', level: 'good', value: `${Math.round((volume / peak) * 100)}% of peak`, detail }
    : { id: 'taper', title: 'Taper', level: 'warning', value: `${Math.round((volume / peak) * 100)}% of peak`, detail };
}

/** Planned against actual for the week. */
function adherence(ctx: WeekContext): Check | null {
  if (!ctx.planned) return null;
  const weekEnd = addDays(ctx.weekStart, 7);
  const cutoff = isCurrent(ctx) ? addDays(ctx.today, 1) : weekEnd;
  const plannedSoFar = sumKm(between(plannedAsActivities(ctx.planned), ctx.weekStart, cutoff));
  if (plannedSoFar === 0) return null;
  const actualSoFar = sumKm(between(ctx.runs, ctx.weekStart, cutoff));
  const ratio = actualSoFar / plannedSoFar;
  const ranDates = new Set(between(ctx.runs, ctx.weekStart, cutoff).map((r) => r.date));
  const missedKey = ctx.planned.filter(
    (w) => w.date >= ctx.weekStart && w.date < cutoff && w.date < ctx.today && (w.type === 'long' || HARD_TYPES.has(w.type)) && !ranDates.has(w.date),
  );
  const title = 'Plan vs actual';
  const value = `${Math.round(ratio * 100)}%`;
  const scope = isCurrent(ctx) ? 'so far this week' : 'this week';
  const base = `${fmtDist(actualSoFar, ctx.unit)} run of ${fmtDist(plannedSoFar, ctx.unit)} planned ${scope}.`;
  const missed = missedKey.length ? ` Missed key sessions: ${missedKey.map((w) => `${WEEKDAY_SHORT[weekdayIndex(w.date)]} ${w.title ?? w.type}`).join(', ')}.` : '';
  if (ratio > 1.15) return { id: 'plan', title, level: 'warning', value, detail: `${base} Running well over plan is how overuse injuries start; the plan's progression is deliberate.${missed}` };
  if (ratio >= 0.85) return { id: 'plan', title, level: 'good', value, detail: base + missed };
  return {
    id: 'plan', title, level: missedKey.length ? 'warning' : 'info', value,
    detail: `${base}${missed} Don't try to make up missed distance later; just pick the plan back up.`,
  };
}

export interface PlanWeekIssue {
  weekIndex: number;
  message: string;
}

/** Sanity checks on a plan before importing it: the same rules, applied to planned volume. */
export function planIssues(workouts: PlannedWorkout[], weekStarts: ISODate[]): PlanWeekIssue[] {
  const acts: Activity[] = plannedAsActivities(workouts);
  const vols = weekStarts.map((w) => weekVolume(acts, w));
  const issues: PlanWeekIssue[] = [];
  weekStarts.forEach((ws, i) => {
    const recentPeak = Math.max(0, ...vols.slice(Math.max(0, i - 3), i));
    if (i > 0 && recentPeak > 0 && vols[i] > recentPeak * 1.1) {
      issues.push({ weekIndex: i, message: `Week ${i + 1} volume is ${pct(vols[i] / recentPeak - 1)} over the recent peak (10% rule).` });
    }
    const runs = between(acts, ws, addDays(ws, 7)).filter((a) => a.type !== 'race');
    const total = sumKm(runs);
    if (runs.length > 1 && total > 0) {
      const longest = Math.max(...runs.map((r) => r.distanceKm));
      if (longest / total > 0.5) issues.push({ weekIndex: i, message: `Week ${i + 1} long run is ${Math.round((longest / total) * 100)}% of the week's volume (limit 50%).` });
    }
  });
  return issues;
}
