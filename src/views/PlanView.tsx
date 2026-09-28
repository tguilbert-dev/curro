import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { activatePlan, db } from '../db';
import { TypePill } from '../components/ui';
import { downloadText } from '../lib/backup';
import { addDays, formatLong, formatShort, formatWeekRange, startOfWeek } from '../lib/dates';
import { planIssues } from '../lib/heuristics';
import { parsePlan, planSchema, type ImportResult } from '../lib/plan';
import { buildPrompt, EMPTY_ANSWERS, type PromptAnswers } from '../lib/prompt';
import { buildReviewPrompt, comparePlans } from '../lib/review';
import { plannedAsActivities, weekVolume } from '../lib/stats';
import { fmtDist, fmtPace } from '../lib/units';
import { TYPE_LABEL, type StoredPlan } from '../types';
import examplePlan from '../../examples/half-marathon-12-weeks.json';

export function PlanView() {
  const { plan } = useApp();
  return (
    <>
      {plan && <ActivePlan plan={plan} />}
      {plan && <ReviewCard plan={plan} />}
      <ImportCard />
      <PromptBuilder />
      <ArchivedPlans />
    </>
  );
}

function ActivePlan({ plan }: { plan: StoredPlan }) {
  const { settings, today } = useApp();
  const unit = settings.units;
  const acts = plannedAsActivities(plan.workouts);
  const vols = plan.weeks.map((w) => weekVolume(acts, w.start));
  const raw = plan.raw as { paces?: Record<string, string> };
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <p className="small muted">Active plan</p>
          <h2>{plan.name}</h2>
        </div>
        <button className="btn small" onClick={() => downloadText(`${plan.name.replace(/[^\w-]+/g, '-')}.json`, JSON.stringify(plan.raw, null, 2))}>
          Download JSON
        </button>
      </div>
      <p className="secondary small">
        {plan.race.name} · {formatLong(plan.race.date)} · {fmtDist(plan.race.distanceKm, unit)}
        {plan.race.goalTime && ` · goal ${plan.race.goalTime}`} · {plan.weeks.length} weeks, peak {fmtDist(Math.max(...vols), unit)}/week
        {plan.author && ` · by ${plan.author}`}
      </p>
      {plan.description && <p className="small">{plan.description}</p>}
      {raw.paces && (
        <p className="small secondary">
          Paces ({plan.sourceUnits}):{' '}
          {Object.entries(raw.paces)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
          {plan.easyPaceSecPerKm && unit !== plan.sourceUnits && ` (easy ≈ ${fmtPace(plan.easyPaceSecPerKm, unit)})`}
        </p>
      )}
      <details>
        <summary className="small">All weeks</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          {plan.weeks.map((w, i) => (
            <div key={w.start} className="stack" style={{ gap: 4 }}>
              <div className="row small" style={{ fontWeight: 600 }}>
                <span style={today >= w.start && today < plan.weeks[i + 1]?.start ? { color: 'var(--accent)' } : undefined}>
                  Week {i + 1} · {formatWeekRange(w.start)}
                </span>
                {w.focus && <span className="pill">{w.focus}</span>}
                <span className="spacer" />
                <span className="num">{fmtDist(vols[i], unit)}</span>
              </div>
              {plan.workouts
                .filter((x) => x.weekIndex === i && x.type !== 'rest')
                .map((x) => (
                  <div key={x.date} className="row small" style={{ paddingLeft: 8 }}>
                    <span className="muted" style={{ width: 48 }}>{formatShort(x.date)}</span>
                    <TypePill type={x.type} />
                    <span>{x.title ?? TYPE_LABEL[x.type]}</span>
                    <span className="spacer" />
                    {x.distanceKm != null && <span className="num secondary">{fmtDist(x.distanceKm, unit)}</span>}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function ImportCard() {
  const file = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState<string>();
  return (
    <section className="card">
      <h2>Import a plan</h2>
      <p className="small secondary">
        Open the <code>.json</code> file you emailed yourself (save the attachment, then choose it here), or paste the JSON the chatbot gave you.
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => file.current?.click()}>
          Choose file…
        </button>
        <SamplePlanButton />
        <input
          ref={file}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setFileText(await f.text());
            e.target.value = '';
          }}
        />
      </div>
      <PlanImporter placeholder='…or paste JSON here: {"schemaVersion": 1, …}' incoming={fileText} />
    </section>
  );
}

/** Paste box → validation → preview (with changes vs the active plan) → apply. */
function PlanImporter({ placeholder, incoming }: { placeholder: string; incoming?: string }) {
  const { settings, goTo, plan: current, today } = useApp();
  const unit = settings.units;
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  function check(t: string) {
    setText(t);
    setResult(t.trim() ? parsePlan(t) : null);
  }
  useEffect(() => {
    if (incoming != null) check(incoming);
  }, [incoming]);

  async function confirmImport(plan: StoredPlan) {
    await activatePlan(plan);
    setText('');
    setResult(null);
    goTo('today');
  }

  const next = result?.ok ? result.plan : null;
  const issues = next ? planIssues(next.workouts, next.weeks.map((w) => w.start)) : [];
  const diff = next && current ? comparePlans(current, next, today) : null;
  const isRevision = !!diff?.sameRace;
  const notes = [
    ...(result?.ok ? result.warnings : []),
    ...(next && !isRevision && next.startDate < startOfWeek(today)
      ? [`The plan started on ${formatLong(next.startDate)}; workouts before today will show as missed unless you log them.`]
      : []),
    ...(diff && isRevision && !diff.sameWeeks ? ['The weeks have shifted compared with your current plan, so planned days in the past will line up differently.'] : []),
    ...(diff && isRevision && diff.pastChanges > 0
      ? [`${diff.pastChanges} workout${diff.pastChanges > 1 ? 's' : ''} before today changed, so your plan-vs-actual history will be compared against the new plan.`]
      : []),
    ...issues.map((i) => i.message),
  ];

  return (
    <>
      <textarea placeholder={placeholder} value={text} onChange={(e) => check(e.target.value)} rows={4} />
      {result && !result.ok && (
        <div className="notice error">
          <strong>This plan can't be imported yet</strong>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="small" style={{ marginTop: 6 }}>
            Tip: paste these errors back to the chatbot and ask it to fix the JSON.
          </p>
        </div>
      )}
      {next && (
        <div className="stack">
          <div className="notice ok">
            <strong>{next.name}</strong>
            <br />
            {next.race.name} on {formatLong(next.race.date)} · {fmtDist(next.race.distanceKm, unit)} · {next.weeks.length} weeks starting {formatLong(next.startDate)}
            {next.description && <p className="small" style={{ marginTop: 6 }}>{next.description}</p>}
          </div>
          {diff && isRevision && (
            <div className="notice">
              <strong>Changes vs your current plan</strong>
              {diff.weeks.length === 0 ? (
                <p className="small">No workouts changed.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Was</th>
                        <th>Now</th>
                        <th>Changed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.weeks.map((w) => (
                        <tr key={w.start}>
                          <td>
                            {w.index + 1} · {formatShort(w.start)}
                          </td>
                          <td>{fmtDist(w.oldKm, unit)}</td>
                          <td>
                            <strong>{fmtDist(w.newKm, unit)}</strong>
                          </td>
                          <td>{w.changedDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {diff && !isRevision && <p className="small secondary">This is for a different race date than your current plan, so it will be treated as a new plan.</p>}
          {notes.length > 0 && (
            <div className="notice warn">
              <strong>Worth checking</strong>
              <ul>
                {notes.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn primary" onClick={() => confirmImport(next)}>
            {isRevision ? 'Apply the adjusted plan' : 'Use this plan'}
          </button>
          <p className="small muted">
            {current ? 'Your current plan is archived (you can restore it under Previous plans). ' : ''}Logged runs are kept.
          </p>
        </div>
      )}
    </>
  );
}

function ReviewCard({ plan }: { plan: StoredPlan }) {
  const { runs, today } = useApp();
  const activities = useLiveQuery(() => db.crossActivities.toArray(), []) ?? [];
  const crossLogs = useLiveQuery(() => db.crossLogs.toArray(), []) ?? [];
  const [weeksBack, setWeeksBack] = useState(6);
  const [includeCross, setIncludeCross] = useState(true);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const withCross = includeCross && activities.length > 0;
  const prompt = buildReviewPrompt({
    plan,
    runs,
    today,
    weeksBack,
    note,
    cross: withCross ? { activities: activities.filter((a) => a.active || crossLogs.some((l) => l.activityId === a.id)), logs: crossLogs } : undefined,
  });
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copy failed. Open "Show prompt", select the text and copy it manually.');
    }
  }

  return (
    <section className="card">
      <h2>Review &amp; adjust with AI</h2>
      <p className="small secondary">
        Get a chatbot to compare your recent training with the plan and send back an adjusted version. The completed weeks and the race date stay the same.
      </p>
      <ol className="small secondary" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Choose what to include and copy the prompt.</li>
        <li>Paste it into ChatGPT, Claude, Gemini or similar.</li>
        <li>Copy the whole reply and paste it into the box below.</li>
      </ol>
      <div className="grid-2">
        <label className="field">
          History to include
          <select value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))}>
            {[4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                Last {n} weeks
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Cross-training
          <span className="row" style={{ minHeight: 42, flexWrap: 'nowrap' }}>
            <input type="checkbox" checked={withCross} disabled={activities.length === 0} onChange={(e) => setIncludeCross(e.target.checked)} />
            <span className="small">{activities.length ? `Include ${activities.map((a) => a.name).join(', ')}` : 'None tracked yet'}</span>
          </span>
        </label>
      </div>
      <label className="field">
        Anything the log doesn't show? (optional)
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sore Achilles since Tuesday; away next week" />
      </label>
      <div className="row">
        <button className="btn primary" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
        {canShare && (
          <button className="btn" onClick={() => navigator.share({ text: prompt }).catch(() => {})}>
            Share to app…
          </button>
        )}
        <span className="small muted">{Math.round(prompt.length / 1000)}k characters</span>
      </div>
      <details>
        <summary className="small">Show prompt</summary>
        <pre className="prompt" style={{ marginTop: 8 }}>
          {prompt}
        </pre>
      </details>
      <PlanImporter placeholder="Paste the chatbot's whole reply here (the assessment is fine, the JSON is picked out)" />
    </section>
  );
}

export function SamplePlanButton() {
  const { goTo, today } = useApp();
  async function load() {
    // Move the race to Sunday of the 12th week from now so the sample always starts this week.
    const sample = { ...examplePlan, race: { ...examplePlan.race, date: addDays(startOfWeek(today), 7 * 11 + 6) } };
    const res = parsePlan(JSON.stringify(sample), today);
    if (res.ok && confirm('Load the 12-week half marathon sample plan? It will replace your active plan, if any.')) {
      await activatePlan(res.plan);
      goTo('today');
    }
  }
  return (
    <button className="btn" onClick={load}>
      Try the sample plan
    </button>
  );
}

function PromptBuilder() {
  const { settings } = useApp();
  const [a, setA] = useState<PromptAnswers>({ ...EMPTY_ANSWERS, units: settings.units });
  const [copied, setCopied] = useState(false);
  const prompt = buildPrompt(a);
  const set = (k: keyof PromptAnswers) => (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copy failed. Select the text and copy it manually.');
    }
  }

  return (
    <section className="card">
      <h2>Get a plan from an AI chatbot</h2>
      <ol className="small secondary" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Fill in what you know below (all optional).</li>
        <li>Copy the prompt and paste it into ChatGPT, Claude, Gemini or similar.</li>
        <li>Save the JSON reply as a file (or email it to yourself) and import it above.</li>
      </ol>
      <div className="grid-2">
        <label className="field">
          Race name
          <input type="text" value={a.raceName} onChange={set('raceName')} placeholder="Berlin Marathon" />
        </label>
        <label className="field">
          Race date
          <input type="date" value={a.raceDate} onChange={set('raceDate')} />
        </label>
        <label className="field">
          Distance ({a.units})
          <input type="text" inputMode="decimal" value={a.raceDistance} onChange={set('raceDistance')} placeholder={a.units === 'km' ? '42.2' : '26.2'} />
        </label>
        <label className="field">
          Goal time
          <input type="text" value={a.goalTime} onChange={set('goalTime')} placeholder="3:45:00" />
        </label>
        <label className="field">
          Current weekly distance ({a.units})
          <input type="text" inputMode="decimal" value={a.currentWeekly} onChange={set('currentWeekly')} />
        </label>
        <label className="field">
          Longest recent run ({a.units})
          <input type="text" inputMode="decimal" value={a.longestRecent} onChange={set('longestRecent')} />
        </label>
        <label className="field">
          Runs per week
          <select value={a.runsPerWeek} onChange={set('runsPerWeek')}>
            {['3', '4', '5', '6', '7'].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Long-run day
          <select value={a.longRunDay} onChange={set('longRunDay')}>
            {['Saturday', 'Sunday', 'Friday', 'Any'].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Units
          <select value={a.units} onChange={set('units')}>
            <option value="km">km</option>
            <option value="mi">miles</option>
          </select>
        </label>
        <label className="field">
          Experience
          <input type="text" value={a.experience} onChange={set('experience')} placeholder="2 years running, 1 half marathon" />
        </label>
      </div>
      <label className="field">
        Injuries, constraints, other notes
        <input type="text" value={a.notes} onChange={set('notes')} placeholder="Achilles niggle; can't run Wednesdays" />
      </label>
      <pre className="prompt">{prompt}</pre>
      <div className="row">
        <button className="btn primary" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
        <button className="btn" onClick={() => downloadText('curro-plan.v1.schema.json', JSON.stringify(planSchema, null, 2))}>
          Download schema
        </button>
        <a className="btn ghost" href="./schema/curro-plan.v1.schema.json" target="_blank" rel="noreferrer">
          Schema URL
        </a>
      </div>
    </section>
  );
}

function ArchivedPlans() {
  const plans = useLiveQuery(() => db.plans.where('status').equals('archived').reverse().sortBy('importedAt'), []);
  if (!plans?.length) return null;
  async function restore(p: StoredPlan) {
    await db.transaction('rw', db.plans, async () => {
      await db.plans.where('status').equals('active').modify({ status: 'archived' });
      await db.plans.update(p.id!, { status: 'active' });
    });
  }
  return (
    <section className="card">
      <h2>Previous plans</h2>
      {plans.map((p) => (
        <div key={p.id} className="run-row">
          <span style={{ minWidth: 0 }}>
            <strong>{p.name}</strong>
            <br />
            <span className="small secondary">
              {p.race.name} · {formatLong(p.race.date)}
            </span>
          </span>
          <span className="spacer" />
          <button className="btn small" onClick={() => restore(p)}>
            Make active
          </button>
          <button className="btn small danger" onClick={() => confirm(`Delete "${p.name}"?`) && db.plans.delete(p.id!)}>
            Delete
          </button>
        </div>
      ))}
    </section>
  );
}
