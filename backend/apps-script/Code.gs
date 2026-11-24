/**
 * ControleDePonto — API para Google Sheets
 * Backend do aplicativo hospedado no GitHub Pages.
 *
 * PRIMEIRA CONFIGURAÇÃO:
 * 1. Abra um projeto Apps Script e cole este arquivo.
 * 2. Execute setupControleDePonto() manualmente.
 * 3. Copie do Registro de execução a URL da planilha e a chave API.
 * 4. Implante como Aplicativo da Web: executar como proprietário,
 *    acesso "Qualquer pessoa". A chave compartilhada é exigida em cada chamada.
 *
 * IMPORTANTE:
 * A chave compartilhada é uma barreira provisória, não autenticação individual.
 * Qualquer pessoa que possua a chave pode consultar a base inteira.
 * Não use este modo para separar dados pessoais entre usuários.
 */

const CP = Object.freeze({
  version: "1.0.0",
  spreadsheetProperty: "CP_SPREADSHEET_ID",
  secretProperty: "CP_SHARED_API_KEY",
  originsProperty: "CP_ALLOWED_ORIGINS",
  maxPayloadBytes: 1800000,
  sheets: {
    records: "LANCAMENTOS",
    schedules: "JORNADAS",
    shifts: "ESCALAS"
  },
  headers: {
    records: [
      "ID", "MATRICULA", "NOME", "DATA_INICIAL", "HORA_INICIAL",
      "INTERVALO", "DATA_FINAL", "HORA_FINAL", "ORDEM_VEICULO",
      "PLACA", "TIPO_SERVICO", "ORIGEM", "DESTINO", "CRIADO_EM",
      "ATUALIZADO_EM", "DADOS_JSON"
    ],
    schedules: ["MATRICULA", "JORNADA_MINUTOS", "ATUALIZADO_EM", "DADOS_JSON"],
    shifts: [
      "MATRICULA", "TIPO", "DATA_BASE", "HORA_INICIAL",
      "DURACAO_MINUTOS", "INTERVALO_MINUTOS", "DIAS_TRABALHO",
      "DIAS_DESCANSO", "ATUALIZADO_EM", "DADOS_JSON"
    ]
  }
});

/**
 * Cria a planilha central (apenas na primeira execução), cria as abas e
 * gera uma chave API compartilhada. Execute manualmente no editor do Apps Script.
 */
