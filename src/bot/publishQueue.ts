import type { Env } from "../env";
import { getUser } from "../db/users";
import type { SubmissionRow } from "../db/types";
import {
  listUnpublished,
  listUnpublishedForRound,
  markPublished,
} from "../db/submissions";
import { TelegramClient } from "../telegram/api";
import { checkChannelAccess, requireChannelId } from "../telegram/channel";
import { publishMediaToChannel } from "../telegram/publish";

export interface PublishQueueResult {
  published: number;
  failed: number;
  errors: string[];
}

async function publishItems(env: Env, items: SubmissionRow[]): Promise<PublishQueueResult> {
  if (items.length === 0) {
    return { published: 0, failed: 0, errors: [] };
  }

  const channelId = requireChannelId(env);
  const access = await checkChannelAccess(env);
  if (!access.ok) {
    throw new Error(access.details.join("; "));
  }

  const tg = new TelegramClient(env.BOT_TOKEN);
  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const user = await getUser(env.DB, item.user_id);
      const name = user?.display_name ?? String(item.user_id);
      const caption = `от ${name}`;
      const msg = await publishMediaToChannel(
        tg,
        channelId,
        item.media_type,
        item.telegram_file_id,
        caption,
      );
      await markPublished(env.DB, item.id, msg.message_id);
      published += 1;
    } catch (err) {
      failed += 1;
      errors.push(`#${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { published, failed, errors };
}

/** Publish all unpublished submissions (manual admin tool). */
export async function publishUnpublishedQueue(env: Env): Promise<PublishQueueResult> {
  return publishItems(env, await listUnpublished(env.DB));
}

/** Publish submissions assigned to a specific round (auto-close). */
export async function publishRoundQueue(
  env: Env,
  targetRoundId: number,
): Promise<PublishQueueResult> {
  return publishItems(env, await listUnpublishedForRound(env.DB, targetRoundId));
}
