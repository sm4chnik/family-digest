/** Narrow Telegram Update types used by the bot (expand in later stages). */

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  video?: { file_id: string };
  video_note?: { file_id: string };
  animation?: { file_id: string };
  document?: { file_id: string; mime_type?: string; file_name?: string };
  sticker?: { file_id: string };
  voice?: { file_id: string };
  audio?: { file_id: string };
  location?: unknown;
  contact?: unknown;
}

/** True when the message looks like media/content we intentionally reject. */
export function isUnsupportedContent(message: TelegramMessage): boolean {
  return Boolean(
    message.sticker ||
      message.animation ||
      message.document ||
      message.voice ||
      message.audio ||
      message.location ||
      message.contact,
  );
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
}

export function displayNameFromUser(user: TelegramUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || String(user.id);
}
