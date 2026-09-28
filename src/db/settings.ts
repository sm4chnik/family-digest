import type { Env } from "../env";
import { getSetting, setSetting, getRoundIntervalHours } from "./client";

export async function getSubmissionWindowMinutes(env: Env): Promise<number> {
  const raw = await getSetting(env.DB, "submission_window_minutes");
  const n = Number(raw ?? "30");
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function getSoftPingAfterMinutes(env: Env): Promise<number> {
  const raw = await getSetting(env.DB, "soft_ping_after_minutes");
  const n = Number(raw ?? "20");
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/** Allowed range for admin-configured round interval (hours). */
export const INTERVAL_HOURS_MIN = 1;
export const INTERVAL_HOURS_MAX = 72;

export async function setRoundIntervalHours(env: Env, hours: number): Promise<number> {
  if (!Number.isInteger(hours) || hours < INTERVAL_HOURS_MIN || hours > INTERVAL_HOURS_MAX) {
    throw new Error(
      `Интервал должен быть целым числом от ${INTERVAL_HOURS_MIN} до ${INTERVAL_HOURS_MAX} часов.`,
    );
  }
  await setSetting(env.DB, "round_interval_hours", String(hours));
  return hours;
}

export { getRoundIntervalHours };
