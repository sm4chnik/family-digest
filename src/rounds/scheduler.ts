import type { Env } from "../env";
import {
  assignLateQueueToRound,
  userHasSubmissionForRound,
} from "../db/submissions";
import {
  claimRoundForClosing,
  createRound,
  getClosingRound,
  getLatestRound,
  getOpenRound,
  markRoundPublished,
  markRoundSoftPingSent,
  recordNotification,
  releaseNotification,
} from "../db/rounds";
import {
  getRoundIntervalHours,
  getSoftPingAfterMinutes,
  getSubmissionWindowMinutes,
} from "../db/settings";
import { listOnboardedUsers, isRemindersPaused } from "../db/users";
import { isInDnd } from "../time/dnd";
import { TelegramClient } from "../telegram/api";
import { publishRoundQueue } from "../bot/publishQueue";
import { COPY } from "../bot/copy";
import { notifyAdmins } from "../bot/notify";

export interface SchedulerResult {
  action: "noop" | "started_round" | "reminders_backfill" | "soft_ping" | "closed_round";
  detail: string;
}

function roundWindowMinutes(startedAt: string, windowEndsAt: string): number {
  return Math.max(1, Math.round((Date.parse(windowEndsAt) - Date.parse(startedAt)) / 60_000));
}

async function sendReminders(
  env: Env,
  roundId: number,
  now: Date,
  windowMinutes: number,
): Promise<number> {
  const tg = new TelegramClient(env.BOT_TOKEN);
  const users = await listOnboardedUsers(env.DB);
  let sent = 0;
  const text = COPY.reminder(windowMinutes);

  for (const user of users) {
    if (isRemindersPaused(user)) continue;
    if (isInDnd(user, now)) continue;
    const claimed = await recordNotification(env.DB, roundId, user.telegram_id, "reminder");
    if (!claimed) continue;
    try {
      await tg.sendMessage(user.telegram_id, text);
      sent += 1;
    } catch (err) {
      console.error("reminder failed", user.telegram_id, err);
      await releaseNotification(env.DB, roundId, user.telegram_id, "reminder");
    }
  }

  return sent;
}

async function sendSoftPings(
  env: Env,
  roundId: number,
  now: Date,
  minutesLeft: number,
): Promise<number> {
  const tg = new TelegramClient(env.BOT_TOKEN);
  const users = await listOnboardedUsers(env.DB);
  let sent = 0;
  const text = COPY.softPing(Math.max(1, minutesLeft));

  for (const user of users) {
    if (isRemindersPaused(user)) continue;
    if (isInDnd(user, now)) continue;
    if (await userHasSubmissionForRound(env.DB, user.telegram_id, roundId)) continue;
    const claimed = await recordNotification(env.DB, roundId, user.telegram_id, "soft_ping");
    if (!claimed) continue;
    try {
      await tg.sendMessage(user.telegram_id, text);
      sent += 1;
    } catch (err) {
      console.error("soft_ping failed", user.telegram_id, err);
      await releaseNotification(env.DB, roundId, user.telegram_id, "soft_ping");
    }
  }

  return sent;
}

export async function startRound(env: Env, now = new Date()): Promise<SchedulerResult> {
  const open = await getOpenRound(env.DB);
  if (open) {
    return { action: "noop", detail: `round ${open.id} already open` };
  }

  const windowMinutes = await getSubmissionWindowMinutes(env);
  const softPingAfter = await getSoftPingAfterMinutes(env);
  const round = await createRound(env.DB, now, windowMinutes, softPingAfter);
  const assignedLate = await assignLateQueueToRound(env.DB, round.id);
  let reminded = 0;
  try {
    reminded = await sendReminders(env, round.id, now, windowMinutes);
  } catch (err) {
    console.error("sendReminders failed", round.id, err);
  }

  return {
    action: "started_round",
    detail: `round ${round.id} started; reminders=${reminded}; late_assigned=${assignedLate}; window_ends=${round.window_ends_at}`,
  };
}

