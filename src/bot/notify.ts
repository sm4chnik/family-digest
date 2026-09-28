import type { Env } from "../env";
import { parseAdminIds } from "../env";
import { TelegramClient } from "../telegram/api";

/** Best-effort notify configured admins (failures are logged, not thrown). */
export async function notifyAdmins(env: Env, text: string): Promise<void> {
  const ids = [...parseAdminIds(env)];
  if (!ids.length || !env.BOT_TOKEN) return;

  const tg = new TelegramClient(env.BOT_TOKEN);
  for (const id of ids) {
    try {
      await tg.sendMessage(id, text);
    } catch (err) {
      console.error("notifyAdmins failed", id, err);
    }
  }
}
