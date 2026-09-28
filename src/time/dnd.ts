import type { UserRow } from "../db/types";
import { formatMinuteOfDay, getLocalMinuteOfDay } from "./timezone";

export const DND_MAX_MINUTES = 12 * 60;

/** Duration of a daily DND window in minutes (supports overnight). */
export function dndDurationMinutes(startMinute: number, endMinute: number): number {
  if (startMinute === endMinute) return 0;
  if (startMinute < endMinute) return endMinute - startMinute;
  return 1440 - startMinute + endMinute;
}

export function assertValidDndWindow(startMinute: number, endMinute: number): void {
  const duration = dndDurationMinutes(startMinute, endMinute);
  if (duration <= 0) {
    throw new Error("Интервал «не беспокоить» не может быть пустым.");
  }
  if (duration > DND_MAX_MINUTES) {
    throw new Error("«Не беспокоить» — не больше 12 часов в сутки.");
  }
}

/**
 * Whether `now` falls inside the user's local DND window.
 * Overnight windows (e.g. 23:00–08:00) are supported.
 */
export function isInDnd(user: UserRow, now = new Date()): boolean {
  if (!user.dnd_enabled) return false;
  if (user.dnd_start_minute == null || user.dnd_end_minute == null) return false;
  if (!user.timezone) return false;

  const minute = getLocalMinuteOfDay(now, user.timezone);
  const start = user.dnd_start_minute;
  const end = user.dnd_end_minute;

  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function formatDndSummary(user: UserRow): string {
  if (!user.dnd_enabled || user.dnd_start_minute == null || user.dnd_end_minute == null) {
    return "выключен";
  }
  return `${formatMinuteOfDay(user.dnd_start_minute)}–${formatMinuteOfDay(user.dnd_end_minute)}`;
}

/** Popular presets: [startMinute, endMinute] */
export const DND_PRESETS: Array<{ start: number; end: number; label: string }> = [
  { start: 23 * 60, end: 8 * 60, label: "23:00–08:00" },
  { start: 22 * 60, end: 7 * 60, label: "22:00–07:00" },
  { start: 0, end: 8 * 60, label: "00:00–08:00" },
  { start: 1 * 60, end: 9 * 60, label: "01:00–09:00" },
];
