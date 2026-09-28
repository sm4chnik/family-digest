import type { Env } from "../env";

export type SqlValue = string | number | null;

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, value)
    .run();
}

export async function getRoundIntervalHours(env: Env): Promise<number> {
  const raw = await getSetting(env.DB, "round_interval_hours");
  const n = Number(raw ?? "2");
  return Number.isFinite(n) && n > 0 ? n : 2;
}

export function nowIso(): string {
  return new Date().toISOString();
}
