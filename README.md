# Family Digest Bot

Семейный Telegram-бот: напоминает участникам прислать фото, видео или кружок в личку, собирает медиа в окне сдачи и публикует дайджест в общий канал.

1. Участники один раз делают `/start` и выбирают часовой пояс (и при желании «не беспокоить»).
2. По расписанию бот пишет напоминание в личку.
3. В течение **30 минут** участники присылают медиа боту.
4. После окна бот публикует в канал отдельные посты с подписью, кто прислал.
5. Опоздавшие попадают в следующий дайджест.

Стек: TypeScript, Cloudflare Workers (webhook + cron), Cloudflare D1, Telegram Bot API.

Инструкция для родственников — [docs/FAMILY.md](docs/FAMILY.md). Устройство и деплой подробнее — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOY.md](docs/DEPLOY.md).

## Что понадобится

- Node.js 20+
- Аккаунт [Cloudflare](https://dash.cloudflare.com/) (для семьи хватает бесплатного плана)
- Telegram-бот: [@BotFather](https://t.me/BotFather) → `/newbot` → токен
- Числовой Telegram ID админов (узнать у [@userinfobot](https://t.me/userinfobot))
- Канал, куда бот будет постить:
  - создать канал;
  - добавить бота **администратором** с правом публиковать сообщения;
  - id канала имеет вид `-100…`. Его показывает [@userinfobot](https://t.me/userinfobot), если переслать ему любое сообщение из канала

Секреты живут только у вас. В репозитории их нет: локально — файл `.dev.vars` (он в `.gitignore`), на проде — `wrangler secret put`. Не коммитьте `.dev.vars`, токен и id канала.

## Локальный запуск

```bash
npm install
cp .dev.vars.example .dev.vars
```

Откройте `.dev.vars` и подставьте свои значения:

| Переменная | Откуда |
| --- | --- |
| `BOT_TOKEN` | Токен от BotFather |
| `WEBHOOK_SECRET` | Любая длинная случайная строка, например `openssl rand -hex 32` |
| `ADMIN_IDS` | Telegram user id админов через запятую, без пробелов: `111,222` |
| `CHANNEL_ID` | Id канала, вида `-100…` |

Дальше:

```bash
npm run db:migrate:local
npm run dev
```

Проверка: откройте `http://127.0.0.1:8787/health` — ответ `{ "ok": true, ... }`.

Webhook принимает `POST /telegram/<WEBHOOK_SECRET>`. Пока нет публичного URL, Telegram до бота не достучится. Для локальной отладки поднимите туннель:

```bash
npm run dev
# другой терминал
cloudflared tunnel --url http://127.0.0.1:8787
npm run tg:set-webhook -- https://<имя>.trycloudflare.com
```

`cloudflared` ставится отдельно: [документация Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

Полезные команды (читают `.dev.vars`, токен в аргументы передавать не нужно):

```bash
npm run tg:me              # бот отвечает getMe
npm run tg:channel-check   # бот админ канала и может постить
npm run tg:test-post       # тестовое сообщение в канал
npm run tg:webhook-info
npm run tg:set-commands    # меню команд в Telegram
npm run tg:delete-webhook  # снять webhook
```

В личке боту админ может вызвать `/channelcheck`, `/testpost`, `/status`.

## Деплой

```bash
npx wrangler login
npx wrangler d1 create family-digest-bot
```

Вставьте выданный `database_id` в `wrangler.toml` (поле `database_id`). Сейчас там нулевой UUID-заглушка.

```bash
npm run db:migrate:remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ADMIN_IDS
npx wrangler secret put CHANNEL_ID
npm run deploy
```

В конце `wrangler deploy` напечатает URL воркера. Привяжите webhook:

```bash
npm run tg:set-webhook -- https://<ваш-worker-host>
```

Cron уже задан в `wrangler.toml` (`* * * * *`): раз в минуту планировщик проверяет, пора ли открыть раунд, послать напоминание или опубликовать дайджест.

Чеклист после выката — в [docs/DEPLOY.md](docs/DEPLOY.md).

## Команды бота

Участникам: `/start`, `/help`, `/settings`, `/schedule`, `/pause`, `/resume`.

Админам из `ADMIN_IDS`: `/status`, `/channelcheck`, `/testpost`, `/queue`, `/publish`, `/startround`, `/interval`, `/missing`.
