# Вариант 2 — Google Apps Script *(бонус)*

Тот же сценарий, что и Zapier-версия, но на чистом коде: **бесплатно, без подписок и мгновенно** (срабатывает прямо на отправку формы, без polling-задержки).

```
[Google Форма] --onFormSubmit--> [Google Таблица] --триггер--> [Code.gs]
                                                                   |
                              +------------------------------------+------------------------------------+
                              |                                                                         |
                      Статус = «Срочный!»                                                       Статус = «Обычный»
                              |                                                                         |
                  🚨 Slack + @channel (+ опц. Telegram)                                    📝 Slack без пинга (+ опц. Telegram)
```

## Демо
- 📝 Форма: https://docs.google.com/forms/d/e/1FAIpQLSc85V4ncm0EpBds4y3GF5Uxj1kNG0b1-cn2IUOlUsk55FU2AA/viewform
- 📊 Таблица ответов: https://docs.google.com/spreadsheets/d/1kqDcnWBWBtwdsK2yvV1qdv9tMI03ZomkVW4s9cx2OGo/edit

> Запись в таблицу делает сама связка «форма → таблица» (через `setDestination` в `setup()`). Скрипт читает заявку и шлёт в Slack.

## Файлы
- `Code.gs` — вся логика: `onFormSubmit`, отправка в Slack/Telegram, `setup()`, тесты
- `appsscript.json` — манифест (таймзона, движок V8)

## Развёртывание с нуля

### 1. Slack Incoming Webhook
1. https://api.slack.com/apps → **Create New App** → **From scratch** → имя + workspace
2. **Incoming Webhooks** → включить → **Add New Webhook to Workspace** → выбрать канал → **Allow**
3. Скопировать **Webhook URL** (`https://hooks.slack.com/services/...`)

### 2. Проект Apps Script
1. https://script.google.com → **Новый проект**
2. Вставить содержимое `Code.gs`
3. **⚙️ Настройки проекта** → включить показ `appsscript.json` → вставить содержимое манифеста

### 3. Секрет (webhook)
Безопасный способ — **Script Properties** (секрет не в коде):
**⚙️ Настройки проекта → Свойства скрипта → Добавить** → `SLACK_WEBHOOK_URL` = ваш webhook.
Код читает секреты сначала из Script Properties, и только потом из блока `CONFIG` (где лежат плейсхолдеры).

### 4. Запуск
1. Выбрать функцию **`setup`** → **▶ Выполнить** → выдать права
   → создаст форму с 3 полями, связанную таблицу и installable-триггер `onFormSubmit`.
   Ссылки на форму и таблицу появятся в **Журнале выполнения**.
2. Проверка без формы: запустить **`testUrgent`** и **`testNormal`** → в Slack придут срочное и обычное сообщения.

## Ключевые технические решения
- **Installable-триггер** (не simple): только он имеет право обращаться к внешним URL (`UrlFetchApp`) — нужно для отправки в Slack/Telegram.
- **Чтение полей по заголовкам** (`e.namedValues`), а не по индексу — не сломается при изменении порядка вопросов.
- **Секреты вне кода** — через `Script Properties`, в репозитории только плейсхолдеры.
- **Защита `setup()`** от повторного запуска — не плодит дубли формы/таблицы (ID хранятся в Script Properties).

## Telegram (опционально)
В `CONFIG` (или Script Properties): `ENABLE_TELEGRAM: true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Срочные приходят со звуком, обычные — тихо (`disable_notification`).

## Деплой через clasp (опционально)
```bash
npm install -g @google/clasp
clasp login
clasp create-script --type standalone --title "Motheretreat Leads"
clasp push
```

---

> ⚠️ В этой версии поле «Статус» сделано радио-кнопками. Если нужно строго по ТЗ (выпадающий список) — в `Code.gs` есть функция `setupZapierForm()`, которая создаёт форму с `addListItem()` (dropdown).
