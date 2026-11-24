/**
 * ControleDePonto — backend multiusuário para Google Sheets.
 * A planilha existente é preservada. O acesso aos dados é sempre autorizado
 * no servidor por sessão individual; nunca confie em filtros feitos no navegador.
 */

const CP = Object.freeze({
  version: "2.0.0",
  spreadsheetProperty: "CP_SPREADSHEET_ID",
  pepperProperty: "CP_PASSWORD_PEPPER",
  originsProperty: "CP_ALLOWED_ORIGINS",
  sessionDays: 14,
  maxPayloadBytes: 1800000,
  sheets: {
    records: "LANCAMENTOS",
    schedules: "JORNADAS",
    shifts: "ESCALAS",
    users: "USUARIOS",
    sessions: "SESSOES"
  },
  headers: {
    records: ["ID","MATRICULA","NOME","DATA_INICIAL","HORA_INICIAL","INTERVALO","DATA_FINAL","HORA_FINAL","ORDEM_VEICULO","PLACA","TIPO_SERVICO","ORIGEM","DESTINO","CRIADO_EM","ATUALIZADO_EM","DADOS_JSON"],
    schedules: ["MATRICULA","JORNADA_MINUTOS","ATUALIZADO_EM","DADOS_JSON"],
    shifts: ["MATRICULA","TIPO","DATA_BASE","HORA_INICIAL","DURACAO_MINUTOS","INTERVALO_MINUTOS","DIAS_TRABALHO","DIAS_DESCANSO","ATUALIZADO_EM","DADOS_JSON"],
    users: ["ID","USUARIO","NOME_COMPLETO","MATRICULA","PAPEL","SALT","SENHA_HASH","ATIVO","TROCAR_SENHA","CRIADO_EM"],
    sessions: ["TOKEN_HASH","USUARIO_ID","CRIADO_EM","EXPIRA_EM","REVOGADO_EM"]
  }
});

