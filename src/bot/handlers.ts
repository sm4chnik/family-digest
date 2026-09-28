import type { Env } from "../env";
import { isAdmin } from "../env";
import { countUnpublished } from "../db/submissions";
import { getLatestRound, getOpenRound } from "../db/rounds";
import {
  getRoundIntervalHours,
  INTERVAL_HOURS_MAX,
  INTERVAL_HOURS_MIN,
  setRoundIntervalHours,
} from "../db/settings";
import { listOnboardedUsers, getUser, isRemindersPaused, setRemindersPaused } from "../db/users";
import { TelegramClient, TelegramError } from "../telegram/api";
import { checkChannelAccess, requireChannelId } from "../telegram/channel";
import { publishTestPost } from "../telegram/publish";
import type { TelegramUpdate } from "../telegram/types";
import { isUnsupportedContent } from "../telegram/types";
import { startRound } from "../rounds/scheduler";
import { listMissingSubmitters } from "./adminStatus";
import { ensureBotCommands } from "./commands";
import { COPY } from "./copy";
import { extractMedia, ingestUserMedia, replyIngestResult } from "./ingest";
import { publishUnpublishedQueue } from "./publishQueue";
import { buildScheduleText } from "./schedule";
import {
  handlePendingText,
  handleSettingsCallback,
  showSettings,
  startOnboarding,
} from "./settings";

function adminCommandsHint(isUserAdmin: boolean): string {
  const base = "/start, /help, /settings, /schedule, /pause, /resume, /ping";
  return isUserAdmin
    ? `${base}, /status, /channelcheck, /testpost, /queue, /publish, /startround, /interval, /missing`
    : base;
}

/**
 * Route inbound Telegram updates (private chats).
 */