function setupControleDePonto() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(CP.spreadsheetProperty);
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create("ControleDePonto — Banco Central");
    spreadsheetId = spreadsheet.getId();
    props.setProperty(CP.spreadsheetProperty, spreadsheetId);
  }

  spreadsheet.setSpreadsheetTimeZone("America/Bahia");
  ensureDatabaseSheets_(spreadsheet);

  let apiKey = props.getProperty(CP.secretProperty);
  if (!apiKey) {
    apiKey = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty(CP.secretProperty, apiKey);
  }

  const origins = props.getProperty(CP.originsProperty) ||
    "https://fersahub.github.io";
  props.setProperty(CP.originsProperty, origins);

  const result = {
    message: "Banco central preparado. Guarde a chave API em local seguro.",
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetId: spreadsheetId,
    apiKey: apiKey,
    apiVersion: CP.version,
    allowedOrigins: origins
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Gere uma nova chave se a atual for compartilhada indevidamente. */
function rotateControleDePontoApiKey() {
  const apiKey = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(CP.secretProperty, apiKey);
  console.log("Nova chave API gerada. Atualize a chave em todos os navegadores autorizados.");
  return apiKey;
}

/** Endpoint simples para identificar que a implantação está ativa; não revela dados. */
function doGet() {
  return HtmlService.createHtmlOutput(
    "<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>ControleDePonto API</title>" +
    "<body style='font:16px Arial;padding:24px'><h2>ControleDePonto API</h2>" +
    "<p>Backend ativo. As operações de dados devem ser enviadas por POST autenticado.</p></body></html>"
  );
}

/**
 * Recebe POST via formulário oculto/iframe para contornar a ausência de CORS
 * configurável do ContentService. A resposta HTML envia o resultado por postMessage.
 */
function doPost(e) {
  let requestId = "";
  let origin = "https://fersahub.github.io";

  try {
    const raw = e && e.parameter && e.parameter.payload
      ? e.parameter.payload
      : (e && e.postData ? e.postData.contents : "");

    if (!raw) throw apiError_("EMPTY_REQUEST", "Solicitação vazia.");
    if (raw.length > CP.maxPayloadBytes) {
      throw apiError_("PAYLOAD_TOO_LARGE", "A solicitação ultrapassa o limite permitido. Importe o backup em partes menores.");
    }

    const request = JSON.parse(raw);
    requestId = String(request.requestId || "");
    origin = String(request.origin || origin);

    validateOrigin_(origin);
    validateApiKey_(request.apiKey);

    const result = dispatch_(request);
    return bridgeResponse_(requestId, { ok: true, data: result }, origin);
  } catch (error) {
    const code = error && error.code ? error.code : "SERVER_ERROR";
    const message = error && error.message ? error.message : "Falha inesperada no backend.";
    return bridgeResponse_(requestId, { ok: false, error: { code: code, message: message } }, origin);
  }
}

function dispatch_(request) {
  const action = String(request.action || "");
  const data = request.data || {};

  switch (action) {
    case "ping":
      return ping_();
    case "getAll":
      return getAll_();
    case "saveRecord":
      return saveRecord_(data.record, data.force === true);
    case "deleteRecord":
      return deleteRecord_(data.id);
    case "saveSchedule":
      return saveSchedule_(data.registration, data.dailyTargetMinutes);
    case "deleteSchedule":
      return deleteSchedule_(data.registration);
    case "saveShiftPlan":
      return saveShiftPlan_(data.config);
    case "deleteShiftPlan":
      return deleteShiftPlan_(data.registration);
    case "importRecords":
      return importRecords_(data.records);
    case "importSchedules":
      return importSchedules_(data.schedules);
    case "importShiftPlans":
      return importShiftPlans_(data.shiftSchedules);
    default:
      throw apiError_("UNKNOWN_ACTION", "Operação não reconhecida: " + action);
  }
}

function ping_() {
  const spreadsheet = getSpreadsheet_();
  const counts = {};
  Object.keys(CP.sheets).forEach(function(key) {
    const sheet = spreadsheet.getSheetByName(CP.sheets[key]);
    counts[CP.sheets[key]] = Math.max(0, sheet.getLastRow() - 1);
  });
  return { connected: true, apiVersion: CP.version, counts: counts };
}

function getAll_() {
  const spreadsheet = getSpreadsheet_();
  return {
    records: readJsonRows_(spreadsheet.getSheetByName(CP.sheets.records), 16),
    schedules: readMapRows_(spreadsheet.getSheetByName(CP.sheets.schedules), 1, 4),
    shiftSchedules: readMapRows_(spreadsheet.getSheetByName(CP.sheets.shifts), 1, 10),
    fetchedAt: new Date().toISOString(),
    apiVersion: CP.version
  };
}

function saveRecord_(record, force) {
  validateRecord_(record);
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.records);
    const all = readJsonRows_(sheet, 16);
    const existingIndex = all.findIndex(function(item) { return String(item.id) === String(record.id); });
    const now = new Date().toISOString();
    const normalized = Object.assign({}, record, {
      id: String(record.id),
      createdAt: record.createdAt || (existingIndex >= 0 ? all[existingIndex].createdAt : now),
      updatedAt: now
    });

    if (existingIndex < 0) {
      const duplicate = all.find(function(item) {
        return recordSignature_(item) === recordSignature_(normalized);
      });
      if (duplicate) {
        throw apiError_("DUPLICATE_RECORD", "Este lançamento já existe no banco central (ID " + duplicate.id + ").");
      }

      const overlapping = all.find(function(item) {
        return recordsOverlap_(item, normalized);
      });
      if (overlapping && !force) {
        throw apiError_("OVERLAPPING_RECORD", "Há uma jornada sobreposta no banco central para a mesma matrícula. Revise os horários antes de continuar.");
      }
    }

    const row = recordToRow_(normalized);
    if (existingIndex >= 0) {
      const rowNumber = findRowByKey_(sheet, 1, normalized.id);
      if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
    } else {
      sheet.appendRow(row);
    }
    return { saved: true, id: normalized.id, updated: existingIndex >= 0 };
  });
}