/** Executar uma vez no projeto Apps Script ligado à planilha já utilizada. */
function setupControleDePonto() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(CP.spreadsheetProperty);
  let ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create("ControleDePonto — Banco Central");
  if (!id) props.setProperty(CP.spreadsheetProperty, ss.getId());
  ss.setSpreadsheetTimeZone("America/Bahia");
  ensureDatabaseSheets_(ss);
  if (!props.getProperty(CP.pepperProperty)) props.setProperty(CP.pepperProperty, randomSecret_());
  props.setProperty(CP.originsProperty, props.getProperty(CP.originsProperty) || "https://fersahub.github.io");

  let initialAdminPassword = "";
  const users = readUsers_();
  if (!users.some(u => u.role === "admin")) {
    initialAdminPassword = randomSecret_().slice(0, 24) + "aA9!";
    createUserRow_({
      id: "admin-" + Utilities.getUuid(),
      username: "admin",
      fullName: "Administrador",
      registration: "",
      role: "admin",
      password: initialAdminPassword,
      active: true,
      mustChange: true
    });
  }
  const result = {
    message: "Backend multiusuário preparado. A planilha existente foi preservada.",
    spreadsheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    apiUrl: ScriptApp.getService().getUrl(),
    apiVersion: CP.version,
    initialAdminUsername: initialAdminPassword ? "admin" : "",
    initialAdminPassword: initialAdminPassword || "(administrador já existente; use resetControleDePontoAdminPassword() se precisar redefinir)"
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Emite uma nova senha temporária do administrador e a mostra somente no Registro de execução. */
function resetControleDePontoAdminPassword() {
  const admin = readUsers_().find(u => u.role === "admin");
  if (!admin) throw apiError_("ADMIN_NOT_FOUND", "Execute setupControleDePonto() primeiro.");
  const password = randomSecret_().slice(0, 24) + "aA9!";
  updateUserPassword_(admin.id, password, true);
  console.log("Usuário: admin\nSenha temporária: " + password);
  return password;
}

function doGet() {
  return HtmlService.createHtmlOutput("<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>ControleDePonto API</title><body style='font:16px Arial;padding:24px'><h2>ControleDePonto API v" + CP.version + "</h2><p>Backend ativo. Entre pelo site Controle de Ponto com sua conta individual.</p></body></html>");
}

function doPost(e) {
  let requestId = "";
  let origin = "https://fersahub.github.io";
  try {
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : (e && e.postData ? e.postData.contents : "");
    if (!raw) throw apiError_("EMPTY_REQUEST", "Solicitação vazia.");
    if (raw.length > CP.maxPayloadBytes) throw apiError_("PAYLOAD_TOO_LARGE", "A solicitação ultrapassa o limite permitido.");
    const request = JSON.parse(raw);
    requestId = String(request.requestId || "");
    origin = String(request.origin || origin);
    validateOrigin_(origin);
    enforceRateLimit_();
    const result = dispatch_(request);
    return bridgeResponse_(requestId, { ok: true, data: result }, origin);
  } catch (error) {
    return bridgeResponse_(requestId, { ok: false, error: { code: error && error.code || "SERVER_ERROR", message: error && error.message || "Falha inesperada no backend." } }, origin);
  }
}

function dispatch_(request) {
  const action = String(request.action || "");
  const data = request.data || {};
  if (action === "login") return login_(data.username, data.password);
  if (action === "me") return publicUser_(getSession_(request.sessionToken).user);
  if (action === "logout") return logout_(request.sessionToken);
  const session = getSession_(request.sessionToken);
  const user = session.user;
  if (user.mustChange && !["changePassword", "me", "logout"].includes(action)) throw apiError_("PASSWORD_CHANGE_REQUIRED", "Altere sua senha temporária antes de continuar.");
  switch (action) {
    case "ping": return ping_(user);
    case "getAll": return getAll_(user);
    case "saveRecord": return saveRecord_(data.record, data.force === true, user);
    case "deleteRecord": return deleteRecord_(data.id, user);
    case "saveSchedule": return saveSchedule_(data.registration, data.dailyTargetMinutes, user);
    case "deleteSchedule": return deleteSchedule_(data.registration, user);
    case "saveShiftPlan": return saveShiftPlan_(data.config, user);
    case "deleteShiftPlan": return deleteShiftPlan_(data.registration, user);
    case "importRecords": requireAdmin_(user); return importRecords_(data.records, user);
    case "importSchedules": requireAdmin_(user); return importSchedules_(data.schedules, user);
    case "importShiftPlans": requireAdmin_(user); return importShiftPlans_(data.shiftSchedules, user);
    case "listUsers": requireAdmin_(user); return listUsers_();
    case "createUser": requireAdmin_(user); return createEmployee_(data);
    case "resetUserPassword": requireAdmin_(user); return resetUserPassword_(data.userId);
    case "setUserActive": requireAdmin_(user); return setUserActive_(data.userId, data.active === true);
    case "changePassword": return changePassword_(user, data.currentPassword, data.newPassword);
    default: throw apiError_("UNKNOWN_ACTION", "Operação não reconhecida: " + action);
  }
}

function login_(username, password) {
  const key = normalizeUsername_(username);
  if (!key || String(password || "").length < 1) throw apiError_("INVALID_CREDENTIALS", "Usuário ou senha inválidos.");
  const cache = CacheService.getScriptCache();
  const attemptsKey = "CP_LOGIN_" + digest_(key);
  const attempts = Number(cache.get(attemptsKey) || 0);
  if (attempts >= 10) throw apiError_("LOGIN_RATE_LIMIT", "Muitas tentativas. Aguarde um minuto e tente novamente.");
  const user = readUsers_().find(u => u.username === key);
  const valid = user && user.active && constantTimeEquals_(passwordHash_(String(password), user.salt), user.passwordHash);
  if (!valid) {
    cache.put(attemptsKey, String(attempts + 1), 60);
    throw apiError_("INVALID_CREDENTIALS", "Usuário ou senha inválidos.");
  }
  cache.remove(attemptsKey);
  const token = randomSecret_() + randomSecret_();
  const created = new Date();
  const expires = new Date(created.getTime() + CP.sessionDays * 86400000);
  withWriteLock_(function() {
    getSheet_(CP.sheets.sessions).appendRow([digest_(token), user.id, created.toISOString(), expires.toISOString(), ""]);
  });
  return { token: token, expiresAt: expires.toISOString(), user: publicUser_(user) };
}

function logout_(token) {
  const tokenHash = digest_(String(token || ""));
  if (!tokenHash) return { loggedOut: true };
  withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.sessions);
    const row = findRowByKey_(sheet, 1, tokenHash);
    if (row) sheet.getRange(row, 5).setValue(new Date().toISOString());
  });
  return { loggedOut: true };
}

