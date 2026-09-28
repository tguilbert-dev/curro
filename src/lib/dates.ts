// All calendar dates are local "YYYY-MM-DD" strings. Arithmetic goes through a UTC day
// number so daylight-saving changes never shift a date.

export type ISODate = string;

const DAY_MS = 86_400_000;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(fromDayNumber(dayNumber(s))) === s;
}

export function dayNumber(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / DAY_MS);
}

function fromDayNumber(n: number): Date {
  return new Date(n * DAY_MS);
}

function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function today(): ISODate {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(fromDayNumber(dayNumber(d) + n));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return dayNumber(a) - dayNumber(b);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(d: ISODate): number {
  return (fromDayNumber(dayNumber(d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekdayIndex(d));
}

export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function startOfMonth(d: ISODate): ISODate {
  return d.slice(0, 8) + '01';
}

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m] = d.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
}

export function daysInMonth(d: ISODate): number {
  return diffDays(addMonths(d, 1), startOfMonth(d));
}

export function formatShort(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

export function formatLong(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${WEEKDAY_SHORT[weekdayIndex(d)]} ${day} ${MONTHS[m - 1]} ${y}`;
}

export function formatMonth(d: ISODate): string {
  const [y, m] = d.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function formatWeekRange(weekStart: ISODate): string {
  return `${formatShort(weekStart)} – ${formatShort(addDays(weekStart, 6))}`;
}
