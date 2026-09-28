import type { RoundRow } from "./types";
import { nowIso } from "./client";

const ROUND_COLUMNS =
  "id, started_at, window_ends_at, soft_ping_at, soft_ping_sent_at, closed_at, published_at, status";

export async function getOpenRound(db: D1Database): Promise<RoundRow | null> {
  return (
    (await db
      .prepare(
        `SELECT ${ROUND_COLUMNS}
         FROM rounds
         WHERE status = 'open'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .first<RoundRow>()) ?? null
  );
}

export async function getClosingRound(db: D1Database): Promise<RoundRow | null> {
  return (
    (await db
      .prepare(
        `SELECT ${ROUND_COLUMNS}
         FROM rounds
         WHERE status = 'closing'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .first<RoundRow>()) ?? null
  );
}

export async function getLatestRound(db: D1Database): Promise<RoundRow | null> {
  return (
    (await db
      .prepare(`SELECT ${ROUND_COLUMNS} FROM rounds ORDER BY id DESC LIMIT 1`)
      .first<RoundRow>()) ?? null
  );
}

export async function getRoundById(db: D1Database, id: number): Promise<RoundRow | null> {
  return (
    (await db
      .prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = ?`)
      .bind(id)
      .first<RoundRow>()) ?? null
  );
}

export async function createRound(
  db: D1Database,
  startedAt: Date,
  windowMinutes: number,
  softPingAfterMinutes: number,
): Promise<RoundRow> {
  const started = startedAt.toISOString();
  const windowEnds = new Date(startedAt.getTime() + windowMinutes * 60_000).toISOString();
  const softPingAt = new Date(startedAt.getTime() + softPingAfterMinutes * 60_000).toISOString();

  const round = await db
    .prepare(
      `INSERT INTO rounds (started_at, window_ends_at, soft_ping_at, status)
       VALUES (?, ?, ?, 'open')
       RETURNING ${ROUND_COLUMNS}`,
    )
    .bind(started, windowEnds, softPingAt)
    .first<RoundRow>();

  if (!round) throw new Error("Failed to create round");
  return round;
}

/** Claim open → closing; returns false if already claimed/closed. */
export async function claimRoundForClosing(db: D1Database, roundId: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE rounds
       SET status = 'closing', closed_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .bind(nowIso(), roundId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markRoundSoftPingSent(db: D1Database, roundId: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE rounds
       SET soft_ping_sent_at = ?
       WHERE id = ? AND soft_ping_sent_at IS NULL AND status = 'open'`,
    )
    .bind(nowIso(), roundId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markRoundPublished(db: D1Database, roundId: number): Promise<void> {
  await db
    .prepare(
      `UPDATE rounds
       SET status = 'published', published_at = ?
       WHERE id = ?`,
    )
    .bind(nowIso(), roundId)
    .run();
}

export async function recordNotification(
  db: D1Database,
  roundId: number,
  userId: number,
  kind: "reminder" | "soft_ping",
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO notifications (round_id, user_id, kind, sent_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(roundId, userId, kind, nowIso())
      .run();
    return (result.meta.changes ?? 0) > 0;
  } catch {
    // UNIQUE(round_id, user_id, kind) — already sent
    return false;
  }
}

/** Drop a claim so a later cron tick can retry after a failed Telegram send. */
export async function releaseNotification(
  db: D1Database,
  roundId: number,
  userId: number,
  kind: "reminder" | "soft_ping",
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM notifications
       WHERE round_id = ? AND user_id = ? AND kind = ?`,
    )
    .bind(roundId, userId, kind)
    .run();
}
