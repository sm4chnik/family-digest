import type { UserRow } from "./types";
import { nowIso } from "./client";

const USER_COLUMNS =
  "telegram_id, display_name, timezone, dnd_enabled, dnd_start_minute, dnd_end_minute, onboarded_at, created_at, updated_at, pending_action, reminders_paused";

export async function getUser(db: D1Database, telegramId: number): Promise<UserRow | null> {
  return (
    (await db
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE telegram_id = ?`)
      .bind(telegramId)
      .first<UserRow>()) ?? null
  );
}

export async function upsertUserShell(
  db: D1Database,
  telegramId: number,
  displayName: string,
): Promise<UserRow> {
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO users (telegram_id, display_name, dnd_enabled, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    )
    .bind(telegramId, displayName, ts, ts)
    .run();

  const user = await getUser(db, telegramId);
  if (!user) throw new Error("Failed to upsert user");
  return user;
}

export async function setPendingAction(
  db: D1Database,
  telegramId: number,
  pendingAction: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET pending_action = ?, updated_at = ? WHERE telegram_id = ?`)
    .bind(pendingAction, nowIso(), telegramId)
    .run();
}

export async function setTimezone(
  db: D1Database,
  telegramId: number,
  timezone: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET timezone = ?, pending_action = NULL, updated_at = ? WHERE telegram_id = ?`,
    )
    .bind(timezone, nowIso(), telegramId)
    .run();
}

export async function setDnd(
  db: D1Database,
  telegramId: number,
  enabled: boolean,
  startMinute: number | null,
  endMinute: number | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET
         dnd_enabled = ?,
         dnd_start_minute = ?,
         dnd_end_minute = ?,
         pending_action = NULL,
         updated_at = ?
       WHERE telegram_id = ?`,
    )
    .bind(enabled ? 1 : 0, startMinute, endMinute, nowIso(), telegramId)
    .run();
}

export async function markOnboarded(db: D1Database, telegramId: number): Promise<void> {
  const ts = nowIso();
  await db
    .prepare(
      `UPDATE users SET
         onboarded_at = COALESCE(onboarded_at, ?),
         pending_action = NULL,
         updated_at = ?
       WHERE telegram_id = ?`,
    )
    .bind(ts, ts, telegramId)
    .run();
}

export function isOnboarded(user: UserRow): boolean {
  return Boolean(user.onboarded_at && user.timezone);
}

export function isRemindersPaused(user: UserRow): boolean {
  return Boolean(user.reminders_paused);
}

export async function setRemindersPaused(
  db: D1Database,
  telegramId: number,
  paused: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET reminders_paused = ?, updated_at = ? WHERE telegram_id = ?`,
    )
    .bind(paused ? 1 : 0, nowIso(), telegramId)
    .run();
}

export async function listOnboardedUsers(db: D1Database): Promise<UserRow[]> {
  const result = await db
    .prepare(
      `SELECT ${USER_COLUMNS}
       FROM users
       WHERE onboarded_at IS NOT NULL AND timezone IS NOT NULL`,
    )
    .all<UserRow>();
  return result.results ?? [];
}
