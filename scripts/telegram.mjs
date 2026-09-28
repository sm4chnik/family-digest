#!/usr/bin/env node
/**
 * Small CLI helpers for Telegram Bot API using local .dev.vars
 *
 * Usage:
 *   node scripts/telegram.mjs me
 *   node scripts/telegram.mjs webhook-info
 *   node scripts/telegram.mjs set-webhook https://xxxx.trycloudflare.com
 *   node scripts/telegram.mjs delete-webhook
 *   node scripts/telegram.mjs channel-check
 *   node scripts/telegram.mjs test-post
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDevVars(path = resolve(process.cwd(), ".dev.vars")) {
  const raw = readFileSync(path, "utf8");
  /** @type {Record<string, string>} */
  const vars = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

/**
 * @param {string} token
 * @param {string} method
 * @param {Record<string, unknown>} [body]
 */
async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`${method}: ${data.description ?? res.statusText}`);
  }
  return data.result;
}

function usage() {
  console.log(`Usage:
  node scripts/telegram.mjs me
  node scripts/telegram.mjs webhook-info
  node scripts/telegram.mjs set-webhook <public-base-url>
  node scripts/telegram.mjs delete-webhook
  node scripts/telegram.mjs set-commands
  node scripts/telegram.mjs channel-check
  node scripts/telegram.mjs test-post`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd) {
    usage();
    process.exit(1);
  }

  const env = loadDevVars();
  const token = env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing in .dev.vars");

  if (cmd === "me") {
    console.log(await api(token, "getMe"));
    return;
  }

  if (cmd === "webhook-info") {
    console.log(await api(token, "getWebhookInfo"));
    return;
  }

  if (cmd === "delete-webhook") {
    console.log(await api(token, "deleteWebhook", { drop_pending_updates: false }));
    return;
  }

  if (cmd === "set-commands") {
    const commands = [
      { command: "start", description: "Онбординг и главное меню" },
      { command: "help", description: "Как пользоваться ботом" },
      { command: "settings", description: "Часовой пояс и «не беспокоить»" },
      { command: "schedule", description: "Расписание и статус раунда" },
      { command: "pause", description: "Отключить напоминания" },
      { command: "resume", description: "Снова получать напоминания" },
    ];
    console.log(await api(token, "setMyCommands", { commands }));
    console.log("Bot menu commands updated");
    return;
  }

  if (cmd === "set-webhook") {
    if (!arg) throw new Error("Pass public base URL, e.g. https://xxxx.trycloudflare.com");
    const secret = env.WEBHOOK_SECRET;
    if (!secret) throw new Error("WEBHOOK_SECRET missing in .dev.vars");
    const base = arg.replace(/\/$/, "");
    const url = `${base}/telegram/${secret}`;
    console.log(
      await api(token, "setWebhook", {
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      }),
    );
    console.log(`Webhook set to ${url}`);
    return;
  }

  if (cmd === "channel-check") {
    const channelId = env.CHANNEL_ID;
    if (!channelId) throw new Error("CHANNEL_ID missing in .dev.vars");
    const me = await api(token, "getMe");
    const chat = await api(token, "getChat", { chat_id: channelId });
    const member = await api(token, "getChatMember", {
      chat_id: channelId,
      user_id: me.id,
    });
    console.log({
      bot: `@${me.username}`,
      chat: { id: chat.id, title: chat.title, type: chat.type },
      member: {
        status: member.status,
        can_post_messages: member.can_post_messages,
      },
    });
    return;
  }

  if (cmd === "test-post") {
    const channelId = env.CHANNEL_ID;
    if (!channelId) throw new Error("CHANNEL_ID missing in .dev.vars");
    const result = await api(token, "sendMessage", {
      chat_id: channelId,
      text: `✅ Family Digest Bot — тестовый пост\n${new Date().toISOString()}`,
    });
    console.log({ message_id: result.message_id, chat: result.chat?.id });
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
