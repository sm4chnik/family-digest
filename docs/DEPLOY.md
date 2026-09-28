# Деплой

Целевая платформа v1: **Cloudflare Workers + D1 + Cron Triggers**.

## Что понадобится заранее

1. Аккаунт [Cloudflare](https://dash.cloudflare.com/) (бесплатного плана достаточно для семьи).
2. Telegram-бот через [@BotFather](https://t.me/BotFather) → токен.
3. Telegram-канал:
   - создать канал;
   - добавить бота **администратором** с правом публиковать сообщения;
   - узнать `channel_id` (например, переслать пост канала боту [@userinfobot](https://t.me/userinfobot) / через API `getChat`).
4. Числовой Telegram ID админа(ов) для `ADMIN_IDS`.
5. Node.js 20+ и `wrangler` (ставим на этапе каркаса).

## Ресурсы Cloudflare

| Ресурс | Назначение |
| --- | --- |
| Worker | HTTP webhook + логика бота |
| D1 | Пользователи, раунды, submissions, settings |
| Cron Trigger | Тик планировщика (рекомендуется `* * * * *`) |
| Secrets | `BOT_TOKEN`, `WEBHOOK_SECRET`, `ADMIN_IDS`, `CHANNEL_ID` |

## Секреты и переменные

Задать через `wrangler secret put` (не коммитить):

| Имя | Описание |
| --- | --- |
| `BOT_TOKEN` | Токен BotFather |
| `WEBHOOK_SECRET` | Случайная строка в URL webhook, чтобы посторонние не дергали Worker |
| `ADMIN_IDS` | Список Telegram user id через запятую |
| `CHANNEL_ID` | ID канала (`-100…`). Не класть в `wrangler.toml` — это идентификатор вашей ленты |

## Шаги деплоя (после появления кода)

```bash
# Логин
npx wrangler login

# Создать D1 и прописать database_id в wrangler.toml
npx wrangler d1 create family-digest-bot

# Применить миграции (prod)
npx wrangler d1 migrations apply family-digest-bot --remote

# Secrets
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ADMIN_IDS
npx wrangler secret put CHANNEL_ID

# Деплой Worker
npx wrangler deploy
```

### Webhook Telegram

После деплоя выставить webhook (один раз). Токен в URL вручную не подставляйте — скрипт читает его из `.dev.vars`:

```bash
npm run tg:set-webhook -- https://<worker-host>
```

Путь: `POST /telegram/<WEBHOOK_SECRET>`. Проверка: `npm run tg:webhook-info`.

### Cron

В `wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *"]
```

Каждый тик — идемпотентная проверка состояния раундов (см. [ARCHITECTURE.md](./ARCHITECTURE.md)).

## Локальная разработка

1. `npx wrangler d1 migrations apply family-digest-bot --local`
2. `npx wrangler dev`
3. Туннель на localhost (cloudflared / vs code port forward) → `setWebhook` на туннель URL
4. Либо временно long polling только для отладки (если добавим в каркас; на prod — только webhook)

## Чеклист после выката

- [ ] `getWebhookInfo` — URL верный, ошибок нет
- [ ] Админ получает ответ на `/start`
- [ ] Тестовый пост в канал проходит
- [ ] Создан хотя бы один раунд (или ручной trigger)
- [ ] Soft-ping не дублируется при повторном cron
- [ ] Пустой раунд не спамит канал
- [ ] DND: пользователь в «тихих» часах не получает напоминание
- [ ] Опоздавшее медиа уходит в следующий дайджест

## Инструкция для семьи (черновик текста)

1. Открыть бота по ссылке `https://t.me/<bot_username>`.
2. Нажать **Start**.
3. Выбрать часовой пояс; при желании — «не беспокоить».
4. Подписаться на канал-ленту.
5. Когда придёт напоминание — в течение 30 минут прислать боту **в личку** фото, видео или кружок.
6. Через полчаса смотреть общий канал.

## Лимиты бесплатного тарифа (ориентир)

Для семьи из небольшого числа людей квоты Workers/D1/Cron обычно не проблема. Следить за:

- числом исходящих сообщений Telegram (rate limit API);
- размером/числом cron-итераций при очень частых тиках (минута — ок).

Если Cloudflare перестанет устраивать — запасной путь: Fly.io / Railway с тем же TypeScript-кодом, но потребуется адаптация entrypoint и БД (Postgres/SQLite). Имеет смысл только при реальной необходимости.

## Откат

- `wrangler deployments` / rollback предыдущей версии Worker
- Миграции D1 проектировать аддитивными; деструктивные — только с бэкапом (`wrangler d1 export`)
