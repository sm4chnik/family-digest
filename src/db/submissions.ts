import type { MediaType, SubmissionRow } from "./types";
import { nowIso } from "./client";

export interface NewSubmission {
  userId: number;
  roundId: number | null;
  targetRoundId: number | null;
  fileId: string;
  mediaType: MediaType;
}

export async function insertSubmission(db: D1Database, input: NewSubmission): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO submissions (
         user_id, round_id, target_round_id, telegram_file_id, media_type, received_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.userId,
      input.roundId,
      input.targetRoundId,
      input.fileId,
      input.mediaType,
      nowIso(),
    )
    .run();

  const id = result.meta.last_row_id;
  if (!id) throw new Error("Failed to insert submission");
  return Number(id);
}

export async function listUnpublished(db: D1Database): Promise<SubmissionRow[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, round_id, target_round_id, telegram_file_id, media_type,
              received_at, published_at, channel_message_id
       FROM submissions
       WHERE published_at IS NULL
       ORDER BY id ASC`,
    )
    .all<SubmissionRow>();
  return result.results ?? [];
}

export async function listUnpublishedForRound(
  db: D1Database,
  targetRoundId: number,
): Promise<SubmissionRow[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, round_id, target_round_id, telegram_file_id, media_type,
              received_at, published_at, channel_message_id
       FROM submissions
       WHERE published_at IS NULL AND target_round_id = ?
       ORDER BY id ASC`,
    )
    .bind(targetRoundId)
    .all<SubmissionRow>();
  return result.results ?? [];
}

export async function assignLateQueueToRound(db: D1Database, roundId: number): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE submissions
       SET target_round_id = ?
       WHERE published_at IS NULL AND target_round_id IS NULL`,
    )
    .bind(roundId)
    .run();
  return result.meta.changes ?? 0;
}

export async function userHasSubmissionForRound(
  db: D1Database,
  userId: number,
  targetRoundId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM submissions
       WHERE user_id = ? AND target_round_id = ?
       LIMIT 1`,
    )
    .bind(userId, targetRoundId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function listUserIdsWithSubmissionForRound(
  db: D1Database,
  targetRoundId: number,
): Promise<Set<number>> {
  const result = await db
    .prepare(
      `SELECT DISTINCT user_id
       FROM submissions
       WHERE target_round_id = ?`,
    )
    .bind(targetRoundId)
    .all<{ user_id: number }>();
  return new Set((result.results ?? []).map((r) => r.user_id));
}

export async function countUnpublished(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM submissions WHERE published_at IS NULL`)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function markPublished(
  db: D1Database,
  submissionId: number,
  channelMessageId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE submissions
       SET published_at = ?, channel_message_id = ?
       WHERE id = ?`,
    )
    .bind(nowIso(), channelMessageId, submissionId)
    .run();
}
