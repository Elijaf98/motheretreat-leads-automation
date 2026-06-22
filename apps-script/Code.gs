/**
 * ============================================================================
 *  Motheretreat LLC — Автоматизация заявок
 *  Google Форма  →  Google Таблица  →  Slack  (+ опционально Telegram)
 * ============================================================================
 *
 *  ЧТО ДЕЛАЕТ:
 *   - ловит новую заявку из формы (триггер onFormSubmit);
 *   - читает поля Имя / Телефон / Статус;
 *   - шлёт уведомление в Slack:
 *        • Статус = "Срочный!" → 🚨 + пинг всего канала (<!channel>) + пометка СРОЧНО;
 *        • Статус = "Обычный"  → обычное тихое сообщение без пинга;
 *   - опционально дублирует заявку в Telegram (включается флагом в конфиге).
 *
 *  КАК ЗАПУСТИТЬ (кратко; подробно — в README.md):
 *   1) Впиши секреты в блок CONFIG ниже (или в Script Properties — безопаснее).
 *   2) Один раз запусти setup() из редактора — создаст форму, таблицу и триггер.
 *   3) Проверь testUrgent() и testNormal() — придут сообщения в Slack.
 * ============================================================================
 */


// =============================  CONFIG (НАСТРОЙКИ)  ==========================
// ВНИМАНИЕ: ниже плейсхолдеры. Подставь свои значения.
// Секреты безопаснее хранить в Script Properties (см. README → "Секреты"):
// тогда поля-плейсхолдеры можно оставить как есть — код возьмёт значения оттуда.

const CONFIG = {
  // --- Slack ---
  SLACK_WEBHOOK_URL: 'PASTE_SLACK_WEBHOOK_URL_HERE', // https://hooks.slack.com/services/XXX/YYY/ZZZ

  // --- Telegram (опционально) ---
  ENABLE_TELEGRAM: false,                               // true → дублировать заявки в Telegram
  TELEGRAM_BOT_TOKEN: 'PASTE_TELEGRAM_BOT_TOKEN_HERE',  // токен от @BotFather
  TELEGRAM_CHAT_ID: 'PASTE_TELEGRAM_CHAT_ID_HERE',      // id чата/группы/канала

  // --- Какое значение статуса считаем "срочным" ---
  URGENT_VALUE: 'Срочный!',

  // --- Названия полей (должны совпадать с заголовками колонок в таблице ответов) ---
  FIELD_NAME: 'Имя',
  FIELD_PHONE: 'Телефон',
  FIELD_STATUS: 'Статус',

  // --- Параметры формы (используются только в setup() при создании формы) ---
  FORM_TITLE: 'Заявка — Motheretreat LLC',
  STATUS_OPTIONS: ['Обычный', 'Срочный!'],
};
// ============================================================================


/**
 * Безопасное чтение секрета: сначала смотрим Script Properties (приоритет),
 * если там пусто — берём из CONFIG. Так секреты можно держать вне кода.
 * @param {string} key ключ из CONFIG (например 'SLACK_WEBHOOK_URL')
 * @return {string}
 */
function getSecret_(key) {
  const fromProps = PropertiesService.getScriptProperties().getProperty(key);
  if (fromProps && String(fromProps).trim() !== '') return fromProps;
  return CONFIG[key];
}

/** Простая проверка, что секрет реально вписан, а не остался плейсхолдером. */
function isFilled_(value) {
  return !!value && String(value).indexOf('PASTE_') !== 0 && String(value).trim() !== '';
}


/**
 * ГЛАВНЫЙ ОБРАБОТЧИК. Его дёргает триггер onFormSubmit при каждой новой заявке.
 * @param {Object} e событие формы. При триггере на таблице содержит e.namedValues:
 *                   { "Имя": ["Вася"], "Телефон": ["+7..."], "Статус": ["Срочный!"] }
 */
function onFormSubmit(e) {
  try {
    const data = extractFields_(e);                       // достаём Имя/Телефон/Статус
    const isUrgent = (data.status || '').trim() === CONFIG.URGENT_VALUE;

    sendToSlack_(data, isUrgent);                         // Slack — всегда

    if (CONFIG.ENABLE_TELEGRAM) {                         // Telegram — если включён флагом
      sendToTelegram_(data, isUrgent);
    }
  } catch (err) {
    // Ошибку видно в редакторе: "Просмотр → Журналы выполнения"
    console.error('onFormSubmit error: ' + (err && err.stack ? err.stack : err));
    throw err;                                            // пробрасываем, чтобы прогон пометился как упавший
  }
}


/**
 * Достаёт Имя / Телефон / Статус из события формы.
 * Поддерживает оба формата события:
 *   - триггер на ТАБЛИЦЕ → e.namedValues (основной путь, его делает setup());
 *   - триггер на ФОРМЕ   → e.response   (на всякий случай).
 * @return {{name: string, phone: string, status: string}}
 */
