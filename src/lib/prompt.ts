import { addDays, diffDays, mondayOf, today, weekdayIndex, type ISODate } from './dates';
import { planSchema } from './plan';
import type { Unit } from './units';

export interface PromptAnswers {
  raceName: string;
  raceDate: ISODate;
  raceDistance: string;
  goalTime: string;
  units: Unit;
  currentWeekly: string;
  longestRecent: string;
  runsPerWeek: string;
  longRunDay: string;
  experience: string;
  notes: string;
}

export const EMPTY_ANSWERS: PromptAnswers = {
  raceName: '',
  raceDate: '',
  raceDistance: '',
  goalTime: '',
  units: 'km',
  currentWeekly: '',
  longestRecent: '',
  runsPerWeek: '4',
  longRunDay: 'Sunday',
  experience: '',
  notes: '',
};

const or = (v: string, fallback = '(not given — make a sensible assumption and say so in `description`)') =>
  v.trim() || fallback;

/** Number of Monday-to-Sunday weeks from this week up to and including race week. */
export function weeksUntil(raceDate: ISODate, from: ISODate = today()): number {
  return Math.floor(diffDays(mondayOf(raceDate), mondayOf(from)) / 7) + 1;
}

export function buildPrompt(a: PromptAnswers, now: ISODate = today()): string {
  const weeks = a.raceDate ? weeksUntil(a.raceDate, now) : null;
  const firstMonday = weekdayIndex(now) >= 5 ? addDays(mondayOf(now), 7) : mondayOf(now);
  const available = a.raceDate ? weeksUntil(a.raceDate, firstMonday) : null;
  const weekLine = weeks && available && available > 0
    ? `- Weeks available: ${available} (from the week starting Monday ${firstMonday}, through race week). Use fewer weeks if a shorter plan suits me better, but never more.`
    : '- Weeks available: work it out from today and the race date.';

  return `You are an experienced running coach. Write me a personalised training plan as a single JSON document that validates against the "Curro training plan" JSON Schema below. I will import the file into my running app.

## About me and my race
- Today: ${now}
- Race: ${or(a.raceName, '(unnamed race)')}
- Race date: ${or(a.raceDate, '(not given — ask me)')}
- Race distance: ${or(a.raceDistance)} ${a.units}
- Goal time: ${or(a.goalTime, 'finish strong, no specific goal')}
- Units for the plan: ${a.units}
- Current weekly volume: ${or(a.currentWeekly)} ${a.currentWeekly.trim() ? a.units : ''}
- Longest run in the last month: ${or(a.longestRecent)} ${a.longestRecent.trim() ? a.units : ''}
- Runs per week I can do: ${or(a.runsPerWeek)}
- Preferred long-run day: ${or(a.longRunDay)}
- Experience: ${or(a.experience)}
- Injuries, constraints, other notes: ${or(a.notes, 'none')}
${weekLine}

## How the file works
- Weeks run Monday to Sunday. The LAST item in \`weeks\` must be race week (the week containing the race date); earlier weeks are counted backwards from it, so do NOT put dates on workouts. Use the weekday keys mon/tue/wed/thu/fri/sat/sun.
- Only list days with a workout; unlisted days are rest days. Put the race itself in the final week on its weekday with \`"type": "race"\`.
- Give every running day a \`distance\` in ${a.units} (including warm-up and cool-down), so weekly volume can be tracked.
- Put the details of each session in \`title\` (short) and \`description\` (full instructions). Fill in \`paces\` (at least \`easy\` and \`race\`) based on my goal and current fitness.

## Coaching rules to follow
- Start from my current weekly volume. Never increase weekly volume by more than 10% over the previous week.
- Keep the long run at no more than 50% of the week's volume (ideally 25–35%), and grow it gradually.
- About 80% of volume should be easy running. At most two hard sessions per week, never on consecutive days.
- At least one full rest day per week.
- Include a cutback week (about 20–30% less volume) every 3–4 weeks.
- Taper over the final 2–3 weeks (roughly 85%, 70%, then 50% of peak volume in race week) while keeping some race-pace work.
- Explain the plan's approach in \`description\`.

## Output
Reply with ONLY the JSON (no commentary), starting with {"$schema": "urn:curro:plan:v1", "schemaVersion": 1, ...}. It must validate against this schema:

\`\`\`json
${JSON.stringify(planSchema, null, 2)}
\`\`\`
`;
}
