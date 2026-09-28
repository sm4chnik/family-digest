import type { Env } from "./env";
import { handleUpdate } from "./bot/handlers";
import { runSchedulerTick } from "./rounds/scheduler";
import type { TelegramUpdate } from "./telegram/types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, service: "family-digest-bot", ts: new Date().toISOString() });
    }

    if (request.method === "POST" && url.pathname === `/telegram/${env.WEBHOOK_SECRET}`) {
      if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
        return text("misconfigured", 500);
      }

      // Optional header set when registering webhook with secret_token
      const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
      if (headerSecret && !timingSafeEqual(headerSecret, env.WEBHOOK_SECRET)) {
        return text("unauthorized", 401);
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return text("bad json", 400);
      }

      try {
        await handleUpdate(env, update);
      } catch (err) {
        console.error("handleUpdate failed", err);
        // 200 so Telegram does not retry aggressively during development
      }
      return json({ ok: true });
    }

    return text("not found", 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const result = await runSchedulerTick(env);
      console.log("scheduler", result);
    } catch (err) {
      console.error("scheduler failed", err);
    }
  },
} satisfies ExportedHandler<Env>;