function deleteRecord_(id) {
  const key = String(id || "").trim();
  if (!key) throw apiError_("INVALID_ID", "ID do lançamento não informado.");
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.records);
    const row = findRowByKey_(sheet, 1, key);
    if (!row) return { deleted: false, notFound: true };
    sheet.deleteRow(row);
    return { deleted: true, id: key };
  });
}

function saveSchedule_(registration, dailyTargetMinutes) {
  const key = normalizeRegistration_(registration);
  const minutes = Number(dailyTargetMinutes);
  if (!key || !Number.isInteger(minutes) || minutes < 1 || minutes > 1439) {
    throw apiError_("INVALID_SCHEDULE", "Matrícula ou jornada diária inválida.");
  }
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.schedules);
    const value = { registration: key, dailyTargetMinutes: minutes, updatedAt: new Date().toISOString() };
    const row = [key, minutes, value.updatedAt, JSON.stringify(value)];
    upsertRow_(sheet, key, row);
    return { saved: true, registration: key };
  });
}

function deleteSchedule_(registration) {
  const key = normalizeRegistration_(registration);
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.schedules);
    const row = findRowByKey_(sheet, 1, key);
    if (row) sheet.deleteRow(row);
    return { deleted: Boolean(row), registration: key };
  });
}

function saveShiftPlan_(config) {
  if (!config || typeof config !== "object") throw apiError_("INVALID_SHIFT", "Configuração de escala inválida.");
  const key = normalizeRegistration_(config.registration);
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  const normalized = Object.assign({}, config, { registration: key, updatedAt: new Date().toISOString() });
  const row = [
    key, normalized.type || "", normalized.anchorDate || "", normalized.startTime || "",
    Number(normalized.durationMinutes) || 0, Number(normalized.intervalMinutes) || 0,
    Number(normalized.workDays) || 0, Number(normalized.restDays) || 0,
    normalized.updatedAt, JSON.stringify(normalized)
  ];
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.shifts);
    upsertRow_(sheet, key, row);
    return { saved: true, registration: key };
  });
}

function deleteShiftPlan_(registration) {
  const key = normalizeRegistration_(registration);
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.shifts);
    const row = findRowByKey_(sheet, 1, key);
    if (row) sheet.deleteRow(row);
    return { deleted: Boolean(row), registration: key };
  });
}

function importRecords_(items) {
  if (!Array.isArray(items)) throw apiError_("INVALID_IMPORT", "A lista de lançamentos do backup é inválida.");
  if (items.length > 100) throw apiError_("BATCH_TOO_LARGE", "Importe no máximo 100 lançamentos por lote.");
  items.forEach(validateRecord_);

  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.records);
    const existing = readJsonRows_(sheet, 16);
    const ids = new Set(existing.map(function(item) { return String(item.id); }));
    const signatures = new Set(existing.map(recordSignature_));
    const rows = [];
    let skipped = 0;

    items.forEach(function(item) {
      const id = String(item.id);
      const signature = recordSignature_(item);
      if (ids.has(id) || signatures.has(signature)) {
        skipped += 1;
        return;
      }
      ids.add(id);
      signatures.add(signature);
      const normalized = Object.assign({}, item, {
        id: id,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      rows.push(recordToRow_(normalized));
    });

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { imported: rows.length, skipped: skipped, received: items.length };
  });
}

