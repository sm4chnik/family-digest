import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { getLatestRound, getOpenRound } from "../db/rounds";
import { getRoundIntervalHours } from "../db/settings";
import { isRemindersPaused } from "../db/users";
import { formatDndSummary, isInDnd } from "../time/dnd";

export async function buildScheduleText(
  env: Env,
  user: UserRow,
  now = new Date(),
): Promise<string> {
  const intervalHours = await getRoundIntervalHours(env);
  const open = await getOpenRound(env.DB);
  const latest = await getLatestRound(env.DB);

  const lines: string[] = ["📅 Расписание", ""];

  if (open) {
    const endsMs = Date.parse(open.window_ends_at);
    const leftMin = Math.max(0, Math.ceil((endsMs - now.getTime()) / 60_000));
    lines.push(`Сейчас открыт раунд #${open.id}.`);
    lines.push(`Окно сдачи до ${open.window_ends_at} (≈${leftMin} мин.).`);
    if (open.soft_ping_sent_at) lines.push("Мягкий пинг уже отправлялся.");
  } else if (latest) {
    const nextStart = new Date(
      Date.parse(latest.started_at) + intervalHours * 60 * 60 * 1000,
    );
    lines.push(`Сейчас окна нет (последний раунд #${latest.id}, ${latest.status}).`);
    lines.push(`Следующий раунд примерно: ${nextStart.toISOString()}`);
  } else {
    lines.push("Раундов ещё не было — первый начнётся по cron или команде админа.");
  }

  lines.push(`Интервал между раундами: ${intervalHours} ч.`);
  lines.push("");
  lines.push(`Ваш часовой пояс: ${user.timezone ?? "не выбран"}`);
  lines.push(`Не беспокоить: ${formatDndSummary(user)}`);
  if (user.timezone && user.dnd_enabled) {
    lines.push(isInDnd(user, now) ? "(сейчас тихий режим)" : "(сейчас можно писать)");
  }
  lines.push(
    isRemindersPaused(user)
      ? "Напоминания: на паузе (/resume чтобы включить)"
      : "Напоминания: включены (/pause чтобы отключить)",
  );
  lines.push("");
  lines.push("Медиа можно присылать в любое время — вне окна уйдёт в следующий дайджест.");

  return lines.join("\n");
}
