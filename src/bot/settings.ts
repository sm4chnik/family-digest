import type { Env } from "../env";
import {
  getUser,
  isOnboarded,
  isRemindersPaused,
  markOnboarded,
  setDnd,
  setPendingAction,
  setTimezone,
  upsertUserShell,
} from "../db/users";
import type { UserRow } from "../db/types";
import { TelegramClient } from "../telegram/api";
import type { TelegramUser } from "../telegram/types";
import { displayNameFromUser } from "../telegram/types";
import { assertValidDndWindow, formatDndSummary, isInDnd } from "../time/dnd";
import { formatMinuteOfDay, isValidIanaTimeZone, parseHhMm } from "../time/timezone";
import {
  dndHourKeyboard,
  dndOfferKeyboard,
  settingsKeyboard,
  timezoneAllKeyboard,
  timezoneKeyboard,
  timezoneRegionKeyboard,
  timezoneRegionsKeyboard,
} from "./keyboards";

function settingsText(user: UserRow): string {
  const dndNow =
    user.timezone && user.dnd_enabled
      ? isInDnd(user)
        ? "сейчас тихий режим"
        : "сейчас можно писать"
      : null;

  const remindersLine = isRemindersPaused(user)
    ? "Напоминания: на паузе (/resume)"
    : "Напоминания: включены (/pause)";

  return [
    "⚙️ Настройки",
    "",
    `Часовой пояс: ${user.timezone ?? "не выбран"}`,
    `Не беспокоить: ${formatDndSummary(user)}`,
    dndNow ? `(${dndNow})` : null,
    remindersLine,
    "",
    user.onboarded_at
      ? "Онбординг пройден — напоминания по расписанию (если не на паузе)."
      : "Завершите настройку, чтобы получать напоминания.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function reply(
  tg: TelegramClient,
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  await tg.sendMessage(chatId, text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
}

async function editOrReply(
  tg: TelegramClient,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  const extra = replyMarkup ? { reply_markup: replyMarkup } : { reply_markup: { inline_keyboard: [] } };
  if (messageId != null) {
    try {
      await tg.editMessageText(chatId, messageId, text, extra);
      return;
    } catch {
      // Message not modified or too old — fall through
    }
  }
  await reply(tg, chatId, text, replyMarkup);
}

export async function startOnboarding(
  env: Env,
  tg: TelegramClient,
  from: TelegramUser,
  chatId: number,
): Promise<void> {
  const name = displayNameFromUser(from);
  const user = await upsertUserShell(env.DB, from.id, name);

  if (isOnboarded(user)) {
    await setPendingAction(env.DB, from.id, null);
    await reply(tg, chatId, `Снова привет, ${name}!\n\n${settingsText(user)}`, settingsKeyboard());
    return;
  }

  if (user.timezone && !user.onboarded_at) {
    await reply(
      tg,
      chatId,
      [
        `Продолжим, ${name}.`,
        `Часовой пояс уже выбран: ${user.timezone}.`,
        "",
        "Можно настроить «не беспокоить» (не больше 12 часов) или пропустить.",
      ].join("\n"),
      dndOfferKeyboard(true),
    );
    return;
  }

  await reply(
    tg,
    chatId,
    [
      `Привет, ${name}!`,
      "",
      "Я Family Digest Bot: буду напоминать скинуть фото, видео или кружок в личку, а потом опубликую их в семейный канал.",
      "",
      "Сначала выберите часовой пояс — по нему считается режим «не беспокоить».",
      "Буэнос-Айрес есть в списке; также доступны все зоны мира и ввод вручную.",
    ].join("\n"),
    timezoneKeyboard(0),
  );
}

export async function showSettings(
  env: Env,
  tg: TelegramClient,
  userId: number,
  chatId: number,
  messageId?: number,
): Promise<void> {
  const user = await getUser(env.DB, userId);
  if (!user) {
    await reply(tg, chatId, "Сначала нажмите /start");
    return;
  }
  await setPendingAction(env.DB, userId, null);
  await editOrReply(tg, chatId, messageId, settingsText(user), settingsKeyboard());
}

export async function handleSettingsCallback(
  env: Env,
  tg: TelegramClient,
  userId: number,
  chatId: number,
  messageId: number | undefined,
  data: string,
): Promise<string | undefined> {
  const user = await getUser(env.DB, userId);
  if (!user) return "Сначала /start";

  if (data === "set:menu") {
    await showSettings(env, tg, userId, chatId, messageId);
    return;
  }

  if (data === "set:tz" || data === "tzmenu") {
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Выберите часовой пояс (популярные). Или откройте полный список / регионы:",
      timezoneKeyboard(0),
    );
    return;
  }

  if (data === "set:dnd") {
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Режим «не беспокоить» (не больше 12 часов в сутки):",
      dndOfferKeyboard(false),
    );
    return;
  }

  if (data === "tz:noop") {
    return;
  }

  if (data.startsWith("tzpage:")) {
    const page = Number(data.slice("tzpage:".length));
    if (!Number.isFinite(page) || page < 0) return "Некорректная страница";
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Выберите часовой пояс (популярные):",
      timezoneKeyboard(page),
    );
    return;
  }

  if (data.startsWith("tza:")) {
    const page = Number(data.slice(4));
    if (!Number.isFinite(page) || page < 0) return "Некорректная страница";
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Все часовые пояса (A–Z):",
      timezoneAllKeyboard(page),
    );
    return;
  }

  if (data === "tzreg") {
    await editOrReply(tg, chatId, messageId, "Выберите регион:", timezoneRegionsKeyboard());
    return;
  }

  if (data.startsWith("tzr:")) {
    // tzr:America:0 or tzr:Etc:2
    const rest = data.slice(4);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) return "Некорректный регион";
    const region = rest.slice(0, lastColon);
    const page = Number(rest.slice(lastColon + 1));
    if (!region || !Number.isFinite(page) || page < 0) return "Некорректный регион";
    await editOrReply(
      tg,
      chatId,
      messageId,
      `Зоны региона ${region}:`,
      timezoneRegionKeyboard(region, page),
    );
    return;
  }

  if (data === "tz:custom") {
    await setPendingAction(env.DB, userId, "await_tz_custom");
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Пришлите IANA-зону текстом, например America/Buenos_Aires или Europe/Moscow.",
      undefined,
    );
    return "Жду название зоны";
  }

  if (data.startsWith("tz:")) {
    const tz = data.slice(3);
    if (tz === "custom" || tz === "noop") return;
    if (!isValidIanaTimeZone(tz)) return "Неизвестная зона";
    await setTimezone(env.DB, userId, tz);

    if (isOnboarded(user)) {
      await showSettings(env, tg, userId, chatId, messageId);
      return `Пояс: ${tz}`;
    }

    await editOrReply(
      tg,
      chatId,
      messageId,
      [
        `Часовой пояс: ${tz}`,
        "",
        "Настроить «не беспокоить»? Можно пропустить — напоминания будут приходить всегда (кроме пауз по желанию позже).",
      ].join("\n"),
      dndOfferKeyboard(true),
    );
    return `Пояс: ${tz}`;
  }

  if (data === "dnd:skip") {
    await setDnd(env.DB, userId, false, null, null);
    await markOnboarded(env.DB, userId);
    const fresh = await getUser(env.DB, userId);
    await editOrReply(
      tg,
      chatId,
      messageId,
      ["Готово! Онбординг завершён.", "", fresh ? settingsText(fresh) : ""].join("\n"),
      settingsKeyboard(),
    );
    return "DND пропущен";
  }

  if (data === "dnd:off") {
    await setDnd(env.DB, userId, false, null, null);
    if (!user.onboarded_at && user.timezone) await markOnboarded(env.DB, userId);
    await showSettings(env, tg, userId, chatId, messageId);
    return "DND выключен";
  }

  if (data === "dnd:cancel") {
    await setPendingAction(env.DB, userId, null);
    if (isOnboarded(user)) {
      await showSettings(env, tg, userId, chatId, messageId);
    } else {
      await editOrReply(
        tg,
        chatId,
        messageId,
        "Настроить «не беспокоить» или пропустить:",
        dndOfferKeyboard(true),
      );
    }
    return "Отменено";
  }

  if (data === "dnd:custom") {
    await setPendingAction(env.DB, userId, null);
    await editOrReply(
      tg,
      chatId,
      messageId,
      "Выберите начало тихого интервала (локальное время):",
      dndHourKeyboard("start"),
    );
    return;
  }

  if (data.startsWith("dnd:set:")) {
    const parts = data.split(":");
    const start = Number(parts[2]);
    const end = Number(parts[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "Некорректный интервал";
    try {
      assertValidDndWindow(start, end);
    } catch (err) {
      return err instanceof Error ? err.message : "Ошибка DND";
    }
    await setDnd(env.DB, userId, true, start, end);
    await markOnboarded(env.DB, userId);
    await showSettings(env, tg, userId, chatId, messageId);
    return `DND ${formatMinuteOfDay(start)}–${formatMinuteOfDay(end)}`;
  }

  if (data.startsWith("dnd:start:")) {
    const hour = Number(data.slice("dnd:start:".length));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Некорректный час";
    const startMinute = hour * 60;
    await setPendingAction(env.DB, userId, `dnd_pick_end:${startMinute}`);
    await editOrReply(
      tg,
      chatId,
      messageId,
      `Начало: ${formatMinuteOfDay(startMinute)}. Теперь выберите конец интервала:`,
      dndHourKeyboard("end"),
    );
    return;
  }

  if (data.startsWith("dnd:end:")) {
    const hour = Number(data.slice("dnd:end:".length));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Некорректный час";
    const pending = user.pending_action ?? "";
    if (!pending.startsWith("dnd_pick_end:")) {
      return "Сначала выберите начало интервала";
    }
    const start = Number(pending.slice("dnd_pick_end:".length));
    const end = hour * 60;
    try {
      assertValidDndWindow(start, end);
    } catch (err) {
      await editOrReply(
        tg,
        chatId,
        messageId,
        `${err instanceof Error ? err.message : "Ошибка"}\nВыберите конец ещё раз:`,
        dndHourKeyboard("end"),
      );
      return err instanceof Error ? err.message : "Ошибка DND";
    }
    await setDnd(env.DB, userId, true, start, end);
    await markOnboarded(env.DB, userId);
    await showSettings(env, tg, userId, chatId, messageId);
    return `DND ${formatMinuteOfDay(start)}–${formatMinuteOfDay(end)}`;
  }

  return "Неизвестная кнопка";
}

export async function handlePendingText(
  env: Env,
  tg: TelegramClient,
  userId: number,
  chatId: number,
  text: string,
): Promise<boolean> {
  const user = await getUser(env.DB, userId);
  if (!user?.pending_action) return false;

  if (user.pending_action === "await_tz_custom") {
    const tz = text.trim();
    if (!isValidIanaTimeZone(tz)) {
      await reply(
        tg,
        chatId,
        "Не получилось распознать зону. Пример: Europe/Moscow\nИли выберите из списка: /start",
      );
      return true;
    }
    await setTimezone(env.DB, userId, tz);
    if (isOnboarded(user)) {
      await showSettings(env, tg, userId, chatId);
    } else {
      await reply(
        tg,
        chatId,
        `Часовой пояс: ${tz}\n\nНастроить «не беспокоить» или пропустить:`,
        dndOfferKeyboard(true),
      );
    }
    return true;
  }

  // Optional free-text DND as "23:00-08:00" if somehow pending
  if (user.pending_action === "await_dnd_text") {
    const match = text.trim().match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
    if (!match) {
      await reply(tg, chatId, "Формат: 23:00-08:00");
      return true;
    }
    const start = parseHhMm(match[1]!);
    const end = parseHhMm(match[2]!);
    if (start == null || end == null) {
      await reply(tg, chatId, "Некорректное время. Пример: 23:00-08:00");
      return true;
    }
    try {
      assertValidDndWindow(start, end);
    } catch (err) {
      await reply(tg, chatId, err instanceof Error ? err.message : "Ошибка DND");
      return true;
    }
    await setDnd(env.DB, userId, true, start, end);
    await markOnboarded(env.DB, userId);
    await showSettings(env, tg, userId, chatId);
    return true;
  }

  return false;
}
