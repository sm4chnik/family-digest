/**
 * Cloudflare Worker bindings and secrets.
 * Secrets: BOT_TOKEN, WEBHOOK_SECRET, ADMIN_IDS, CHANNEL_ID
 * (via `wrangler secret put` / .dev.vars — never commit real values)
 */
export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  /** Comma-separated Telegram user ids */
  ADMIN_IDS: string;
  /** Optional; can also live in D1 later */
  CHANNEL_ID: string;
}

export function parseAdminIds(env: Env): Set<number> {
  return new Set(
    (env.ADMIN_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)),
  );
}

export function isAdmin(env: Env, telegramUserId: number): boolean {
  return parseAdminIds(env).has(telegramUserId);
}