function importSchedules_(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw apiError_("INVALID_IMPORT", "As jornadas do backup são inválidas.");
  }
  const entries = Object.entries(source);
  if (entries.length > 2000) throw apiError_("BATCH_TOO_LARGE", "Quantidade de jornadas acima do limite.");
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.schedules);
    let saved = 0;
    entries.forEach(function(entry) {
      const key = normalizeRegistration_(entry[0]);
      const minutes = Number(entry[1]);
      if (!key || !Number.isInteger(minutes) || minutes < 1 || minutes > 1439) return;
      const value = { registration: key, dailyTargetMinutes: minutes, updatedAt: new Date().toISOString() };
      upsertRow_(sheet, key, [key, minutes, value.updatedAt, JSON.stringify(value)]);
      saved += 1;
    });
    return { saved: saved };
  });
}

function importShiftPlans_(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw apiError_("INVALID_IMPORT", "As escalas do backup são inválidas.");
  }
  const entries = Object.entries(source);
  if (entries.length > 2000) throw apiError_("BATCH_TOO_LARGE", "Quantidade de escalas acima do limite.");
  return withWriteLock_(function() {
    const sheet = getSpreadsheet_().getSheetByName(CP.sheets.shifts);
    let saved = 0;
    entries.forEach(function(entry) {
      const key = normalizeRegistration_(entry[0]);
      if (!key || !entry[1] || typeof entry[1] !== "object") return;
      const config = Object.assign({}, entry[1], { registration: key, updatedAt: new Date().toISOString() });
      const row = [
        key, config.type || "", config.anchorDate || "", config.startTime || "",
        Number(config.durationMinutes) || 0, Number(config.intervalMinutes) || 0,
        Number(config.workDays) || 0, Number(config.restDays) || 0,
        config.updatedAt, JSON.stringify(config)
      ];
      upsertRow_(sheet, key, row);
      saved += 1;
    });
    return { saved: saved };
  });
}

function validateRecord_(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw apiError_("INVALID_RECORD", "Lançamento inválido.");
  if (!String(record.id || "").trim()) throw apiError_("INVALID_RECORD", "Lançamento sem identificador.");
  if (!normalizeRegistration_(record.registration)) throw apiError_("INVALID_RECORD", "Lançamento sem matrícula.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.startDate || ""))) throw apiError_("INVALID_RECORD", "Data inicial inválida.");
  const allowed = ["Plantão", "Viagem", "Intervalo", "Folga"];
  if (!allowed.includes(String(record.serviceType || ""))) throw apiError_("INVALID_RECORD", "Tipo de serviço inválido.");
  if (["Plantão", "Viagem"].includes(record.serviceType)) {
    if (!/^\d{2}:\d{2}$/.test(String(record.startTime || "")) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(record.endDate || "")) ||
        !/^\d{2}:\d{2}$/.test(String(record.endTime || ""))) {
      throw apiError_("INVALID_RECORD", "Horários do lançamento inválidos.");
    }
    if (record.serviceType === "Viagem" &&
        (!String(record.vehicleOrder || "").trim() || !String(record.plate || "").trim() ||
         !String(record.origin || "").trim() || !String(record.destination || "").trim())) {
      throw apiError_("INVALID_RECORD", "Viagem exige ordem do veículo, placa, origem e destino.");
    }
  }
}

function recordToRow_(record) {
  return [
    String(record.id), normalizeRegistration_(record.registration), String(record.fullName || ""),
    String(record.startDate || ""), String(record.startTime || ""), String(record.interval || ""),
    String(record.endDate || ""), String(record.endTime || ""), String(record.vehicleOrder || ""),
    String(record.plate || ""), String(record.serviceType || ""), String(record.origin || ""),
    String(record.destination || ""), String(record.createdAt || ""), String(record.updatedAt || ""),
    JSON.stringify(record)
  ];
}

function readJsonRows_(sheet, jsonColumn) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, jsonColumn).getValues();
  return values.map(function(row) {
    try { return JSON.parse(String(row[jsonColumn - 1] || "{}")); }
    catch (error) { return null; }
  }).filter(function(item) { return item && typeof item === "object"; });
}

function readMapRows_(sheet, keyColumn, jsonColumn) {
  const result = {};
  readJsonRows_(sheet, jsonColumn).forEach(function(item) {
    const key = normalizeRegistration_(item.registration);
    if (key) result[key] = item.dailyTargetMinutes !== undefined ? item.dailyTargetMinutes : item;
  });
  return result;
}

