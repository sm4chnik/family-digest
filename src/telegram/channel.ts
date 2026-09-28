import type { Env } from "../env";
import { TelegramClient, TelegramError, type ChatMember } from "./api";

export function requireChannelId(env: Env): string {
  const id = (env.CHANNEL_ID ?? "").trim();
  if (!id) {
    throw new Error("CHANNEL_ID is not configured");
  }
  return id;
}

export interface ChannelAccessReport {
  ok: boolean;
  channelId: string;
  chatTitle?: string;
  chatType?: string;
  botUsername?: string;
  memberStatus?: ChatMember["status"];
  canPost: boolean;
  details: string[];
}

/**
 * Verify the bot can see the channel and post messages there.
 */
export async function checkChannelAccess(env: Env): Promise<ChannelAccessReport> {
  const channelId = requireChannelId(env);
  const tg = new TelegramClient(env.BOT_TOKEN);
  const details: string[] = [];

  const me = await tg.getMe();
  details.push(`bot: @${me.username ?? me.id}`);

  let chatTitle: string | undefined;
  let chatType: string | undefined;
  try {
    const chat = await tg.getChat(channelId);
    chatTitle = chat.title;
    chatType = chat.type;
    details.push(`chat: ${chat.title ?? chat.id} (${chat.type})`);
  } catch (err) {
    const msg = err instanceof TelegramError ? err.description ?? err.message : String(err);
    details.push(`getChat failed: ${msg}`);
    details.push("Проверьте CHANNEL_ID и что бот добавлен в канал.");
    return {
      ok: false,
      channelId,
      botUsername: me.username,
      canPost: false,
      details,
    };
  }

  let member: ChatMember;
  try {
    member = await tg.getChatMember(channelId, me.id);
    details.push(`member status: ${member.status}`);
  } catch (err) {
    const msg = err instanceof TelegramError ? err.description ?? err.message : String(err);
    details.push(`getChatMember failed: ${msg}`);
    return {
      ok: false,
      channelId,
      chatTitle,
      chatType,
      botUsername: me.username,
      canPost: false,
      details,
    };
  }

  const isAdmin = member.status === "administrator" || member.status === "creator";
  // In channels, posting usually requires administrator + can_post_messages.
  // Some setups omit the flag; treat explicit false as denied.
  const canPostFlag = member.can_post_messages;
  const canPost = isAdmin && canPostFlag !== false;

  if (!isAdmin) {
    details.push("Бот должен быть администратором канала.");
  } else if (canPostFlag === false) {
    details.push("У бота выключено право Post Messages / Публикация сообщений.");
  } else {
    details.push("Права на публикацию выглядят ок.");
  }

  return {
    ok: canPost,
    channelId,
    chatTitle,
    chatType,
    botUsername: me.username,
    memberStatus: member.status,
    canPost,
    details,
  };
}