export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const tg = new TelegramClient(env.BOT_TOKEN);

  if (update.callback_query) {
    const cq = update.callback_query;
    const chat = cq.message?.chat;
    if (!chat || chat.type !== "private") {
      await tg.answerCallbackQuery(cq.id);
      return;
    }

    const data = cq.data ?? "";
    try {
      const toast = await handleSettingsCallback(
        env,
        tg,
        cq.from.id,
        chat.id,
        cq.message?.message_id,
        data,
      );
      await tg.answerCallbackQuery(cq.id, toast);
    } catch (err) {
      console.error("callback failed", err);
      await tg.answerCallbackQuery(
        cq.id,
        err instanceof Error ? err.message : "Ошибка",
        true,
      );
    }
    return;
  }

  const message = update.message;
  if (!message?.from || message.chat.type !== "private") {
    return;
  }

  const text = message.text?.trim() ?? "";
  const userId = message.from.id;
  const admin = isAdmin(env, userId);
  const chatId = message.chat.id;

  const media = extractMedia(message);
  if (media) {
    const result = await ingestUserMedia(env, userId, media);
    await replyIngestResult(tg, chatId, result);
    return;
  }

  if (isUnsupportedContent(message)) {
    await tg.sendMessage(chatId, COPY.unsupportedMedia);
    return;
  }

  if (text === "/start" || text.startsWith("/start ")) {
    try {
      await ensureBotCommands(tg);
    } catch (err) {
      console.error("setMyCommands failed", err);
    }
    await startOnboarding(env, tg, message.from, chatId);
    return;
  }

  if (text === "/settings" || text === "/menu") {
    await showSettings(env, tg, userId, chatId);
    return;
  }

  if (text === "/schedule") {
    const user = await getUser(env.DB, userId);
    if (!user) {
      await tg.sendMessage(chatId, COPY.needStart);
      return;
    }
    await tg.sendMessage(chatId, await buildScheduleText(env, user));
    return;
  }

  if (text === "/pause") {
    const user = await getUser(env.DB, userId);
    if (!user) {
      await tg.sendMessage(chatId, COPY.needStart);
      return;
    }
    if (isRemindersPaused(user)) {
      await tg.sendMessage(chatId, COPY.alreadyPaused);
      return;
    }
    await setRemindersPaused(env.DB, userId, true);
    await tg.sendMessage(chatId, COPY.paused);
    return;
  }

  if (text === "/resume") {
    const user = await getUser(env.DB, userId);
    if (!user) {
      await tg.sendMessage(chatId, COPY.needStart);
      return;
    }
    if (!isRemindersPaused(user)) {
      await tg.sendMessage(chatId, COPY.alreadyResumed);
      return;
    }
    await setRemindersPaused(env.DB, userId, false);
    await tg.sendMessage(chatId, COPY.resumed);
    return;
  }

  if (text === "/help") {
    await tg.sendMessage(
      chatId,
      COPY.helpUser + (admin ? COPY.helpAdminExtra : ""),
    );
    return;
  }

  if (text === "/ping") {
    await tg.sendMessage(chatId, "pong");
    return;
  }

  if (text === "/status") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    const me = await tg.getMe();
    const pending = await countUnpublished(env.DB);
    const open = await getOpenRound(env.DB);
    const latest = await getLatestRound(env.DB);
    const intervalHours = await getRoundIntervalHours(env);
    const onboarded = (await listOnboardedUsers(env.DB)).length;

    let roundLine = "round: нет";
    if (open) {
      roundLine = `round #${open.id} open until ${open.window_ends_at}` +
        (open.soft_ping_sent_at ? " (soft-ping sent)" : "");
    } else if (latest) {
      const nextStart = new Date(
        Date.parse(latest.started_at) + intervalHours * 60 * 60 * 1000,
      ).toISOString();
      roundLine = `round: last #${latest.id} (${latest.status}); next≈${nextStart}`;
    }

    let webhookLine = "webhook: (не удалось получить)";
    try {
      const info = await tg.getWebhookInfo();
      webhookLine = info.url
        ? `webhook: ${info.url} (pending=${info.pending_update_count})`
        : "webhook: не установлен";
      if (info.last_error_message) {
        webhookLine += `\nlast_error: ${info.last_error_message}`;
      }
    } catch (err) {
      webhookLine = `webhook: error (${err instanceof Error ? err.message : String(err)})`;
    }

    await tg.sendMessage(
      chatId,
      [
        "Админ-статус",
        `bot: @${me.username ?? "unknown"} (id ${me.id})`,
        `channel_id: ${env.CHANNEL_ID || "(не задан)"}`,
        `onboarded users: ${onboarded}`,
        `interval: ${intervalHours}h`,
        roundLine,
        `unpublished media: ${pending}`,
        webhookLine,
      ].join("\n"),
    );
    return;
  }

  if (text === "/channelcheck") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    try {
      const report = await checkChannelAccess(env);
      await tg.sendMessage(
        chatId,
        [`Проверка канала: ${report.ok ? "OK" : "FAIL"}`, "", ...report.details].join("\n"),
      );
    } catch (err) {
      await tg.sendMessage(
        chatId,
        `Ошибка проверки: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  if (text === "/testpost") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    try {
      const channelId = requireChannelId(env);
      const report = await checkChannelAccess(env);
      if (!report.ok) {
        await tg.sendMessage(
          chatId,
          ["Не могу постить в канал:", "", ...report.details].join("\n"),
        );
        return;
      }

      const posted = await publishTestPost(tg, channelId);
      await tg.sendMessage(
        chatId,
        `Тестовый пост отправлен в канал (message_id=${posted.message_id}).`,
      );
    } catch (err) {
      const detail =
        err instanceof TelegramError
          ? err.description ?? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await tg.sendMessage(chatId, `Не удалось отправить тестовый пост: ${detail}`);
    }
    return;
  }

  if (text === "/queue") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }
    const pending = await countUnpublished(env.DB);
    await tg.sendMessage(
      chatId,
      pending === 0
        ? "Очередь пуста."
        : `В очереди на публикацию: ${pending}.\nКоманда /publish отправит всё в канал.`,
    );
    return;
  }

  if (text === "/publish") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    try {
      const pending = await countUnpublished(env.DB);
      if (pending === 0) {
        await tg.sendMessage(chatId, "Нечего публиковать — очередь пуста.");
        return;
      }
      await tg.sendMessage(chatId, `Публикую ${pending} шт. в канал…`);
      const result = await publishUnpublishedQueue(env);
      const lines = [
        `Готово: опубликовано ${result.published}, ошибок ${result.failed}.`,
      ];
      if (result.errors.length) {
        lines.push("", ...result.errors.slice(0, 5));
        if (result.errors.length > 5) lines.push(`…и ещё ${result.errors.length - 5}`);
      }
      await tg.sendMessage(chatId, lines.join("\n"));
    } catch (err) {
      await tg.sendMessage(
        chatId,
        `Публикация не удалась: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  if (text === "/startround") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }
    try {
      const result = await startRound(env);
      await tg.sendMessage(chatId, `Раунд: ${result.action}\n${result.detail}`);
    } catch (err) {
      await tg.sendMessage(
        chatId,
        `Не удалось стартовать раунд: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  if (text === "/interval" || text.startsWith("/interval ")) {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    const arg = text === "/interval" ? "" : text.slice("/interval ".length).trim();
    if (!arg) {
      const current = await getRoundIntervalHours(env);
      await tg.sendMessage(
        chatId,
        [
          `Текущий интервал раундов: ${current} ч.`,
          `Чтобы изменить: /interval N (целое ${INTERVAL_HOURS_MIN}–${INTERVAL_HOURS_MAX}).`,
          "Открытый раунд не прерывается; новый интервал влияет на следующий старт.",
        ].join("\n"),
      );
      return;
    }

    const hours = Number(arg);
    if (!Number.isFinite(hours)) {
      await tg.sendMessage(chatId, "Нужно число часов, например /interval 3");
      return;
    }

    try {
      const set = await setRoundIntervalHours(env, Math.trunc(hours));
      const open = await getOpenRound(env.DB);
      const latest = await getLatestRound(env.DB);
      let nextLine = "Следующий раунд: будет рассчитан от последнего старта.";
      if (open) {
        nextLine = `Сейчас открыт раунд #${open.id}; новый интервал применится после него.`;
      } else if (latest) {
        const nextStart = new Date(
          Date.parse(latest.started_at) + set * 60 * 60 * 1000,
        ).toISOString();
        nextLine = `Следующий раунд примерно: ${nextStart}`;
      }
      await tg.sendMessage(chatId, `Интервал установлен: ${set} ч.\n${nextLine}`);
    } catch (err) {
      await tg.sendMessage(chatId, err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (text === "/missing") {
    if (!admin) {
      await tg.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    const report = await listMissingSubmitters(env);
    if (!report) {
      await tg.sendMessage(chatId, "Сейчас нет открытого раунда.");
      return;
    }
    if (report.missing.length === 0) {
      await tg.sendMessage(
        chatId,
        `Раунд #${report.roundId}: все вне DND уже сдали` +
          (report.skippedDnd ? ` (в DND сейчас: ${report.skippedDnd})` : "") +
          ".",
      );
      return;
    }

    const names = report.missing.map((u) => `• ${u.display_name}`).join("\n");
    await tg.sendMessage(
      chatId,
      [
        `Раунд #${report.roundId}: ещё не сдали (${report.missing.length}):`,
        names,
        report.skippedDnd ? `\n(сейчас в DND, не считаем: ${report.skippedDnd})` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  if (text && (await handlePendingText(env, tg, userId, chatId, text))) {
    return;
  }

  if (text.startsWith("/")) {
    await tg.sendMessage(chatId, `Неизвестная команда. Доступны: ${adminCommandsHint(admin)}`);
    return;
  }

  if (text) {
    await tg.sendMessage(chatId, COPY.mediaOnly);
  }
}