function getSession_(token) {
  const raw = String(token || "");
  if (raw.length < 40) throw apiError_("UNAUTHORIZED", "Sua sessão expirou. Entre novamente.");
  const hash = digest_(raw);
  const sheet = getSheet_(CP.sheets.sessions);
  const row = findRowByKey_(sheet, 1, hash);
  if (!row) throw apiError_("UNAUTHORIZED", "Sessão não encontrada. Entre novamente.");
  const values = sheet.getRange(row, 1, 1, 5).getDisplayValues()[0];
  if (values[4]) throw apiError_("UNAUTHORIZED", "Esta sessão foi encerrada. Entre novamente.");
  if (!values[3] || new Date(values[3]).getTime() <= Date.now()) throw apiError_("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente.");
  const user = readUsers_().find(u => u.id === values[1]);
  if (!user || !user.active) throw apiError_("ACCOUNT_DISABLED", "Esta conta está desativada. Procure o administrador.");
  return { user: user, expiresAt: values[3] };
}

function createEmployee_(data) {
  const username = normalizeUsername_(data.username);
  const fullName = String(data.fullName || "").trim();
  const registration = normalizeRegistration_(data.registration);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw apiError_("INVALID_USERNAME", "O usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.");
  if (fullName.length < 3 || fullName.length > 120) throw apiError_("INVALID_NAME", "Informe o nome completo do funcionário.");
  if (!registration || registration.length > 30) throw apiError_("INVALID_REGISTRATION", "Informe uma matrícula válida.");
  return withWriteLock_(function() {
    const users = readUsers_();
    if (users.some(u => u.username === username)) throw apiError_("USERNAME_EXISTS", "Este nome de usuário já está cadastrado.");
    if (users.some(u => u.role === "employee" && u.registration === registration)) throw apiError_("REGISTRATION_EXISTS", "Esta matrícula já está vinculada a outra conta.");
    const password = randomSecret_().slice(0, 20) + "aA9!";
    const user = { id: "usr-" + Utilities.getUuid(), username: username, fullName: fullName, registration: registration, role: "employee", password: password, active: true, mustChange: true };
    createUserRow_(user);
    assignLegacyDataToUser_(registration, user.id);
    return { user: publicUser_(user), temporaryPassword: password };
  });
}

function resetUserPassword_(userId) {
  const user = readUsers_().find(u => u.id === String(userId || "") && u.role !== "admin");
  if (!user) throw apiError_("USER_NOT_FOUND", "Funcionário não encontrado.");
  const password = randomSecret_().slice(0, 20) + "aA9!";
  updateUserPassword_(user.id, password, true);
  return { userId: user.id, temporaryPassword: password };
}

function setUserActive_(userId, active) {
  return withWriteLock_(function() {
    const user = readUsers_().find(u => u.id === String(userId || "") && u.role !== "admin");
    if (!user) throw apiError_("USER_NOT_FOUND", "Funcionário não encontrado.");
    const sheet = getSheet_(CP.sheets.users);
    const row = findRowByKey_(sheet, 1, user.id);
    sheet.getRange(row, 8).setValue(active ? "SIM" : "NAO");
    if (!active) revokeUserSessions_(user.id);
    return { userId: user.id, active: active };
  });
}

function changePassword_(user, currentPassword, newPassword) {
  const next = String(newPassword || "");
  if (next.length < 10 || next.length > 100) throw apiError_("WEAK_PASSWORD", "A nova senha deve ter pelo menos 10 caracteres.");
  if (!constantTimeEquals_(passwordHash_(String(currentPassword || ""), user.salt), user.passwordHash)) {
    throw apiError_("INVALID_PASSWORD", "A senha atual está incorreta.");
  }
  updateUserPassword_(user.id, next, false, false);
  user.mustChange = false;
  return { changed: true, user: publicUser_(user) };
}

