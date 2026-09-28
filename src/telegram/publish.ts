import { TelegramClient, type TelegramMessageResult } from "./api";
import type { MediaType } from "../db/types";

export async function publishMediaToChannel(
  tg: TelegramClient,
  channelId: string,
  mediaType: MediaType,
  fileId: string,
  caption: string,
): Promise<TelegramMessageResult> {
  switch (mediaType) {
    case "photo":
      return tg.sendPhoto(channelId, fileId, caption);
    case "video":
      return tg.sendVideo(channelId, fileId, caption);
    case "video_note": {
      // Bot API has no caption for video notes — post note, then author line.
      const note = await tg.sendVideoNote(channelId, fileId);
      await tg.sendMessage(channelId, caption);
      return note;
    }
    default: {
      const _exhaustive: never = mediaType;
      throw new Error(`Unsupported media type: ${_exhaustive}`);
    }
  }
}

export async function publishTestPost(
  tg: TelegramClient,
  channelId: string,
): Promise<TelegramMessageResult> {
  const ts = new Date().toISOString();
  return tg.sendMessage(
    channelId,
    `✅ Family Digest Bot — тестовый пост\n${ts}`,
  );
}
