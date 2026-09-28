import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, daysInMonth, isValidDate, startOfWeek, weekdayIndex } from './dates';
import { weeklyChecks, planIssues, type WeekContext } from './heuristics';
import { extractJson, importPlan, parsePlan } from './plan';
import { buildPrompt, EMPTY_ANSWERS, weeksUntil } from './prompt';
import { daysPerWeek, trend } from './activities';
import { buildReviewPrompt, comparePlans } from './review';
import { dayStatus } from './stats';
import { fmtPace, parseClock } from './units';
import type { Run, StoredPlan } from '../types';

const example = readFileSync('examples/half-marathon-12-weeks.json', 'utf8');

describe('dates', () => {
  it('handles weeks and months', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0); // Monday
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday → its Monday
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // across a DST change
    expect(daysInMonth('2028-02-10')).toBe(29);
    expect(isValidDate('2026-02-30')).toBe(false);
  });
});

describe('units', () => {
  it('parses clocks and formats pace', () => {
    expect(parseClock('1:05:30')).toBe(3930);
    expect(parseClock('5:75')).toBeNull();
    expect(fmtPace(300, 'km')).toBe('5:00 /km');
    expect(fmtPace(300, 'mi')).toBe('8:03 /mi');
  });
});

describe('plan import', () => {
  it('accepts the example plan and resolves dates backwards from the race', () => {
    const res = parsePlan(example, '2026-09-27');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { plan } = res;
    expect(plan.weeks).toHaveLength(12);
    expect(plan.startDate).toBe('2026-09-28');
    expect(plan.workouts.at(-1)).toMatchObject({ date: '2026-12-20', type: 'race' });
    expect(res.warnings).toEqual([]);
    expect(planIssues(plan.workouts, plan.weeks.map((w) => w.start))).toEqual([]);
  });

  it('extracts JSON from a chatbot reply with code fences', () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```\nGood luck!')).toEqual({ a: 1 });
  });

  it('converts miles to km', () => {
    const plan = JSON.parse(example);
    plan.units = 'mi';
    const res = importPlan(plan, '2026-09-27');
    expect(res.ok && res.plan.race.distanceKm).toBeCloseTo(21.1 * 1.609344);
  });

  it('reports schema errors readably', () => {
    const plan = JSON.parse(example);
    plan.weeks[0].days[0].type = 'jog';
    plan.extra = true;
    const res = importPlan(plan);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('unknown field "extra"'))).toBe(true);
    expect(res.errors.some((e) => e.startsWith('weeks › 0 › days › 0 › type: must be one of'))).toBe(true);
  });

  it('rejects duplicate weekdays and adds a missing race day', () => {
    const dup = JSON.parse(example);
    dup.weeks[0].days.push({ day: 'tue', type: 'easy', distance: 3 });
    expect(importPlan(dup).ok).toBe(false);

    const noRace = JSON.parse(example);
    noRace.weeks.at(-1).days.pop();
    const res = importPlan(noRace, '2026-09-27');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.workouts.at(-1)).toMatchObject({ date: '2026-12-20', type: 'race' });
      expect(res.warnings[0]).toMatch(/added automatically/);
    }
  });

  it('flags plans that break the 10% and long-run rules', () => {
    const res = importPlan(JSON.parse(example), '2026-09-27') as { ok: true; plan: StoredPlan };
    const w = res.plan.workouts.find((x) => x.weekIndex === 1 && x.type === 'long')!;
    w.distanceKm = 20;
    const issues = planIssues(res.plan.workouts, res.plan.weeks.map((x) => x.start));
    expect(issues.map((i) => i.message).join('\n')).toMatch(/Week 2 volume[\s\S]*10% rule[\s\S]*Week 2 long run/);
  });
});

describe('prompt', () => {
  it('counts weeks and embeds the schema', () => {
    expect(weeksUntil('2026-12-20', '2026-09-28')).toBe(12);
    const text = buildPrompt({ ...EMPTY_ANSWERS, raceDate: '2026-12-20' }, '2026-09-27');
    expect(text).toContain('Weeks available: 12 (from the week starting Monday 2026-09-28');
    expect(text).toContain('"$id": "urn:curro:plan:v1"');
  });
});

const run = (date: string, distanceKm: number, type: Run['type'] = 'easy', durationSec?: number): Run => ({ date, distanceKm, type, durationSec });
const ctx = (runs: Run[], extra: Partial<WeekContext> = {}): WeekContext => ({
  weekStart: '2026-09-21', runs, today: '2026-09-30', unit: 'km', ...extra,
});
const byId = (checks: ReturnType<typeof weeklyChecks>, id: string) => checks.find((c) => c.id === id);

describe('weekly checks', () => {
  const lastWeek = [run('2026-09-15', 8), run('2026-09-17', 8), run('2026-09-20', 14, 'long')]; // 30 km

  it('applies the 10% rule', () => {
    const ok = weeklyChecks(ctx([...lastWeek, run('2026-09-22', 10), run('2026-09-24', 10), run('2026-09-27', 13, 'long')]));
    expect(byId(ok, 'volume')?.level).toBe('good');
    const over = weeklyChecks(ctx([...lastWeek, run('2026-09-22', 12), run('2026-09-24', 12), run('2026-09-27', 16, 'long')]));
    expect(byId(over, 'volume')).toMatchObject({ level: 'critical', value: '+33%' });
  });

  it('treats a return from a cutback week as fine', () => {
    const history = [run('2026-09-06', 30, 'long'), run('2026-09-13', 30, 'long'), run('2026-09-20', 20, 'long'), run('2026-09-27', 30, 'long')];
    expect(byId(weeklyChecks(ctx(history)), 'volume')?.level).toBe('info');
  });

  it('checks long-run share, back-to-back hard days and rest days', () => {
    const week = [run('2026-09-22', 5, 'tempo'), run('2026-09-23', 5, 'intervals'), run('2026-09-27', 12, 'long')];
    const checks = weeklyChecks(ctx(week));
    expect(byId(checks, 'long-share')).toMatchObject({ level: 'warning', value: '55%' });
    expect(byId(checks, 'hard')?.level).toBe('warning');
    expect(byId(checks, 'hard')?.detail).toContain('Tue–Wed');
    expect(byId(checks, 'rest')?.level).toBe('good');
    expect(byId(checks, 'split')?.level).toBe('critical');
  });

  it('computes the acute:chronic ratio once there is enough history', () => {
    const steady = [0, 1, 2].map((i) => run(addDays('2026-09-06', -7 * i), 20, 'long'));
    const spike = weeklyChecks(ctx([...steady, run('2026-09-20', 20, 'long'), run('2026-09-27', 45, 'long')]));
    expect(byId(spike, 'acwr')?.level).toBe('critical');
  });

  it('flags easy runs that are too fast against the plan pace', () => {
    const checks = weeklyChecks(ctx([run('2026-09-22', 10, 'easy', 10 * 330)], { easyPaceSecPerKm: 375 }));
    expect(byId(checks, 'easy-pace')?.level).toBe('warning');
  });

  it('compares plan to actual', () => {
    const planned = [
      { date: '2026-09-22', type: 'tempo' as const, distanceKm: 10, weekIndex: 0 },
      { date: '2026-09-27', type: 'long' as const, distanceKm: 16, weekIndex: 0 },
    ];
    const checks = weeklyChecks(ctx([run('2026-09-24', 10)], { planned }));
    expect(byId(checks, 'plan')).toMatchObject({ level: 'warning', value: '38%' });
    expect(byId(checks, 'plan')?.detail).toContain('Missed key sessions');
  });
});

describe('day status', () => {
  const planned = { date: '2026-09-22', type: 'easy' as const, distanceKm: 10, weekIndex: 0 };
  it('classifies planned days', () => {
    expect(dayStatus('2026-09-22', planned, [run('2026-09-22', 9.5)], '2026-09-25')).toBe('done');
    expect(dayStatus('2026-09-22', planned, [run('2026-09-22', 5)], '2026-09-25')).toBe('partial');
    expect(dayStatus('2026-09-22', planned, [], '2026-09-25')).toBe('missed');
    expect(dayStatus('2026-09-22', planned, [], '2026-09-20')).toBe('upcoming');
    expect(dayStatus('2026-09-23', undefined, [run('2026-09-23', 5)], '2026-09-25')).toBe('extra');
  });
});

describe('activities', () => {
  const logs = [
    { date: '2026-09-01', activityId: 1 }, { date: '2026-09-03', activityId: 1 },
    { date: '2026-09-08', activityId: 1 }, { date: '2026-09-08', activityId: 2 },
    { date: '2026-09-15', activityId: 1 }, { date: '2026-09-16', activityId: 1 }, { date: '2026-09-17', activityId: 1 },
  ];
  it('counts days per week for one activity', () => {
    expect(daysPerWeek(logs, 1, ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'])).toEqual([2, 1, 3, 0]);
  });
  it('compares the last 4 complete weeks with the 4 before, ignoring the current week', () => {
    expect(trend([1, 1, 1, 1, 3, 3, 3, 3, 0]).trend).toBe('up');
    expect(trend([3, 3, 3, 3, 1, 1, 1, 1, 7])).toMatchObject({ trend: 'down', recentAvg: 1, previousAvg: 3 });
    expect(trend([2, 2, 2, 2, 2, 2, 2, 2, 0]).trend).toBe('steady');
  });
});

describe('review & adjust', () => {
  const base = (importPlan(JSON.parse(example), '2026-09-27') as { ok: true; plan: StoredPlan }).plan;

  it('picks the JSON out of a reply that has an assessment with braces before it', () => {
    const reply = 'You are on track {mostly}. Changes below.\n\n```json\n{"a": {"b": 1}}\n```\nGood luck {!}';
    expect(extractJson(reply)).toEqual({ a: { b: 1 } });
  });

  it('diffs an adjusted plan week by week', () => {
    const raw = JSON.parse(example);
    raw.weeks[2].days[3].distance = 10; // week 3 long run 11 -> 10
    raw.weeks[3].days.splice(1, 1); // drop week 4 quality session
    const next = (importPlan(raw, '2026-09-27') as { ok: true; plan: StoredPlan }).plan;
    const diff = comparePlans(base, next, '2026-10-14');
    expect(diff).toMatchObject({ sameRace: true, sameWeeks: true, pastChanges: 0 });
    expect(diff.weeks.map((w) => [w.index, w.oldKm, w.newKm, w.changedDays])).toEqual([[2, 29, 28, 1], [3, 23, 17, 1]]);
    expect(comparePlans(base, next, '2026-10-20').pastChanges).toBe(1);
  });

  it('builds a prompt with plan vs actual, missed sessions and optional cross-training', () => {
    const runs = [run('2026-09-29', 5), run('2026-10-02', 5, 'easy', 1800)];
    const opts = { plan: base, runs, today: '2026-10-04', weeksBack: 2, note: 'Tight calf' };
    const text = buildReviewPrompt(opts);
    expect(text).toContain('This is plan week 1 of 12');
    expect(text).toContain('2026-09-30 Wed | MISSED | planned: Easy + 6 strides 6.0 km');
    expect(text).toContain('2026-10-02 Fri | Easy 5.0 km | 30:00 (6:00 /km)');
    expect(text).toContain('In my own words: Tight calf');
    expect(text).toContain('exactly 12 weeks');
    expect(text).not.toContain('Cross-training (days done per week)');
    const withCross = buildReviewPrompt({ ...opts, cross: { activities: [{ id: 1, name: 'Boxing', active: true, createdAt: '2026-09-01' }], logs: [{ date: '2026-09-29', activityId: 1 }, { date: '2026-10-01', activityId: 1 }] } });
    expect(withCross).toContain('| Boxing | 0 | 2 (Tue Thu) |');
  });
});