function updateUserPassword_(userId, password, mustChange, revokeSessions) {
  const salt = randomSecret_();
  const hash = passwordHash_(password, salt);
  const sheet = getSheet_(CP.sheets.users);
  const row = findRowByKey_(sheet, 1, userId);
  if (!row) throw apiError_("USER_NOT_FOUND", "Usuário não encontrado.");
  sheet.getRange(row, 6).setValue(salt);
  sheet.getRange(row, 7).setValue(hash);
  sheet.getRange(row, 9).setValue(mustChange ? "SIM" : "NAO");
  if (revokeSessions !== false) revokeUserSessions_(userId);
}

function assignLegacyDataToUser_(registration, userId) {
  const key = normalizeRegistration_(registration);
  const adminId = (readUsers_().find(u => u.role === "admin") || {}).id || "";
  [ [CP.sheets.records, 16], [CP.sheets.schedules, 4], [CP.sheets.shifts, 10] ].forEach(([name, col]) => {
    const sheet = getSheet_(name);
    if (sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, col).getValues();
    rows.forEach((row, index) => {
      try {
        const item = JSON.parse(String(row[col - 1] || "{}"));
        if (normalizeRegistration_(item.registration) === key && (!item.ownerId || item.ownerId === adminId)) {
          item.ownerId = userId;
          sheet.getRange(index + 2, col).setValue(JSON.stringify(item));
        }
      } catch (_) {}
    });
  });
}

function revokeUserSessions_(userId) {
  const sheet = getSheet_(CP.sheets.sessions);
  if (sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const now = new Date().toISOString();
  values.forEach((row, index) => {
    if (String(row[1]) === String(userId) && !row[4]) sheet.getRange(index + 2, 5).setValue(now);
  });
}

function createUserRow_(user) {
  const salt = randomSecret_();
  const hash = passwordHash_(user.password, salt);
  getSheet_(CP.sheets.users).appendRow([
    user.id, user.username, user.fullName, user.registration || "", user.role,
    salt, hash, user.active ? "SIM" : "NAO", user.mustChange ? "SIM" : "NAO", new Date().toISOString()
  ]);
}

function readUsers_() {
  const sheet = getSheet_(CP.sheets.users);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues().map(row => ({
    id: String(row[0] || ""), username: String(row[1] || ""), fullName: String(row[2] || ""),
    registration: normalizeRegistration_(row[3]), role: String(row[4] || "employee"),
    salt: String(row[5] || ""), passwordHash: String(row[6] || ""),
    active: String(row[7]).toUpperCase() === "SIM", mustChange: String(row[8]).toUpperCase() === "SIM",
    createdAt: String(row[9] || "")
  })).filter(u => u.id);
}

function listUsers_() {
  return readUsers_().filter(u => u.role !== "admin").map(publicUser_);
}

function publicUser_(user) {
  return { id: user.id, username: user.username, fullName: user.fullName, registration: user.registration, role: user.role, active: user.active, mustChange: user.mustChange };
}

function ping_(user) {
  getSpreadsheet_();
  return { connected: true, apiVersion: CP.version, role: user.role };
}

function getAll_(user) {
  const ss = getSpreadsheet_();
  const records = readJsonRows_(getSheet_(CP.sheets.records), 16).filter(item => canReadItem_(item, user));
  const schedules = {};
  readJsonRows_(getSheet_(CP.sheets.schedules), 4).filter(item => canReadItem_(item, user)).forEach(item => {
    const key = normalizeRegistration_(item.registration);
    if (key) schedules[key] = item.dailyTargetMinutes;
  });
  const shiftSchedules = {};
  readJsonRows_(getSheet_(CP.sheets.shifts), 10).filter(item => canReadItem_(item, user)).forEach(item => {
    const key = normalizeRegistration_(item.registration);
    if (key) shiftSchedules[key] = item;
  });
  return { records: records, schedules: schedules, shiftSchedules: shiftSchedules, fetchedAt: new Date().toISOString(), apiVersion: CP.version };
}

function canReadItem_(item, user) {
  return user.role === "admin" || String(item.ownerId || "") === user.id;
}

function saveRecord_(record, force, user) {
  validateRecord_(record);
  const normalized = Object.assign({}, record);
  if (user.role !== "admin") {
    normalized.registration = user.registration;
    normalized.fullName = user.fullName;
    normalized.ownerId = user.id;
  } else if (!normalized.ownerId) {
    normalized.ownerId = ownerForRegistration_(normalized.registration) || user.id;
  }
  return withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.records);
    const all = readJsonRows_(sheet, 16);
    const existing = all.find(item => String(item.id) === String(normalized.id));
    if (existing && user.role !== "admin" && String(existing.ownerId || "") !== user.id) throw apiError_("FORBIDDEN", "Você não pode alterar o lançamento de outra pessoa.");
    if (existing && user.role === "admin" && !record.ownerId) normalized.ownerId = existing.ownerId || user.id;
    const sameOwner = all.filter(item => String(item.ownerId || "") === String(normalized.ownerId));
    const duplicate = sameOwner.find(item => String(item.id) !== String(normalized.id) && recordSignature_(item) === recordSignature_(normalized));
    if (duplicate) throw apiError_("DUPLICATE_RECORD", "Este lançamento já existe no banco central.");
    const overlapping = sameOwner.find(item => String(item.id) !== String(normalized.id) && recordsOverlap_(item, normalized));
    if (overlapping && !force) throw apiError_("OVERLAPPING_RECORD", "Há uma jornada sobreposta no banco central para esta matrícula. Revise os horários antes de continuar.");
    const now = new Date().toISOString();
    normalized.id = String(normalized.id);
    normalized.createdAt = normalized.createdAt || (existing && existing.createdAt) || now;
    normalized.updatedAt = now;
    const row = recordToRow_(normalized);
    const rowNumber = findRowByKey_(sheet, 1, normalized.id);
    if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return { saved: true, id: normalized.id, updated: Boolean(existing) };
  });
}

