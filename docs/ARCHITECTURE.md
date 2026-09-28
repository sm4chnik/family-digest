# Архитектура

## Высокоуровневая схема

```text
┌─────────────────┐     webhook      ┌──────────────────────┐
│  Telegram API   │ ───────────────► │  Cloudflare Worker   │
│  (updates)      │ ◄─────────────── │  - bot handlers      │
└─────────────────┘   Bot API calls  │  - round state       │
                                     │  - publish to channel│
┌─────────────────┐     cron         │                      │
│ CF Cron Triggers│ ───────────────► │                      │
│ every minute*   │                  └──────────┬───────────┘
└─────────────────┘                             │
                                                ▼
                                     ┌──────────────────────┐
                                     │  Cloudflare D1       │
                                     │  users, settings,    │
                                     │  rounds, submissions │
                                     └──────────────────────┘
```

\* Cron раз в минуту (или чаще/реже по лимитам) проверяет: не пора ли стартовать раунд, слать soft-ping, закрывать окно и публиковать.

Альтернатива: отдельные cron-выражения под известные метки времени — менее гибко при смене интервала админом. Предпочтителен **минутный тик + состояние в БД**.

## Компоненты

| Компонент | Ответственность |
| --- | --- |
| Webhook handler | Приём update: команды, callback, медиа |
| Onboarding / settings | TZ, DND, меню |
| Round scheduler | Старт раунда, soft-ping, close + publish |
| Ingest | Приём медиа, привязка к раунду или late-queue |
| Publisher | Посты в канал с подписью автора |
| Admin | Интервал, диагностика |

## Данные (черновик схемы D1)

### `users`

- `telegram_id` (PK)
- `display_name`
- `timezone` (IANA string)
- `dnd_enabled` (bool)
- `dnd_start_minute` (0–1439, локальные минуты от полуночи)
- `dnd_end_minute` (0–1439)
- `onboarded_at`
- `created_at` / `updated_at`

Интервал DND, пересекающий полночь (`23:00`–`08:00`), допустим; валидация длины ≤ 12 часов.

### `settings` (singleton / key-value)

- `round_interval_hours` (default `2`)
- `channel_id`
- `submission_window_minutes` = `30` (можно захардкодить в v1)
- `soft_ping_after_minutes` = `20`

### `rounds`

- `id`
- `started_at` (UTC)
- `window_ends_at` (UTC)
- `soft_ping_at` (UTC)
- `soft_ping_sent_at` (nullable)
- `closed_at` (nullable)
- `published_at` (nullable)
- `status`: `open` | `closing` | `published`

### `submissions`

- `id`
- `user_id`
- `round_id` (nullable, если ещё не привязан / late)
- `target_round_id` — в какой дайджест должно попасть
- `telegram_file_id`
- `media_type`: `photo` | `video` | `video_note`
- `received_at`
- `published_at` (nullable)
- `channel_message_id` (nullable)

**Правило привязки при приёме:**

1. Если есть `open` раунд и `now < window_ends_at` → `target_round_id = current`.
2. Иначе → создать/положить в очередь на **следующий** раунд (`target_round_id` будущего раунда или флаг `late_pending` до старта следующего).

Уточнение реализации late-queue — в этапе разработки ingest.

## Потоки

### Старт раунда

1. Cron: с последнего `started_at` прошло ≥ `round_interval_hours`.
2. Создать `rounds` со статусом `open`, посчитать `window_ends_at`, `soft_ping_at`.
3. Выбрать пользователей: `onboarded`, не в DND **сейчас** (в их TZ).
4. Разослать напоминание в личку.
5. Сохранить факт рассылки (опционально таблица `notifications` для идемпотентности).

### Soft-ping

1. Cron: есть `open` раунд, `now >= soft_ping_at`, `soft_ping_sent_at IS NULL`.
2. Пользователи без submission с `target_round_id = this`, не в DND сейчас.
3. Отправить мягкий текст, выставить `soft_ping_sent_at`.

### Закрытие и публикация

1. Cron: `now >= window_ends_at`, статус `open`.
2. Статус → `closing` (защита от двойной публикации).
3. Выбрать submissions с `target_round_id = this` и `published_at IS NULL`.
4. Для каждой: `sendPhoto` / `sendVideo` / `sendVideoNote` в канал + caption `от {name}` (для video_note caption в Bot API ограничен — см. риски).
5. Статус → `published`.

### Приём медиа в личку

1. Пользователь отправил photo/video/video_note.
2. Если не onboarded — попросить пройти настройки.
3. Сохранить `file_id` + тип, вычислить `target_round_id`.
4. Короткое подтверждение: «Принято в текущий дайджест» / «Окно закрыто — уйдёт в следующий».

## Секреты и конфиг

Хранятся в Cloudflare secrets / vars:

- `BOT_TOKEN`
- `WEBHOOK_SECRET` (секрет пути или header)
- `ADMIN_IDS` (comma-separated)
- `CHANNEL_ID` (секрет, не переменная в `wrangler.toml`)

## Риски и ограничения Telegram

| Тема | Деталь |
| --- | --- |
| Video note в канале | Может отправиться как video note, но UX в канале отличается от группы; caption для video notes API может не поддерживать — тогда отдельным сообщением имя или публиковать как video. |
| Rate limits | При большой семье рассылку напоминаний батчить с небольшой задержкой. |
| File_id | Достаточно хранить `file_id`; пересылка/sendByFileId с того же бота работает. |
| Worker CPU time | Публикацию большого числа медиа лучше делать чанками или через очередь (Queues) при росте. Для семьи из ~10–30 человек обычно хватает синхронного цикла. |

## Почему Cloudflare

- Бесплатный тир подходит для семейного масштаба.
- Cron без «засыпания» как у бесплатных PaaS.
- D1 рядом с Worker — мало инфраструктуры.
- HTTPS webhook из коробки.
