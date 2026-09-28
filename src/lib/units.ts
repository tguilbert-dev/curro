export type Unit = 'km' | 'mi';

export const KM_PER_MI = 1.609344;

export function toKm(value: number, unit: Unit): number {
  return unit === 'mi' ? value * KM_PER_MI : value;
}

export function fromKm(km: number, unit: Unit): number {
  return unit === 'mi' ? km / KM_PER_MI : km;
}

export function fmtDist(km: number, unit: Unit, digits = 1): string {
  const v = fromKm(km, unit);
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${unit}`;
}

/** "m:ss" or "h:mm:ss" → seconds, or null when malformed. */
export function parseClock(s: string): number | null {
  const parts = s.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * A run's duration as typed on a phone. ":", ".", "," or spaces all separate the parts, since
 * number keyboards often lack ":". One part = minutes ("45"), two = m:s ("45.30"),
 * three = h:m:s ("1,05,00"). Returns seconds, undefined for empty, or null when malformed.
 */
export function parseDuration(s: string): number | null | undefined {
  const parts = s.trim().split(/\s*[:.,\s]\s*/);
  if (parts.length === 1 && parts[0] === '') return undefined;
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  const [h, m, sec] = nums.length === 1 ? [0, nums[0], 0] : nums.length === 2 ? [0, nums[0], nums[1]] : nums;
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** A decimal typed with either "." or "," as the separator; NaN when malformed. */
export function parseDecimal(s: string): number {
  const t = s.trim().replace(',', '.');
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? parseFloat(t) : NaN;
}

export function fmtClock(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Pace is stored as seconds per km and displayed per the user's unit. */
export function fmtPace(secPerKm: number, unit: Unit): string {
  const perUnit = unit === 'mi' ? secPerKm * KM_PER_MI : secPerKm;
  return `${fmtClock(perUnit)} /${unit}`;
}

export function paceToSecPerKm(pace: string, unit: Unit): number | null {
  const sec = parseClock(pace);
  if (sec == null) return null;
  return unit === 'mi' ? sec / KM_PER_MI : sec;
}