function deleteRecord_(id, user) {
  const key = String(id || "").trim();
  if (!key) throw apiError_("INVALID_ID", "ID do lançamento não informado.");
  return withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.records);
    const row = findRowByKey_(sheet, 1, key);
    if (!row) return { deleted: false, notFound: true };
    const item = readJsonAtRow_(sheet, row, 16);
    if (user.role !== "admin" && String(item.ownerId || "") !== user.id) throw apiError_("FORBIDDEN", "Você não pode excluir o lançamento de outra pessoa.");
    sheet.deleteRow(row);
    return { deleted: true, id: key };
  });
}

function saveSchedule_(registration, dailyTargetMinutes, user) {
  const key = user.role === "admin" ? normalizeRegistration_(registration) : user.registration;
  const minutes = Number(dailyTargetMinutes);
  if (!key || !Number.isInteger(minutes) || minutes < 1 || minutes > 1439) throw apiError_("INVALID_SCHEDULE", "Matrícula ou jornada diária inválida.");
  const value = { registration: key, dailyTargetMinutes: minutes, ownerId: user.role === "admin" ? (ownerForRegistration_(key) || user.id) : user.id, updatedAt: new Date().toISOString() };
  withWriteLock_(function() { upsertRow_(getSheet_(CP.sheets.schedules), key, [safeSheetText_(key), minutes, value.updatedAt, JSON.stringify(value)]); });
  return { saved: true, registration: key };
}

function deleteSchedule_(registration, user) {
  const key = user.role === "admin" ? normalizeRegistration_(registration) : user.registration;
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  return withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.schedules);
    const row = findRowByKey_(sheet, 1, key);
    if (row) {
      const item = readJsonAtRow_(sheet, row, 4);
      if (user.role !== "admin" && String(item.ownerId || "") !== user.id) throw apiError_("FORBIDDEN", "Você não pode alterar a jornada de outra pessoa.");
      sheet.deleteRow(row);
    }
    return { deleted: Boolean(row), registration: key };
  });
}