function extractFields_(e) {
  // Вариант 1: триггер на таблице
  if (e && e.namedValues) {
    const nv = e.namedValues;
    return {
      name:   pick_(nv, CONFIG.FIELD_NAME),
      phone:  pick_(nv, CONFIG.FIELD_PHONE),
      status: pick_(nv, CONFIG.FIELD_STATUS),
    };
  }
  // Вариант 2: триггер на форме
  if (e && e.response && typeof e.response.getItemResponses === 'function') {
    const map = {};
    e.response.getItemResponses().forEach(function (ir) {
      map[ir.getItem().getTitle()] = ir.getResponse();
    });
    return {
      name:   (map[CONFIG.FIELD_NAME]   || '—').toString().trim(),
      phone:  (map[CONFIG.FIELD_PHONE]  || '—').toString().trim(),
      status: (map[CONFIG.FIELD_STATUS] || '—').toString().trim(),
    };
  }
  throw new Error('Не удалось прочитать данные заявки: неизвестный формат события (нет namedValues и response).');
}

/** Берёт значение из namedValues по ключу-заголовку. Значения там — массивы строк. */
function pick_(namedValues, key) {
  const v = namedValues[key];
  if (Array.isArray(v)) return (v[0] || '').toString().trim() || '—';
  return (v || '—').toString().trim();
}


/**
 * Отправка в Slack через Incoming Webhook.
 * @param {{name:string,phone:string,status:string}} data
 * @param {boolean} isUrgent
 */
function sendToSlack_(data, isUrgent) {
  const url = getSecret_('SLACK_WEBHOOK_URL');
  if (!isFilled_(url)) {
    throw new Error('SLACK_WEBHOOK_URL не задан. Впиши webhook в CONFIG или в Script Properties.');
  }

  const header = isUrgent ? '🚨 СРОЧНАЯ ЗАЯВКА 🚨' : '📝 Новая заявка';

  // <!channel> выносим ОТДЕЛЬНОЙ строкой (вне *bold*): так Slack гарантированно
  // распознаёт его как пинг канала. Внутри *...* спец-упоминания срабатывают не всегда.
  const lines = [];
  if (isUrgent) lines.push('<!channel>');               // пинг всего канала — только для срочных
  lines.push('*' + header + '*');
  lines.push('*Имя:* ' + data.name);
  lines.push('*Телефон:* ' + data.phone);
  lines.push('*Статус:* ' + data.status);
  const text = lines.join('\n');

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),            // mrkdwn в поле text включён по умолчанию
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error('Slack вернул ' + code + ': ' + resp.getContentText());
  }
}


/**
 * Отправка в Telegram через Bot API (sendMessage). Вызывается только если ENABLE_TELEGRAM=true.
 * @param {{name:string,phone:string,status:string}} data
 * @param {boolean} isUrgent
 */
function sendToTelegram_(data, isUrgent) {
  const token  = getSecret_('TELEGRAM_BOT_TOKEN');
  const chatId = getSecret_('TELEGRAM_CHAT_ID');
  if (!isFilled_(token) || !isFilled_(chatId)) {
    throw new Error('Telegram включён, но TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы.');
  }

  const header = isUrgent ? '🚨 <b>СРОЧНАЯ ЗАЯВКА</b> 🚨' : '📝 <b>Новая заявка</b>';
  const text = [
    header,
    '<b>Имя:</b> '     + escapeHtml_(data.name),
    '<b>Телефон:</b> ' + escapeHtml_(data.phone),
    '<b>Статус:</b> '  + escapeHtml_(data.status),
  ].join('\n');

  const resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_notification: !isUrgent,                   // срочные — со звуком, обычные — тихо
    }),
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error('Telegram вернул ' + code + ': ' + resp.getContentText());
  }
}

/** Экранирование спецсимволов для Telegram parse_mode=HTML. */
function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/**
 * УСТАНОВКА. Запусти ОДИН РАЗ вручную из редактора (кнопка ▶, выбрав функцию setup).
 * Создаёт: форму с 3 полями, связанную таблицу ответов и installable-триггер onFormSubmit.
 * Ссылки на форму и таблицу выведет в журнал: "Просмотр → Журналы выполнения".
 */
