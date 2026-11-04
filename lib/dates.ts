// Calendar dates in Doha time, as ISO strings ("2026-11-05"). All arithmetic
// is done in UTC on the date itself, so the device's time zone never matters.
// Mirrors private.qatar_today() / private.is_working_day() in the database.

import type { IsoDate } from "./types";

export const TIME_ZONE = "Asia/Qatar";
const DAY_MS = 86_400_000;

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

/** Today's date in Doha. */
export function qatarToday(now: Date = new Date()): IsoDate {
  return isoFormatter.format(now);
}

/** The calendar date (Doha) of a timestamp. */
export function qatarDate(timestamp: string | Date): IsoDate {
  return isoFormatter.format(typeof timestamp === "string" ? new Date(timestamp) : timestamp);
}

export function qatarHour(now: Date = new Date()): number {
  return Number(hourFormatter.format(now));
}

function toUtc(day: IsoDate): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: IsoDate, n: number): IsoDate {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(day: IsoDate): number {
  return new Date(toUtc(day)).getUTCDay();
}

/** Qatar's working week is Sunday to Thursday. */
export function isWorkingDay(day: IsoDate): boolean {
  return dayOfWeek(day) <= 4;
}

/** The Sunday that starts the week containing `day`. */
export function weekStart(day: IsoDate): IsoDate {
  return addDays(day, -dayOfWeek(day));
}

export function weekDays(day: IsoDate): IsoDate[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(day: IsoDate): IsoDate {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(month: IsoDate, n: number): IsoDate {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUtc(d.getTime());
}

export function monthEnd(month: IsoDate): IsoDate {
  return addDays(addMonths(monthStart(month), 1), -1);
}

export function workingDaysOfMonth(month: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = monthStart(month); d <= monthEnd(month); d = addDays(d, 1)) {
    if (isWorkingDay(d)) days.push(d);
  }
  return days;
}

/**
 * Due date for item `seq` (1-based) of `quantity` in a month: the middle of
 * the seq-th of n equal slices of the month's working days. Same formula as
 * public.generate_month_deliverables().
 */
export function spreadDueDate(month: IsoDate, seq: number, quantity: number): IsoDate {
  const days = workingDaysOfMonth(month);
  return days[Math.floor(((2 * seq - 1) * days.length) / (2 * quantity))];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function weekdayShort(day: IsoDate): string {
  return WEEKDAY[dayOfWeek(day)];
}

export function dayNumber(day: IsoDate): number {
  return Number(day.slice(8, 10));
}

/** "Thu, 5 Nov" */
export function formatShort(day: IsoDate): string {
  return `${weekdayShort(day)}, ${dayNumber(day)} ${MONTH[Number(day.slice(5, 7)) - 1]}`;
}

/** "November 2026" */
export function formatMonth(day: IsoDate): string {
  return `${MONTH_LONG[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** "Nov" */
export function monthShort(day: IsoDate): string {
  return MONTH[Number(day.slice(5, 7)) - 1];
}

/** "Today", "Tomorrow", "Yesterday", or "Thu, 5 Nov". */
export function formatRelative(day: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatShort(day);
}

export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "3h", "2d" style durations from hours. */
export function formatHours(hours: number): string {
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** "just now", "12m ago", "5h ago", "3d ago" */
export function timeAgo(ts: string, nowMs: number): string {
  const mins = (nowMs - Date.parse(ts)) / 60_000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** "Wednesday, 4 November" */
export function formatLong(day: IsoDate): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${names[dayOfWeek(day)]}, ${dayNumber(day)} ${MONTH_LONG[Number(day.slice(5, 7)) - 1]}`;
}