async function maybeStartRound(env: Env, now: Date): Promise<SchedulerResult> {
  const intervalHours = await getRoundIntervalHours(env);
  const last = await getLatestRound(env.DB);

  if (!last) {
    return startRound(env, now);
  }

  const nextStart = Date.parse(last.started_at) + intervalHours * 60 * 60 * 1000;
  if (now.getTime() >= nextStart) {
    return startRound(env, now);
  }

  return {
    action: "noop",
    detail: `next round after ${new Date(nextStart).toISOString()}`,
  };
}

async function closeAndPublish(env: Env, roundId: number): Promise<SchedulerResult> {
  const claimed = await claimRoundForClosing(env.DB, roundId);
  if (!claimed) {
    const closing = await getClosingRound(env.DB);
    if (!closing || closing.id !== roundId) {
      return { action: "noop", detail: `round ${roundId} already closing/published` };
    }
  }

  try {
    const publish = await publishRoundQueue(env, roundId);
    await markRoundPublished(env.DB, roundId);

    if (publish.published === 0 && publish.failed === 0) {
      // Quiet skip — empty digest, no channel spam
      return {
        action: "closed_round",
        detail: `round ${roundId} empty; skipped channel posts`,
      };
    }

    if (publish.failed > 0) {
      await notifyAdmins(
        env,
        [
          `Раунд #${roundId}: публикация частично с ошибками.`,
          `ok=${publish.published}, fail=${publish.failed}`,
          ...publish.errors.slice(0, 5),
        ].join("\n"),
      );
    }

    return {
      action: "closed_round",
      detail: `round ${roundId} published=${publish.published} failed=${publish.failed}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("closeAndPublish failed", roundId, err);
    await notifyAdmins(
      env,
      [
        `Раунд #${roundId}: не удалось опубликовать дайджест.`,
        msg,
        "",
        "Проверьте, что бот всё ещё админ канала с правом постить (/channelcheck).",
        "Можно опубликовать очередь вручную: /publish",
      ].join("\n"),
    );
    return {
      action: "noop",
      detail: `round ${roundId} closing; publish error: ${msg}`,
    };
  }
}

/**
 * Cron tick: start rounds, soft-ping, close+publish.
 */
export async function runSchedulerTick(env: Env, now = new Date()): Promise<SchedulerResult> {
  const closing = await getClosingRound(env.DB);
  if (closing) {
    return closeAndPublish(env, closing.id);
  }

  const open = await getOpenRound(env.DB);

  if (open) {
    const nowMs = now.getTime();

    if (nowMs >= Date.parse(open.window_ends_at)) {
      return closeAndPublish(env, open.id);
    }

    if (!open.soft_ping_sent_at && nowMs >= Date.parse(open.soft_ping_at)) {
      const marked = await markRoundSoftPingSent(env.DB, open.id);
      if (!marked) {
        return { action: "noop", detail: `round ${open.id} soft-ping already marked` };
      }
      const windowMinutes = await getSubmissionWindowMinutes(env);
      const softAfter = await getSoftPingAfterMinutes(env);
      const minutesLeft = Math.max(1, windowMinutes - softAfter);
      const sent = await sendSoftPings(env, open.id, now, minutesLeft);
      return {
        action: "soft_ping",
        detail: `round ${open.id} soft_pings=${sent}`,
      };
    }

    // Start reminders are sent in the same tick as createRound. If that tick
    // dies after INSERT (CPU limit, Telegram error, Worker kill), later ticks
    // used to noop until the 10-min ping — so users only saw the soft ping.
    // recordNotification is idempotent; this backfills anyone still missing.
    const windowMinutes = roundWindowMinutes(open.started_at, open.window_ends_at);
    const sent = await sendReminders(env, open.id, now, windowMinutes);
    if (sent > 0) {
      return {
        action: "reminders_backfill",
        detail: `round ${open.id} reminder_backfill=${sent}`,
      };
    }

    return {
      action: "noop",
      detail: `round ${open.id} open until ${open.window_ends_at}`,
    };
  }

  return maybeStartRound(env, now);
}
