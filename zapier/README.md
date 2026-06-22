# Вариант 1 — Zapier *(по ТЗ)*

Основная реализация на стеке из ТЗ: **Google Forms + Google Sheets + Zapier**.
Zap опубликован и работает. Триггер опрашивает таблицу по расписанию (~1–2 мин).

## Схема Zap

```
[1] Google Sheets — New Spreadsheet Row   (триггер: новая строка из формы)
        |
[2] Paths — Split into paths              (ветвление по полю «Статус запроса»)
        |
   +----+--------------------------------+
   |                                     |
[Path A: Urgent]                   [Path B: Normal]
 Статус запроса = «Срочный!»        Статус запроса = «Обычный»
   |                                     |
[Slack] Send Channel Message       [Slack] Send Channel Message
 <!channel> + 🚨 + поля             📝 + поля (без пинга)
```

## Как настроено

### Триггер
- **App:** Google Sheets → **New Spreadsheet Row**
- **Spreadsheet:** таблица ответов формы
- **Worksheet:** лист ответов формы («Ответы на форму»)

### Ветвление (Paths)
- **Path A (Urgent):** правило — поле `Статус запроса` **Exactly matches** `Срочный!`
- **Path B (Normal):** правило — поле `Статус запроса` **Exactly matches** `Обычный`

### Действия (Slack → Send Channel Message)
Канал: `#new-channel` (целевой канал команды).

**Path A — срочное:**
```
<!channel>
🚨 *СРОЧНАЯ ЗАЯВКА* 🚨
*Имя:* {{Имя}}
*Телефон:* {{Телефон для связи}}
*Статус:* {{Статус запроса}}
```

**Path B — обычное:**
```
📝 *Новая заявка*
*Имя:* {{Имя}}
*Телефон:* {{Телефон для связи}}
*Статус:* {{Статус запроса}}
```

> Поля в `{{...}}` мапятся из колонок таблицы (триггера). `<!channel>` — пинг всего канала, только в срочной ветке.

## Демо
- 📝 Форма: https://docs.google.com/forms/d/e/1FAIpQLSfJI8WE9B9pvdJ29O2Tuk6J5-H3W9U7u3lbLSmHtYUIN3Q9zQ/viewform
- 📊 Таблица: https://docs.google.com/spreadsheets/d/10yw6xAV6QA91NtfNs9sIkPbR8lXjUJh35JiR-yOJVpE/edit

## Скриншоты
_Добавить скриншоты настройки Zap и сообщений в Slack:_
<!-- TODO: положить скриншоты в zapier/screenshots/ и вставить сюда -->
- `screenshots/zap-overview.png` — общий вид Zap (триггер + Paths + Slack)
- `screenshots/slack-urgent.png` — срочное сообщение в Slack (🚨 + @channel)
- `screenshots/slack-normal.png` — обычное сообщение в Slack

## Нюансы
- **Paths** — платная фича Zapier (тариф **Pro** и выше). На free trial доступны ограниченное время.
- **Задержка:** триггер *New Spreadsheet Row* опрашивает таблицу по расписанию (~1–2 мин), уведомление приходит не мгновенно. Для мгновенной доставки — см. [Apps Script-версию](../apps-script/).
