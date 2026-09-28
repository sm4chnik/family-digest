/** BotFather-style menu near the input field. */

export const USER_BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "start", description: "Онбординг и главное меню" },
  { command: "help", description: "Как пользоваться ботом" },
  { command: "settings", description: "Часовой пояс и «не беспокоить»" },
  { command: "schedule", description: "Расписание и статус раунда" },
  { command: "pause", description: "Отключить напоминания" },
  { command: "resume", description: "Снова получать напоминания" },
];

export async function ensureBotCommands(tg: {
  setMyCommands: (
    commands: Array<{ command: string; description: string }>,
  ) => Promise<unknown>;
}): Promise<void> {
  await tg.setMyCommands(USER_BOT_COMMANDS);
}