function saveShiftPlan_(config, user) {
  if (!config || typeof config !== "object") throw apiError_("INVALID_SHIFT", "Configuração de escala inválida.");
  const key = user.role === "admin" ? normalizeRegistration_(config.registration) : user.registration;
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  const normalized = Object.assign({}, config, { registration: key, ownerId: user.role === "admin" ? (ownerForRegistration_(key) || user.id) : user.id, updatedAt: new Date().toISOString() });
  const row = [safeSheetText_(key), safeSheetText_(normalized.type || ""), safeSheetText_(normalized.anchorDate || ""), safeSheetText_(normalized.startTime || ""), Number(normalized.durationMinutes) || 0, Number(normalized.intervalMinutes) || 0, Number(normalized.workDays) || 0, Number(normalized.restDays) || 0, normalized.updatedAt, JSON.stringify(normalized)];
  withWriteLock_(function() { upsertRow_(getSheet_(CP.sheets.shifts), key, row); });
  return { saved: true, registration: key };
}

function deleteShiftPlan_(registration, user) {
  const key = user.role === "admin" ? normalizeRegistration_(registration) : user.registration;
  if (!key) throw apiError_("INVALID_REGISTRATION", "Matrícula não informada.");
  return withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.shifts);
    const row = findRowByKey_(sheet, 1, key);
    if (row) {
      const item = readJsonAtRow_(sheet, row, 10);
      if (user.role !== "admin" && String(item.ownerId || "") !== user.id) throw apiError_("FORBIDDEN", "Você não pode excluir a escala de outra pessoa.");
      sheet.deleteRow(row);
    }
    return { deleted: Boolean(row), registration: key };
  });
}

function importRecords_(items, admin) {
  if (!Array.isArray(items) || items.length > 100) throw apiError_("INVALID_IMPORT", "Importe no máximo 100 lançamentos por lote.");
  items.forEach(validateRecord_);
  return withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.records);
    const existing = readJsonRows_(sheet, 16);
    const ids = new Set(existing.map(item => String(item.id)));
    const signatures = new Set(existing.map(recordSignature_));
    const rows = [];
    let skipped = 0;
    items.forEach(item => {
      const id = String(item.id);
      const signature = recordSignature_(item);
      if (ids.has(id) || signatures.has(signature)) { skipped += 1; return; }
      const owner = ownerForRegistration_(item.registration) || admin.id;
      const normalized = Object.assign({}, item, { id: id, ownerId: owner, createdAt: item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
      ids.add(id); signatures.add(signature); rows.push(recordToRow_(normalized));
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return { imported: rows.length, skipped: skipped, received: items.length };
  });
}

function importSchedules_(source, admin) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw apiError_("INVALID_IMPORT", "As jornadas do backup são inválidas.");
  const entries = Object.entries(source);
  if (entries.length > 2000) throw apiError_("BATCH_TOO_LARGE", "Quantidade de jornadas acima do limite.");
  let saved = 0;
  withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.schedules);
    entries.forEach(([registration, minutes]) => {
      const key = normalizeRegistration_(registration), valueMinutes = Number(minutes);
      if (!key || !Number.isInteger(valueMinutes) || valueMinutes < 1 || valueMinutes > 1439) return;
      const value = { registration: key, dailyTargetMinutes: valueMinutes, ownerId: ownerForRegistration_(key) || admin.id, updatedAt: new Date().toISOString() };
      upsertRow_(sheet, key, [safeSheetText_(key), valueMinutes, value.updatedAt, JSON.stringify(value)]);
      saved += 1;
    });
  });
  return { saved: saved };
}

function importShiftPlans_(source, admin) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw apiError_("INVALID_IMPORT", "As escalas do backup são inválidas.");
  const entries = Object.entries(source);
  if (entries.length > 2000) throw apiError_("BATCH_TOO_LARGE", "Quantidade de escalas acima do limite.");
  let saved = 0;
  withWriteLock_(function() {
    const sheet = getSheet_(CP.sheets.shifts);
    entries.forEach(([registration, config]) => {
      const key = normalizeRegistration_(registration);
      if (!key || !config || typeof config !== "object") return;
      const value = Object.assign({}, config, { registration: key, ownerId: ownerForRegistration_(key) || admin.id, updatedAt: new Date().toISOString() });
      const row = [safeSheetText_(key), safeSheetText_(value.type || ""), safeSheetText_(value.anchorDate || ""), safeSheetText_(value.startTime || ""), Number(value.durationMinutes) || 0, Number(value.intervalMinutes) || 0, Number(value.workDays) || 0, Number(value.restDays) || 0, value.updatedAt, JSON.stringify(value)];
      upsertRow_(sheet, key, row); saved += 1;
    });
  });
  return { saved: saved };
}

