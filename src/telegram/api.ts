/**
 * Minimal Telegram Bot API client (fetch-based).
 */

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly description?: string,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export interface TelegramBotUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface ChatMember {
  status: ChatMemberStatus;
  user: TelegramBotUser;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
}

export interface TelegramMessageResult {
  message_id: number;
  date: number;
  chat: TelegramChat;
}

export class TelegramClient {
  constructor(private readonly token: string) {}

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.apiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
      error_code?: number;
    };

    if (!data.ok) {
      throw new TelegramError(
        `Telegram ${method} failed: ${data.description ?? res.statusText}`,
        method,
        data.description,
      );
    }

    return data.result as T;
  }

  getMe() {
    return this.call<TelegramBotUser>("getMe");
  }

  getChat(chatId: number | string) {
    return this.call<TelegramChat>("getChat", { chat_id: chatId });
  }

  getChatMember(chatId: number | string, userId: number) {
    return this.call<ChatMember>("getChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
  }

  sendMessage(chatId: number | string, text: string, extra?: Record<string, unknown>) {
    return this.call<TelegramMessageResult>("sendMessage", {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  sendPhoto(chatId: number | string, fileId: string, caption?: string) {
    return this.call<TelegramMessageResult>("sendPhoto", {
      chat_id: chatId,
      photo: fileId,
      ...(caption ? { caption } : {}),
    });
  }

  sendVideo(chatId: number | string, fileId: string, caption?: string) {
    return this.call<TelegramMessageResult>("sendVideo", {
      chat_id: chatId,
      video: fileId,
      ...(caption ? { caption } : {}),
    });
  }

  sendVideoNote(chatId: number | string, fileId: string) {
    return this.call<TelegramMessageResult>("sendVideoNote", {
      chat_id: chatId,
      video_note: fileId,
    });
  }

  setWebhook(url: string, secretToken?: string) {
    return this.call("setWebhook", {
      url,
      ...(secretToken ? { secret_token: secretToken } : {}),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  deleteWebhook(dropPendingUpdates = false) {
    return this.call("deleteWebhook", {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  getWebhookInfo() {
    return this.call<{
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      ip_address?: string;
    }>("getWebhookInfo");
  }

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      show_alert: showAlert,
    });
  }

  editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    extra?: Record<string, unknown>,
  ) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...extra,
    });
  }

  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.call("setMyCommands", { commands });
  }

  getMyCommands() {
    return this.call<Array<{ command: string; description: string }>>("getMyCommands");
  }
}