function ensureDatabaseSheets_(spreadsheet) {
  const configs = [
    [CP.sheets.records, CP.headers.records],
    [CP.sheets.schedules, CP.headers.schedules],
    [CP.sheets.shifts, CP.headers.shifts]
  ];
  configs.forEach(function(config) {
    let sheet = spreadsheet.getSheetByName(config[0]);
    if (!sheet) sheet = spreadsheet.insertSheet(config[0]);
    const headers = config[1];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#1e314a")
        .setFontColor("#ffffff");
      sheet.autoResizeColumns(1, headers.length);
    } else {
      const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
      if (actual.join("|") !== headers.join("|")) {
        throw apiError_("SHEET_SCHEMA_MISMATCH", "Cabeçalho inesperado na aba " + config[0] + ". Não alterei os dados existentes.");
      }
    }
  });

  const defaultSheet = spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && spreadsheet.getSheets().length > configs.length && defaultSheet.getLastRow() === 0) {
    spreadsheet.deleteSheet(defaultSheet);
  }
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CP.spreadsheetProperty);
  if (!id) throw apiError_("NOT_INITIALIZED", "Execute setupControleDePonto() no editor do Apps Script antes de usar a API.");
  return SpreadsheetApp.openById(id);
}

function findRowByKey_(sheet, column, key) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  const index = values.findIndex(function(row) { return String(row[0]) === String(key); });
  return index < 0 ? 0 : index + 2;
}

function upsertRow_(sheet, key, row) {
  const rowNumber = findRowByKey_(sheet, 1, key);
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function recordSignature_(record) {
  return [
    normalizeRegistration_(record.registration), record.serviceType || "",
    record.startDate || "", record.startTime || "", record.endDate || "",
    record.endTime || "", String(record.vehicleOrder || "").trim().toUpperCase(),
    String(record.plate || "").trim().toUpperCase()
  ].join("|");
}

function recordsOverlap_(a, b) {
  if (!a || !b || normalizeRegistration_(a.registration) !== normalizeRegistration_(b.registration)) return false;
  if (!["Plantão", "Viagem"].includes(a.serviceType) || !["Plantão", "Viagem"].includes(b.serviceType)) return false;
  const aStart = dateTimeNumber_(a.startDate, a.startTime);
  const aEnd = dateTimeNumber_(a.endDate, a.endTime);
  const bStart = dateTimeNumber_(b.startDate, b.startTime);
  const bEnd = dateTimeNumber_(b.endDate, b.endTime);
  return [aStart, aEnd, bStart, bEnd].every(Number.isFinite) && aStart < bEnd && bStart < aEnd;
}

function dateTimeNumber_(date, time) {
  const stamp = Date.parse(String(date || "") + "T" + String(time || "") + ":00-03:00");
  return Number.isFinite(stamp) ? stamp : NaN;
}

function normalizeRegistration_(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function withWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function validateApiKey_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty(CP.secretProperty);
  if (!expected) throw apiError_("NOT_INITIALIZED", "Execute setupControleDePonto() antes de utilizar o backend.");
  const left = String(candidate || "");
  if (!constantTimeEquals_(left, expected)) throw apiError_("UNAUTHORIZED", "Código de acesso ao banco inválido ou ausente.");
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function validateOrigin_(origin) {
  const configured = PropertiesService.getScriptProperties().getProperty(CP.originsProperty) || "https://fersahub.github.io";
  const allowed = configured.split(",").map(function(item) { return item.trim(); }).filter(Boolean);
  if (allowed.indexOf(origin) < 0) throw apiError_("ORIGIN_NOT_ALLOWED", "Origem não autorizada para esta implantação.");
}

function bridgeResponse_(requestId, response, origin) {
  const message = safeJson_({
    channel: "CONTROLE_PONTO_SHEETS",
    requestId: String(requestId || ""),
    response: response
  });
  const html = "<!doctype html><html><head><meta charset='utf-8'></head><body><script>" +
    "window.parent.postMessage(" + message + "," + safeJson_(origin) + ");" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function safeJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function apiError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