function setup() {
  const props = PropertiesService.getScriptProperties();

  // Защита от повторного запуска: если форма/таблица уже создавались — НЕ плодим дубли,
  // а только пересоздаём триггер. ID запоминаем в Script Properties.
  const savedFormId = props.getProperty('FORM_ID');
  const savedSsId   = props.getProperty('SPREADSHEET_ID');
  if (savedFormId && savedSsId) {
    const form = FormApp.openById(savedFormId);
    const ss   = SpreadsheetApp.openById(savedSsId);
    removeFormSubmitTriggers_();
    ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();

    Logger.log('ℹ️ Проект уже был настроен — пересоздал только триггер (дубли не создаю).');
    Logger.log('📝 Форма (редактирование): ' + form.getEditUrl());
    Logger.log('🔗 Форма (для людей):      ' + form.getPublishedUrl());
    Logger.log('📊 Таблица ответов:        ' + ss.getUrl());
    Logger.log('Чтобы создать всё заново — удали свойства FORM_ID и SPREADSHEET_ID в Настройках проекта.');
    return;
  }

  // 1) Форма с 3 полями
  const form = FormApp.create(CONFIG.FORM_TITLE);
  form.setDescription('Оставьте заявку — мы свяжемся с вами.');
  form.addTextItem().setTitle(CONFIG.FIELD_NAME).setRequired(true);
  form.addTextItem().setTitle(CONFIG.FIELD_PHONE).setRequired(true);
  form.addMultipleChoiceItem()
      .setTitle(CONFIG.FIELD_STATUS)
      .setChoiceValues(CONFIG.STATUS_OPTIONS)
      .setRequired(true);

  // 2) Связанная таблица ответов
  const ss = SpreadsheetApp.create('Заявки — ' + CONFIG.FORM_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Запоминаем ID, чтобы повторный setup() не создавал дубли
  props.setProperty('FORM_ID', form.getId());
  props.setProperty('SPREADSHEET_ID', ss.getId());

  // 3) Триггер на таблицу (installable — имеет право слать в Slack/Telegram)
  removeFormSubmitTriggers_();                           // сносим старые дубли
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('✅ Готово! Проект настроен.');
  Logger.log('📝 Форма (редактирование): ' + form.getEditUrl());
  Logger.log('🔗 Форма (для людей):      ' + form.getPublishedUrl());
  Logger.log('📊 Таблица ответов:        ' + ss.getUrl());
}

/** Удаляет ранее созданные триггеры onFormSubmit, чтобы не плодить дубли. */
function removeFormSubmitTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(t);
    }
  });
}


/**
 * ДЛЯ ZAPIER-ВЕРСИИ. Создаёт ОТДЕЛЬНУЮ Google Форму (Имя, Телефон,
 * Статус — выпадающий список) + новую таблицу ответов.
 * ВАЖНО: тут НЕТ Apps Script триггера — эти заявки ловит Zapier, а не наш код
 * (иначе были бы дубли сообщений в Slack).
 * Колонки таблицы делаю "Имя"/"Телефон"/"Статус" — как уже ждёт твой Zapier,
 * чтобы перенастройка была минимальной.
 * Запусти ОДИН раз вручную. Ссылки появятся в журнале выполнения.
 */
function setupZapierForm() {
  const form = FormApp.create('Заявка — Motheretreat (Zapier)');
  form.setDescription('Оставьте заявку — мы свяжемся с вами.');

  form.addTextItem().setTitle('Имя').setRequired(true);
  form.addTextItem().setTitle('Телефон').setRequired(true);
  form.addListItem()                                   // addListItem = ВЫПАДАЮЩИЙ СПИСОК (dropdown), как в ТЗ
      .setTitle('Статус')
      .setChoiceValues(['Обычный', 'Срочный!'])
      .setRequired(true);

  const ss = SpreadsheetApp.create('Заявки (Zapier) — Motheretreat');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('✅ Форма для Zapier создана (Статус — выпадающий список, БЕЗ Apps Script триггера).');
  Logger.log('📝 Форма (редактирование): ' + form.getEditUrl());
  Logger.log('🔗 Форма (для людей):      ' + form.getPublishedUrl());
  Logger.log('📊 Таблица ответов:        ' + ss.getUrl());
  Logger.log('➡️ Дальше: в Zapier перенацель триггер New Spreadsheet Row на ЭТУ таблицу, лист "Ответы на форму (1)".');
}


// ===============================  ТЕСТЫ  ====================================
// Запускаются из редактора вручную. Шлют РЕАЛЬНОЕ сообщение, форма не нужна.

/** Тест "срочной" заявки → должно прийти 🚨 + пинг канала. */
function testUrgent() {
  onFormSubmit({
    namedValues: {
      [CONFIG.FIELD_NAME]:   ['Тест Срочный'],
      [CONFIG.FIELD_PHONE]:  ['+7 900 000-00-00'],
      [CONFIG.FIELD_STATUS]: [CONFIG.URGENT_VALUE],
    },
  });
}

/** Тест "обычной" заявки → должно прийти тихое сообщение без пинга. */
function testNormal() {
  onFormSubmit({
    namedValues: {
      [CONFIG.FIELD_NAME]:   ['Тест Обычный'],
      [CONFIG.FIELD_PHONE]:  ['+7 900 111-11-11'],
      [CONFIG.FIELD_STATUS]: ['Обычный'],
    },
  });
}