function ownerForRegistration_(registration) {
  const key = normalizeRegistration_(registration);
  const user = readUsers_().find(u => u.role === "employee" && u.active && u.registration === key);
  return user ? user.id : "";
}

function requireAdmin_(user) {
  if (!user || user.role !== "admin") throw apiError_("FORBIDDEN", "Esta operação é exclusiva do administrador.");
}

function validateRecord_(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw apiError_("INVALID_RECORD", "Lançamento inválido.");
  if (!String(record.id || "").trim() || String(record.id).length > 100) throw apiError_("INVALID_RECORD", "Lançamento sem identificador válido.");
  if (!normalizeRegistration_(record.registration) || String(record.registration).length > 30) throw apiError_("INVALID_RECORD", "Lançamento sem matrícula válida.");
  if (!isValidIsoDate_(record.startDate)) throw apiError_("INVALID_RECORD", "Data inicial inválida.");
  if (String(record.fullName || "").length > 120) throw apiError_("INVALID_RECORD", "Nome do colaborador ultrapassa o limite permitido.");
  if (!["Plantão", "Viagem", "Intervalo", "Folga"].includes(String(record.serviceType || ""))) throw apiError_("INVALID_RECORD", "Tipo de serviço inválido.");
  if (["Plantão", "Viagem"].includes(record.serviceType)) {
    if (!isValidClock_(record.startTime) || !isValidIsoDate_(record.endDate) || !isValidClock_(record.endTime)) throw apiError_("INVALID_RECORD", "Datas ou horários inválidos.");
    if (dateTimeNumber_(record.endDate, record.endTime) <= dateTimeNumber_(record.startDate, record.startTime)) throw apiError_("INVALID_RECORD", "O término precisa ser posterior ao início.");
    if (record.serviceType === "Viagem" && (!String(record.vehicleOrder || "").trim() || !String(record.plate || "").trim() || !String(record.origin || "").trim() || !String(record.destination || "").trim())) throw apiError_("INVALID_RECORD", "Viagem exige ordem do veículo, placa, origem e destino.");
  }
}

