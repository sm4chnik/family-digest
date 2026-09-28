import type { Env } from "../env";
import { getOpenRound } from "../db/rounds";
import { insertSubmission } from "../db/submissions";
import { getUser, isOnboarded } from "../db/users";
import type { MediaType } from "../db/types";
import type { TelegramClient } from "../telegram/api";
import type { TelegramMessage } from "../telegram/types";
import { COPY } from "./copy";

export interface ExtractedMedia {
  mediaType: MediaType;
  fileId: string;
}

export function extractMedia(message: TelegramMessage): ExtractedMedia | null {
  if (message.photo && message.photo.length > 0) {
    const best = message.photo[message.photo.length - 1]!;
    return { mediaType: "photo", fileId: best.file_id };
  }
  if (message.video?.file_id) {
    return { mediaType: "video", fileId: message.video.file_id };
  }
  if (message.video_note?.file_id) {
    return { mediaType: "video_note", fileId: message.video_note.file_id };
  }
  return null;
}

export type IngestResult =
  | { ok: true; submissionId: number; intoCurrentRound: boolean }
  | { ok: false; reason: "need_start" | "need_onboarding" };

/**
 * Save inbound private media. Without an open submission window → late queue (target_round_id NULL).
 */
export async function ingestUserMedia(
  env: Env,
  userId: number,
  media: ExtractedMedia,
  now = new Date(),
): Promise<IngestResult> {
  const user = await getUser(env.DB, userId);
  if (!user) return { ok: false, reason: "need_start" };
  if (!isOnboarded(user)) return { ok: false, reason: "need_onboarding" };

  const open = await getOpenRound(env.DB);
  const withinWindow =
    open != null && now.getTime() < Date.parse(open.window_ends_at);

  const roundId = open?.id ?? null;
  const targetRoundId = withinWindow ? open!.id : null;

  const submissionId = await insertSubmission(env.DB, {
    userId,
    roundId,
    targetRoundId,
    fileId: media.fileId,
    mediaType: media.mediaType,
  });

  return { ok: true, submissionId, intoCurrentRound: withinWindow };
}

export async function replyIngestResult(
  tg: TelegramClient,
  chatId: number,
  result: IngestResult,
): Promise<void> {
  if (!result.ok) {
    await tg.sendMessage(
      chatId,
      result.reason === "need_start" ? COPY.needStart : COPY.needOnboarding,
    );
    return;
  }

  await tg.sendMessage(
    chatId,
    result.intoCurrentRound
      ? COPY.acceptedCurrent(result.submissionId)
      : COPY.acceptedLate(result.submissionId),
  );
}
