import { useEffect, useRef, useState } from 'react';
import { formatShort, formatWeekRange, type ISODate } from '../lib/dates';
import { fmtDist, fromKm, type Unit } from '../lib/units';
import { CATEGORY_LABEL, RUN_CATEGORIES, type RunCategory } from '../types';

export interface WeekDatum {
  start: ISODate;
  actualKm: number;
  /** Actual distance split by category; sums to actualKm. */
  byCat: Record<RunCategory, number>;
  plannedKm: number;
  isCurrent: boolean;
  isRace: boolean;
}

const HEIGHT = 220;
const M = { top: 12, right: 8, bottom: 26, left: 36 };

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 10, step: 5 };
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { max: Math.ceil(v / step) * step, step };
}

const GAP = 2; // surface-coloured gap between stacked segments

/** Weekly volume: actual as columns stacked easy → long → hard, planned as a tick across each week's slot. */
export function VolumeChart({ data, unit, showPlanned }: { data: WeekDatum[]; unit: Unit; showPlanned: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = data.flatMap((d) => [fromKm(d.actualKm, unit), showPlanned ? fromKm(d.plannedKm, unit) : 0]);
  const { max, step } = niceMax(Math.max(...values, 0));
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, band - 2);
  const y = (v: number) => M.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(46 / band);
  // Always label "Now" and "Race"; drop regular date labels that would collide with them.
  const special = data.flatMap((d, i) => (d.isCurrent || d.isRace ? [i] : []));
  const showLabel = (i: number) =>
    special.includes(i) || (i % labelEvery === 0 && special.every((s) => Math.abs(s - i) >= labelEvery));

  const hovered = hover != null ? data[hover] : null;
  const prev = hover != null && hover > 0 ? data[hover - 1] : null;

  return (
    <div className="chart-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg className="chart" width={width} height={HEIGHT} role="img" aria-label={`Weekly distance in ${unit}. A table view is available below.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = M.left + band * i + band / 2;
          const x0 = cx - barW / 2;
          // Stack segments bottom-up; only the top segment gets rounded corners.
          const present = RUN_CATEGORIES.filter((c) => d.byCat[c] > 0);
          let acc = 0;
          const segments = present.map((c, k) => {
            const bottom = y(acc);
            acc += fromKm(d.byCat[c], unit);
            const top = y(acc);
            const lower = k === 0 ? bottom : bottom - GAP / 2;
            const upper = k === present.length - 1 ? top : top + GAP / 2;
            const h = lower - upper;
            if (h <= 0.5) return null;
            const r = k === present.length - 1 ? Math.min(4, h, barW / 2) : 0;
            const path = `M${x0},${lower} V${upper + r} Q${x0},${upper} ${x0 + r},${upper} H${x0 + barW - r} Q${x0 + barW},${upper} ${x0 + barW},${upper + r} V${lower} Z`;
            return <path key={c} d={path} fill={`var(--cat-${c})`} />;
          });
          const pv = fromKm(d.plannedKm, unit);
          const tickW = Math.min(barW + 10, band - 2);
          return (
            <g key={d.start} opacity={hover == null || hover === i ? 1 : 0.55}>
              {segments}
              {showPlanned && pv > 0 && (
                <line x1={cx - tickW / 2} x2={cx + tickW / 2} y1={y(pv)} y2={y(pv)} stroke="var(--ink-2)" strokeWidth={2.5} strokeLinecap="round" />
              )}
              {showLabel(i) ? (
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" style={d.isCurrent || d.isRace ? { fill: 'var(--ink)', fontWeight: 600 } : undefined}>
                  {d.isRace ? 'Race' : d.isCurrent ? 'Now' : formatShort(d.start)}
                </text>
              ) : null}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className="tooltip" style={{ left: Math.min(Math.max(M.left + band * hover! + band / 2, 90), width - 90), top: M.top + 10 }}>
          <strong>Week of {formatWeekRange(hovered.start)}</strong>
          <div>
            <strong>Actual {fmtDist(hovered.actualKm, unit)}</strong>
            {prev && prev.actualKm > 0 && hovered.actualKm > 0 && (
              <span className="muted"> ({hovered.actualKm >= prev.actualKm ? '+' : ''}{Math.round((hovered.actualKm / prev.actualKm - 1) * 100)}%)</span>
            )}
          </div>
          {RUN_CATEGORIES.filter((c) => hovered.byCat[c] > 0).map((c) => (
            <div key={c}>
              <span className="k" style={{ background: `var(--cat-${c})` }} />
              {CATEGORY_LABEL[c]} {fmtDist(hovered.byCat[c], unit)}
              <span className="muted"> ({Math.round((hovered.byCat[c] / hovered.actualKm) * 100)}%)</span>
            </div>
          ))}
          {showPlanned && hovered.plannedKm > 0 && (
            <div>
              <span className="k" style={{ background: 'var(--ink-2)', height: 3, verticalAlign: 3 }} />
              Planned {fmtDist(hovered.plannedKm, unit)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
