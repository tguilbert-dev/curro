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