function isValidIsoDate_(v) {
  const s = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function isValidClock_(v) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
function recordToRow_(r) {
  return [safeSheetText_(r.id),safeSheetText_(normalizeRegistration_(r.registration)),safeSheetText_(r.fullName || ""),safeSheetText_(r.startDate || ""),safeSheetText_(r.startTime || ""),safeSheetText_(r.interval || ""),safeSheetText_(r.endDate || ""),safeSheetText_(r.endTime || ""),safeSheetText_(r.vehicleOrder || ""),safeSheetText_(r.plate || ""),safeSheetText_(r.serviceType || ""),safeSheetText_(r.origin || ""),safeSheetText_(r.destination || ""),safeSheetText_(r.createdAt || ""),safeSheetText_(r.updatedAt || ""),JSON.stringify(r)];
}
function safeSheetText_(v) { const s = String(v === undefined || v === null ? "" : v); return /^[=+@-]/.test(s) ? "'" + s : s; }
function readJsonRows_(sheet, jsonColumn) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, jsonColumn).getValues().map(row => {
    try { return JSON.parse(String(row[jsonColumn - 1] || "{}")); } catch (_) { return null; }
  }).filter(item => item && typeof item === "object");
}
function readJsonAtRow_(sheet, row, jsonColumn) {
  try { return JSON.parse(String(sheet.getRange(row, jsonColumn).getValue() || "{}")); }
  catch (_) { return {}; }
}
function ensureDatabaseSheets_(ss) {
  Object.keys(CP.sheets).forEach(key => {
    const name = CP.sheets[key], headers = CP.headers[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1e314a").setFontColor("#ffffff");
      sheet.autoResizeColumns(1, headers.length);
    } else {
      const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
      if (actual.join("|") !== headers.join("|")) throw apiError_("SHEET_SCHEMA_MISMATCH", "Cabeçalho inesperado na aba " + name + ". Os dados existentes foram preservados.");
    }
  });
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > Object.keys(CP.sheets).length && defaultSheet.getLastRow() === 0) ss.deleteSheet(defaultSheet);
}
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CP.spreadsheetProperty);
  if (!id) throw apiError_("NOT_INITIALIZED", "Execute setupControleDePonto() no editor do Apps Script.");
  return SpreadsheetApp.openById(id);
}
function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_("SHEET_MISSING", "A aba " + name + " não foi encontrada. Execute setupControleDePonto().");
  return sheet;
}
function findRowByKey_(sheet, column, key) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  const index = values.findIndex(row => String(row[0]) === String(key));
  return index < 0 ? 0 : index + 2;
}
function upsertRow_(sheet, key, row) {
  const rowNumber = findRowByKey_(sheet, 1, key);
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}
function recordSignature_(r) {
  return [normalizeRegistration_(r.registration),r.serviceType || "",r.startDate || "",r.startTime || "",r.endDate || "",r.endTime || "",String(r.interval || ""),String(r.vehicleOrder || "").trim().toUpperCase(),String(r.plate || "").trim().toUpperCase(),String(r.origin || "").trim().toUpperCase(),String(r.destination || "").trim().toUpperCase()].join("|");
}
function recordsOverlap_(a,b) {
  if (!a || !b || normalizeRegistration_(a.registration) !== normalizeRegistration_(b.registration)) return false;
  if (!["Plantão","Viagem"].includes(a.serviceType) || !["Plantão","Viagem"].includes(b.serviceType)) return false;
  const as = dateTimeNumber_(a.startDate,a.startTime), ae = dateTimeNumber_(a.endDate,a.endTime), bs = dateTimeNumber_(b.startDate,b.startTime), be = dateTimeNumber_(b.endDate,b.endTime);
  return [as,ae,bs,be].every(Number.isFinite) && as < be && bs < ae;
}
function dateTimeNumber_(date,time) { const stamp = Date.parse(String(date || "") + "T" + String(time || "") + ":00-03:00"); return Number.isFinite(stamp) ? stamp : NaN; }
function normalizeRegistration_(v) { return String(v || "").trim().toUpperCase().replace(/\s+/g,""); }
function normalizeUsername_(v) { return String(v || "").trim().toLowerCase(); }
function withWriteLock_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { return fn(); } finally { lock.releaseLock(); } }
function enforceRateLimit_() {
  const cache = CacheService.getScriptCache(), key = "CP_PUBLIC_REQUESTS", n = Number(cache.get(key) || 0) + 1;
  if (n > 240) throw apiError_("RATE_LIMIT", "Muitas solicitações em sequência. Tente novamente em um minuto.");
  cache.put(key, String(n), 60);
}
function randomSecret_() { return Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,""); }
function digest_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function passwordHash_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty(CP.pepperProperty);
  if (!pepper) throw apiError_("NOT_INITIALIZED", "Execute setupControleDePonto() para inicializar o backend.");
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(password) + "|" + salt, pepper, Utilities.Charset.UTF_8));
}
function constantTimeEquals_(a,b) { a=String(a || ""); b=String(b || ""); if (a.length !== b.length) return false; let diff=0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0; }
function validateOrigin_(origin) {
  const configured = PropertiesService.getScriptProperties().getProperty(CP.originsProperty) || "https://fersahub.github.io";
  const allowed = configured.split(",").map(s=>s.trim()).filter(Boolean);
  if (allowed.indexOf(origin) < 0) throw apiError_("ORIGIN_NOT_ALLOWED", "Origem não autorizada.");
}
function bridgeResponse_(requestId,response,origin) {
  const message = safeJson_({channel:"CONTROLE_PONTO_SHEETS",requestId:String(requestId || ""),response:response});
  const html = "<!doctype html><html><head><meta charset='utf-8'></head><body><script>window.top.postMessage(" + message + "," + safeJson_(origin) + ");</script></body></html>";
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function safeJson_(v) { return JSON.stringify(v).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029"); }
function apiError_(code,message) { const e=new Error(message); e.code=code; return e; }
