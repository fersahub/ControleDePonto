"use strict";

(() => {
  const STORAGE_KEY = "controleDePonto.registros.v1";
  const SCHEDULES_KEY = "controleDePonto.jornadas.v1";
  const SHIFT_PLANS_KEY = "controleDePonto.escalas.v1";
  const CONTRACT_MINUTES = 7 * 60 + 20;
  const scheduleRegistrationInput = document.getElementById("scheduleRegistration");
  const schedulePreset = document.getElementById("schedulePreset");
  const customScheduleField = document.getElementById("customScheduleField");
  const customScheduleTime = document.getElementById("customScheduleTime");
  const scheduleFeedback = document.getElementById("scheduleFeedback");
  const schedules = loadSchedules();
  const shiftPlans = loadShiftPlans();
  const form = document.getElementById("timeForm");
  const routeFields = document.getElementById("routeFields");
  const serviceType = document.getElementById("serviceType");
  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");
  const intervalInput = document.getElementById("interval");
  const startDateInput = document.getElementById("startDate");
  const startTimeInput = document.getElementById("startTime");
  const endDateInput = document.getElementById("endDate");
  const endTimeInput = document.getElementById("endTime");
  const durationPreview = document.getElementById("durationPreview");
  const feedback = document.getElementById("formFeedback");
  const recordsBody = document.getElementById("recordsBody");
  const exportButton = document.getElementById("exportButton");
  const exportCsvButton = document.getElementById("exportCsvButton");
  const printButton = document.getElementById("printButton");
  const monthFilter = document.getElementById("monthFilter");
  const clearFilterButton = document.getElementById("clearFilterButton");
  const activityRegistrationSelect = document.getElementById("activityRegistration");
  const activityMonthInput = document.getElementById("activityMonth");
  const activityCalendarGrid = document.getElementById("activityCalendarGrid");
  let activitySelectedDate = "";

  let records = loadRecords();

  function loadRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    } catch (error) {
      console.warn("Não foi possível ler os registros locais.", error);
      return [];
    }
  }

  function loadSchedules() {
    try {
      const value = JSON.parse(localStorage.getItem(SCHEDULES_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) { console.warn("Falha ao ler jornadas.", error); return {}; }
  }
  function persistSchedules() {
    try { localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules)); return true; }
    catch (error) { scheduleFeedback.textContent = "Não foi possível salvar a jornada neste navegador."; return false; }
  }

  function loadShiftPlans() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHIFT_PLANS_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const valid = {};
      Object.entries(parsed).forEach(([registration, value]) => {
        const key = normalizeRegistration(registration);
        if (!key) return;
        try { valid[key] = ScheduleEngine.normalizeConfig(value, key); }
        catch (error) { console.warn("Escala local ignorada para " + key + ".", error); }
      });
      return valid;
    } catch (error) {
      console.warn("Não foi possível ler as escalas locais.", error);
      return {};
    }
  }

  function persistShiftPlans() {
    try {
      localStorage.setItem(SHIFT_PLANS_KEY, JSON.stringify(shiftPlans));
      return true;
    } catch (error) {
      document.getElementById("shiftScheduleFeedback").textContent = "Não foi possível salvar a escala neste navegador. Verifique o espaço disponível.";
      return false;
    }
  }

  function normalizeBackupShiftPlans(source) {
    if (source === undefined || source === null) return {};
    if (typeof source !== "object" || Array.isArray(source)) throw new Error("A lista de escalas do backup está inválida.");
    const normalized = {};
    Object.entries(source).forEach(([registration, value]) => {
      const key = normalizeRegistration(registration);
      if (!key) return;
      try { normalized[key] = ScheduleEngine.normalizeConfig(value, key); }
      catch (error) { throw new Error("A escala da matrícula " + key + " é inválida: " + error.message); }
    });
    return normalized;
  }

  function parseClockMinutes(value) {
    const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function applyShiftPlanToForm(config) {
    document.getElementById("shiftScheduleRegistration").value = config.registration;
    document.getElementById("shiftScheduleType").value = config.type;
    refreshShiftPlannerTypeFields();
    document.getElementById("shiftAnchorDate").value = config.anchorDate;
    document.getElementById("shiftStartTime").value = config.startTime;
    document.getElementById("shiftDuration").value = String(Math.floor(config.durationMinutes / 60)).padStart(2, "0") + ":" + String(config.durationMinutes % 60).padStart(2, "0");
    document.getElementById("shiftInterval").value = String(Math.floor(config.intervalMinutes / 60)).padStart(2, "0") + ":" + String(config.intervalMinutes % 60).padStart(2, "0");
    document.getElementById("shiftCustomWorkDays").value = config.workDays;
    document.getElementById("shiftCustomRestDays").value = config.restDays;
    renderShiftCalendar();
  }

  function refreshShiftPlannerTypeFields() {
    const type = document.getElementById("shiftScheduleType").value;
    const custom = type === "custom";
    document.getElementById("shiftCustomWorkField").classList.toggle("is-hidden", !custom);
    document.getElementById("shiftCustomRestField").classList.toggle("is-hidden", !custom);
    const duration = document.getElementById("shiftDuration");
    duration.disabled = type === "12x36";
    if (type === "12x36") duration.value = "12:00";
  }

  function readShiftPlanForm() {
    const registration = normalizeRegistration(document.getElementById("shiftScheduleRegistration").value);
    if (!registration) throw new Error("Informe a matrícula para visualizar ou salvar a escala.");
    const durationMinutes = parseClockMinutes(document.getElementById("shiftDuration").value);
    const intervalMinutes = parseClockMinutes(document.getElementById("shiftInterval").value);
    if (durationMinutes === null || intervalMinutes === null) throw new Error("Informe duração e intervalo no formato HH:MM.");
    return ScheduleEngine.normalizeConfig({
      registration,
      type: document.getElementById("shiftScheduleType").value,
      anchorDate: document.getElementById("shiftAnchorDate").value,
      startTime: document.getElementById("shiftStartTime").value,
      durationMinutes,
      intervalMinutes,
      workDays: Number(document.getElementById("shiftCustomWorkDays").value),
      restDays: Number(document.getElementById("shiftCustomRestDays").value)
    }, registration);
  }

  function renderShiftScheduleOptions() {
    const select = document.getElementById("savedShiftScheduleSelect");
    const previous = select.value;
    select.replaceChildren();
    const keys = Object.keys(shiftPlans).sort();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = keys.length ? "Selecione uma escala salva" : "Nenhuma escala salva";
    select.append(placeholder);
    keys.forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key + " · " + ScheduleEngine.typeLabel(shiftPlans[key].type);
      select.append(option);
    });
    if (keys.includes(previous)) select.value = previous;
    else if (keys.includes(normalizeRegistration(document.getElementById("shiftScheduleRegistration").value))) {
      select.value = normalizeRegistration(document.getElementById("shiftScheduleRegistration").value);
    }
  }

  function renderShiftCalendar() {
    const body = document.getElementById("shiftCalendarBody");
    if (!body) return;
    const registration = normalizeRegistration(document.getElementById("shiftScheduleRegistration").value);
    const empty = (message) => {
      body.replaceChildren();
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan = 4; cell.className = "shift-empty-cell"; cell.textContent = message;
      row.append(cell); body.append(row);
      ["plannedWorkDays", "plannedRestDays", "plannedRecordedDays", "plannedMissingDays"].forEach((id) => {
        document.getElementById(id).textContent = "0";
      });
      document.getElementById("shiftCalendarCaption").textContent = message;
    };
    if (!registration) {
      empty("Informe uma matrícula para visualizar a projeção.");
      document.getElementById("shiftCalendarTitle").textContent = "Projeção da escala";
      return;
    }
    try {
      const config = readShiftPlanForm();
      const startDate = document.getElementById("planCalendarStartDate").value;
      const horizon = Number(document.getElementById("planHorizon").value);
      const recordCounts = {};
      records.forEach((record) => {
        if (normalizeRegistration(record.registration) !== registration ||
            !TimeEngine.isValidDateString(record.startDate) ||
            !["Plantão", "Viagem"].includes(record.serviceType)) return;
        recordCounts[record.startDate] = (recordCounts[record.startDate] || 0) + 1;
      });
      const days = ScheduleEngine.buildForecast(config, startDate, horizon, recordCounts);
      body.replaceChildren();
      days.forEach((day) => {
        const row = document.createElement("tr");
        row.dataset.kind = day.kind;
        const dateCell = document.createElement("td");
        dateCell.className = "shift-calendar-date";
        const parts = day.date.split("-").map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        const dateLabel = document.createElement("span");
        dateLabel.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
        const yearLabel = document.createElement("small");
        yearLabel.textContent = String(parts[0]);
        dateCell.append(dateLabel, yearLabel);
        const planCell = document.createElement("td");
        planCell.textContent = day.detail;
        const recordsCell = document.createElement("td");
        recordsCell.textContent = day.recordCount ? day.recordCount + (day.recordCount === 1 ? " lançamento" : " lançamentos") : "—";
        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        status.className = "shift-status " + day.statusKey;
        status.textContent = day.status;
        statusCell.append(status);
        row.append(dateCell, planCell, recordsCell, statusCell);
        body.append(row);
      });
      const workDays = days.filter((day) => day.kind === "work").length;
      const restDays = days.filter((day) => day.kind === "rest").length;
      const recordedDays = days.filter((day) => day.kind === "work" && day.recordCount > 0).length;
      const missingDays = days.filter((day) => day.statusKey === "missing").length;
      document.getElementById("plannedWorkDays").textContent = String(workDays);
      document.getElementById("plannedRestDays").textContent = String(restDays);
      document.getElementById("plannedRecordedDays").textContent = String(recordedDays);
      document.getElementById("plannedMissingDays").textContent = String(missingDays);
      document.getElementById("shiftCalendarTitle").textContent = "Projeção · " + registration + " · " + ScheduleEngine.typeLabel(config.type);
      document.getElementById("shiftCalendarCaption").textContent =
        "Exibindo " + horizon + " dias a partir de " + formatDate(startDate) +
        (shiftPlans[registration] ? " · escala salva neste navegador" : " · prévia da configuração atual");
    } catch (error) {
      empty(error.message || "Não foi possível montar a projeção.");
    }
  }

  function saveShiftPlan() {
    const feedbackElement = document.getElementById("shiftScheduleFeedback");
    let config;
    try { config = readShiftPlanForm(); }
    catch (error) { feedbackElement.textContent = error.message; return; }
    const previous = shiftPlans[config.registration];
    shiftPlans[config.registration] = config;
    if (!persistShiftPlans()) {
      if (previous) shiftPlans[config.registration] = previous;
      else delete shiftPlans[config.registration];
      return;
    }
    renderShiftScheduleOptions();
    renderShiftCalendar();
    renderDashboardExtras();
    feedbackElement.textContent = "Escala " + ScheduleEngine.typeLabel(config.type) + " salva para a matrícula " + config.registration + ". Os lançamentos e o cálculo atual de horas extras não foram alterados.";
  }

  function deleteShiftPlan() {
    const feedbackElement = document.getElementById("shiftScheduleFeedback");
    const registration = normalizeRegistration(document.getElementById("shiftScheduleRegistration").value) ||
      document.getElementById("savedShiftScheduleSelect").value;
    if (!registration || !shiftPlans[registration]) {
      feedbackElement.textContent = "Selecione ou informe uma matrícula com escala salva.";
      return;
    }
    if (!window.confirm("Excluir a escala da matrícula " + registration + "? Os lançamentos existentes serão preservados.")) return;
    const previous = shiftPlans[registration];
    delete shiftPlans[registration];
    if (!persistShiftPlans()) { shiftPlans[registration] = previous; return; }
    if (normalizeRegistration(document.getElementById("shiftScheduleRegistration").value) === registration) {
      document.getElementById("shiftScheduleRegistration").value = "";
    }
    renderShiftScheduleOptions();
    renderShiftCalendar();
    renderDashboardExtras();
    feedbackElement.textContent = "Escala excluída. Os lançamentos e demais jornadas foram mantidos.";
  }


  function getDailyTargetMinutes(registration) {
    return TimeEngine.getDailyTargetMinutes(registration, schedules, CONTRACT_MINUTES);
  }

  function formatTarget(minutes) {
    return Math.floor(minutes / 60) + "h" + String(minutes % 60).padStart(2, "0");
  }
  function refreshScheduleForm() {
    const key = normalizeRegistration(scheduleRegistrationInput.value);
    const target = key ? getDailyTargetMinutes(key) : CONTRACT_MINUTES;
    schedulePreset.value = [240,360,440,480,720].includes(target) ? String(target) : "custom";
    customScheduleField.classList.toggle("is-hidden", schedulePreset.value !== "custom");
    customScheduleTime.value = String(Math.floor(target/60)).padStart(2,"0")+":"+String(target%60).padStart(2,"0");
    scheduleFeedback.textContent = key ? "Jornada atual: "+formatTarget(target)+" por dia"+(schedules[key] ? " (personalizada)." : " (padrão).") : "A jornada padrão é de 7h20 por dia. Informe uma matrícula para personalizar.";
  }


  function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    const backup = {
      application: "controle-de-ponto",
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      records,
      schedules,
      shiftSchedules: shiftPlans
    };
    downloadJsonFile("backup-controle-de-jornada-" + localDateString() + ".json", backup);
    showFeedback("Backup completo gerado. Guarde o arquivo em local seguro.", "success");
  }

  function normalizeBackupRecords(items) {
    const validTypes = ["Plantão", "Viagem", "Intervalo", "Folga"];
    const usedIds = new Set();
    const normalized = [];
    let rejected = 0;
    items.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { rejected += 1; return; }
      const registration = String(item.registration || "").trim();
      const startDate = String(item.startDate || "");
      const service = String(item.serviceType || "");
      const stringValue = (value) => typeof value === "string" ? value : "";
      const candidate = {
        id: String(item.id || ""),
        fullName: stringValue(item.fullName).trim(),
        registration,
        startDate,
        startTime: stringValue(item.startTime),
        interval: stringValue(item.interval),
        endDate: stringValue(item.endDate),
        endTime: stringValue(item.endTime),
        vehicleOrder: stringValue(item.vehicleOrder),
        plate: stringValue(item.plate).trim().toUpperCase(),
        serviceType: service,
        origin: stringValue(item.origin).trim(),
        destination: stringValue(item.destination).trim(),
        createdAt: stringValue(item.createdAt) || new Date().toISOString()
      };
      if (!TimeEngine.isValidDateString(startDate) || !validTypes.includes(service) || validateRecord(candidate)) {
        rejected += 1;
        return;
      }
      let id = candidate.id;
      if (!id || usedIds.has(id)) id = "restaurado-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      usedIds.add(id);
      candidate.id = id;
      normalized.push(candidate);
    });
    return { records: normalized, rejected };
  }

  async function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo ultrapassa o limite de 10 MB.");
      const backup = JSON.parse(await file.text());
      if (!backup || backup.application !== "controle-de-ponto" || ![1, 2].includes(backup.backupVersion) ||
          !Array.isArray(backup.records) || !backup.schedules || typeof backup.schedules !== "object" || Array.isArray(backup.schedules)) {
        throw new Error("Este arquivo não é um backup válido do ControleDePonto.");
      }
      const normalized = normalizeBackupRecords(backup.records);
      if (backup.records.length && !normalized.records.length) throw new Error("Nenhum lançamento válido foi encontrado no backup.");
      const restoredShiftPlans = normalizeBackupShiftPlans(backup.shiftSchedules || {});
      const restoredSchedules = {};
      Object.entries(backup.schedules).forEach(([registration, minutes]) => {
        const key = normalizeRegistration(registration);
        const value = Number(minutes);
        if (key && Number.isInteger(value) && value > 0 && value < 1440) restoredSchedules[key] = value;
      });
      if (!window.confirm("A restauração substituirá todos os lançamentos e jornadas salvos neste navegador. Recomenda-se baixar um backup atual antes de continuar. Deseja prosseguir?")) return;

      const previousRecords = localStorage.getItem(STORAGE_KEY);
      const previousSchedules = localStorage.getItem(SCHEDULES_KEY);
      const previousShiftPlans = localStorage.getItem(SHIFT_PLANS_KEY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.records));
        localStorage.setItem(SCHEDULES_KEY, JSON.stringify(restoredSchedules));
        localStorage.setItem(SHIFT_PLANS_KEY, JSON.stringify(restoredShiftPlans));
      } catch (storageError) {
        if (previousRecords === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, previousRecords);
        if (previousSchedules === null) localStorage.removeItem(SCHEDULES_KEY); else localStorage.setItem(SCHEDULES_KEY, previousSchedules);
        if (previousShiftPlans === null) localStorage.removeItem(SHIFT_PLANS_KEY); else localStorage.setItem(SHIFT_PLANS_KEY, previousShiftPlans);
        throw new Error("Não foi possível restaurar os dados neste navegador. " + storageError.message);
      }
      records = normalized.records;
      Object.keys(schedules).forEach((key) => delete schedules[key]);
      Object.assign(schedules, restoredSchedules);
      Object.keys(shiftPlans).forEach((key) => delete shiftPlans[key]);
      Object.assign(shiftPlans, restoredShiftPlans);
      renderShiftScheduleOptions();
      renderRecords();
      updateDurationPreview();
      refreshScheduleForm();
      individualReportOutput.classList.add("is-hidden");
      showFeedback("Backup restaurado: " + records.length + " lançamento(s), " + Object.keys(schedules).length + " jornada(s) e " + Object.keys(shiftPlans).length + " escala(s)." +
        (normalized.rejected ? " " + normalized.rejected + " registro(s) inválido(s) foram ignorados." : ""), "success");
    } catch (error) {
      showFeedback(error.message || "Não foi possível ler o arquivo de backup.", "error");
    } finally {
      event.target.value = "";
    }
  }

  function persistRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      showFeedback("Não foi possível salvar neste navegador. Verifique o espaço disponível ou as permissões de armazenamento.", "error");
      console.error(error);
      return false;
    }
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseLocalDateTime(dateValue, timeValue) {
    return TimeEngine.parseLocalDateTime(dateValue, timeValue);
  }

  function dateObject(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }

  function formatDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
    const parts = value.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function monthKey(dateValue) {
    return dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue.slice(0, 7) : "";
  }

  function formatMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value)) return "Todos os meses";
    const parts = value.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1, 12);
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  }

  function formatMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "—";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours + "h " + String(minutes).padStart(2, "0") + "min";
  }

  function parseIntervalMinutes(value) {
    return TimeEngine.parseIntervalMinutes(value);
  }

  function getWorkMetrics(record) {
    return TimeEngine.getWorkMetrics(record, CONTRACT_MINUTES);
  }

  function calculateDailyMetrics(sourceRecords) {
    return TimeEngine.calculateDailyMetrics(sourceRecords, getDailyTargetMinutes);
  }

  function formatLongDate(date) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = "feedback is-visible is-" + type;
  }

  function clearFeedback() {
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function toggleRouteFields() {
    const type = serviceType.value;
    const isTrip = type === "Viagem";
    const isFolga = type === "Folga";
    const workOnly = type === "Plantão" || type === "Viagem";
    const timed = !isFolga;
    const startTimeField = document.getElementById("startTimeField");
    const endDateField = document.getElementById("endDateField");
    const endTimeField = document.getElementById("endTimeField");
    const intervalField = document.getElementById("intervalField");
    startTimeField.classList.toggle("is-hidden", !timed);
    endDateField.classList.toggle("is-hidden", !timed);
    endTimeField.classList.toggle("is-hidden", !timed);
    intervalField.classList.toggle("is-hidden", !workOnly);
    startTimeInput.disabled = !timed;
    endDateInput.disabled = !timed;
    endTimeInput.disabled = !timed;
    intervalInput.disabled = !workOnly;
    startTimeInput.required = timed;
    endDateInput.required = timed;
    endTimeInput.required = timed;
    if (!timed) { startTimeInput.value = ""; endDateInput.value = ""; endTimeInput.value = ""; }
    if (!workOnly) intervalInput.value = "";
    const vehicleOrderField = document.getElementById("vehicleOrderField");
    const plateField = document.getElementById("plateField");
    const vehicleOrderInput = document.getElementById("vehicleOrder");
    const plateInput = document.getElementById("plate");

    routeFields.classList.toggle("is-hidden", !isTrip);
    routeFields.setAttribute("aria-hidden", String(!isTrip));
    originInput.disabled = !isTrip;
    destinationInput.disabled = !isTrip;
    originInput.required = isTrip;
    destinationInput.required = isTrip;

    vehicleOrderField.classList.toggle("is-hidden", !isTrip);
    plateField.classList.toggle("is-hidden", !isTrip);
    vehicleOrderInput.disabled = !isTrip;
    plateInput.disabled = !isTrip;
    vehicleOrderInput.required = isTrip;
    plateInput.required = isTrip;

    if (!isTrip) {
      originInput.value = "";
      destinationInput.value = "";
      vehicleOrderInput.value = "";
      plateInput.value = "";
    }
  }

  function updateDurationPreview() {
    if (serviceType.value === "Folga") {
      durationPreview.classList.add("is-ready");
      durationPreview.textContent = startDateInput.value ? "Folga em " + formatDate(startDateInput.value) + ". Nenhuma hora será contabilizada." : "Selecione a data da folga.";
      return;
    }
    if (serviceType.value === "Intervalo") {
      const a = parseLocalDateTime(startDateInput.value, startTimeInput.value);
      const b = parseLocalDateTime(endDateInput.value, endTimeInput.value);
      if (!a || !b || b <= a) { durationPreview.classList.remove("is-ready"); durationPreview.textContent = "Informe início e término do intervalo. Ele não será contabilizado como jornada."; }
      else { durationPreview.classList.add("is-ready"); durationPreview.textContent = "Intervalo de " + formatMinutes(Math.floor((b-a)/60000)) + ". Não gera horas trabalhadas ou extras."; }
      return;
    }
    const start = parseLocalDateTime(startDateInput.value, startTimeInput.value);
    const end = parseLocalDateTime(endDateInput.value, endTimeInput.value);
    if (!start || !end) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = "Preencha as datas e os horários para visualizar a jornada e as horas extras.";
      return;
    }
    if (end <= start) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = "A data e o horário finais precisam ser posteriores ao início.";
      return;
    }

    const previewRecord = {
      registration: document.getElementById("registration").value,
      startDate: startDateInput.value, startTime: startTimeInput.value,
      endDate: endDateInput.value, endTime: endTimeInput.value, interval: intervalInput.value
    };
    const metrics = calculateDailyMetrics([...records, previewRecord]).get(previewRecord);
    if (metrics.error) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = metrics.error;
      return;
    }

    durationPreview.classList.add("is-ready");
    const target = getDailyTargetMinutes(previewRecord.registration);
    durationPreview.textContent = "Jornada líquida: " + formatMinutes(metrics.workedMinutes) +
      " · Horas extras: " + formatMinutes(metrics.overtimeMinutes) + " (meta diária " + formatTarget(target) + ").";
  }

  function getFormData() {
    const data = new FormData(form);
    return {
      id: (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : "registro-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      fullName: String(data.get("fullName") || "").trim(),
      registration: String(data.get("registration") || "").trim(),
      startDate: String(data.get("startDate") || ""),
      startTime: serviceType.value === "Folga" ? "" : String(data.get("startTime") || ""),
      interval: String(data.get("interval") || "").trim(),
      endDate: serviceType.value === "Folga" ? "" : String(data.get("endDate") || ""),
      endTime: serviceType.value === "Folga" ? "" : String(data.get("endTime") || ""),
      vehicleOrder: serviceType.value === "Viagem" ? String(data.get("vehicleOrder") || "").trim() : "",
      plate: serviceType.value === "Viagem" ? String(data.get("plate") || "").trim().toUpperCase() : "",
      serviceType: String(data.get("serviceType") || ""),
      origin: serviceType.value === "Viagem" ? String(data.get("origin") || "").trim() : "",
      destination: serviceType.value === "Viagem" ? String(data.get("destination") || "").trim() : "",
      createdAt: new Date().toISOString()
    };
  }

  function validateRecord(record) {
    const requiredFields = [["Nome completo", record.fullName], ["Matrícula", record.registration], ["Data", record.startDate], ["Tipo de serviço", record.serviceType]];
    if (record.serviceType !== "Folga") requiredFields.push(["Horário inicial", record.startTime], ["Data final", record.endDate], ["Horário final", record.endTime]);
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) return "Preencha o campo obrigatório: " + missing[0] + ".";
    if (!TimeEngine.isValidDateString(record.startDate)) return "Informe uma data inicial válida.";
    if (!["Plantão", "Viagem", "Intervalo", "Folga"].includes(record.serviceType)) return "Selecione um tipo de serviço válido.";
    if (record.serviceType === "Folga") return "";
    if (record.serviceType === "Intervalo") {
      const a = parseLocalDateTime(record.startDate, record.startTime), b = parseLocalDateTime(record.endDate, record.endTime);
      return (!a || !b || b <= a) ? "O término do intervalo deve ser posterior ao início." : "";
    }
    if (record.serviceType === "Viagem") {
      if (!record.vehicleOrder) return "Informe o nº de ordem do veículo para a viagem.";
      if (!record.plate) return "Informe a placa do veículo para a viagem.";
      if (!record.origin || !record.destination) return "Informe a origem e o destino da viagem.";
    }
    const metrics = getWorkMetrics(record);
    if (metrics.error) return metrics.error;
    return "";
  }

  function normalizeRegistration(value) {
    return TimeEngine.normalizeRegistration(value);
  }

  function getRecordPeriod(record) {
    if (record.serviceType === "Folga" || record.serviceType === "Intervalo") return null;
    const start = parseLocalDateTime(record.startDate, record.startTime);
    const end = parseLocalDateTime(record.endDate, record.endTime);
    if (!start || !end || end <= start) return null;
    return { start: start.getTime(), end: end.getTime() };
  }

  function findRecordConflicts(record) {
    const registration = normalizeRegistration(record.registration);
    const period = getRecordPeriod(record);
    const duplicates = [];
    const overlaps = [];

    if (!registration || !period) return { duplicates, overlaps };

    records.forEach((existing) => {
      if (normalizeRegistration(existing.registration) !== registration) return;

      const existingPeriod = getRecordPeriod(existing);
      if (!existingPeriod) return;

      const isSamePeriod = period.start === existingPeriod.start && period.end === existingPeriod.end;
      if (isSamePeriod) {
        duplicates.push(existing);
        return;
      }

      const hasOverlap = period.start < existingPeriod.end && period.end > existingPeriod.start;
      if (hasOverlap) overlaps.push(existing);
    });

    return { duplicates, overlaps };
  }

  function formatConflictEntries(conflictingRecords) {
    const lines = conflictingRecords.slice(0, 3).map((record) =>
      "• " + formatDate(record.startDate) + " " + (record.startTime || "—") +
      " até " + formatDate(record.endDate) + " " + (record.endTime || "—") +
      (record.serviceType ? " · " + record.serviceType : "")
    );

    if (conflictingRecords.length > 3) {
      lines.push("e mais " + (conflictingRecords.length - 3) + " registro(s).");
    }

    return lines.join("\n");
  }

  function confirmRecordConflicts(record) {
    const conflicts = findRecordConflicts(record);
    const sections = [];

    if (conflicts.duplicates.length) {
      sections.push(
        "POSSÍVEL LANÇAMENTO DUPLICADO\n" +
        "Já existe registro(s) para esta matrícula com o mesmo início e término:\n" +
        formatConflictEntries(conflicts.duplicates)
      );
    }

    if (conflicts.overlaps.length) {
      sections.push(
        "POSSÍVEL SOBREPOSIÇÃO DE JORNADA\n" +
        "O período informado se cruza com outro(s) lançamento(s) desta matrícula:\n" +
        formatConflictEntries(conflicts.overlaps)
      );
    }

    if (!sections.length) return true;

    sections.push("Deseja salvar mesmo assim? A gravação só será feita com sua confirmação.");
    return window.confirm(sections.join("\n\n"));
  }

  function createCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function createStackCell(primary, secondary, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    const strong = document.createElement("strong");
    strong.textContent = primary;
    const small = document.createElement("small");
    small.textContent = secondary;
    cell.append(strong, small);
    return cell;
  }

  function getVisibleRecords() {
    const selectedMonth = monthFilter.value;
    const sorted = [...records].sort((a, b) => {
      const left = (a.startDate || "") + " " + (a.startTime || "");
      const right = (b.startDate || "") + " " + (b.startTime || "");
      return right.localeCompare(left);
    });
    return selectedMonth ? sorted.filter((record) => monthKey(record.startDate) === selectedMonth) : sorted;
  }


  function updateActivityRegistrationOptions() {
    const previous = activityRegistrationSelect.value || "all";
    const directory = new Map();
    records.forEach((record) => {
      const registration = normalizeRegistration(record.registration);
      if (!registration) return;
      const existing = directory.get(registration);
      if (!existing || (!existing.fullName && record.fullName)) directory.set(registration, { registration, fullName: String(record.fullName || "").trim() });
    });
    Object.keys(shiftPlans).forEach((registration) => {
      if (!directory.has(registration)) directory.set(registration, { registration, fullName: "" });
    });
    activityRegistrationSelect.replaceChildren();
    const all = document.createElement("option");
    all.value = "all"; all.textContent = "Todas as matrículas"; activityRegistrationSelect.append(all);
    [...directory.values()].sort((a,b)=>(a.fullName||a.registration).localeCompare(b.fullName||b.registration,"pt-BR")).forEach((employee) => {
      const option = document.createElement("option");
      option.value = employee.registration;
      option.textContent = employee.fullName ? employee.fullName + " · " + employee.registration : "Matrícula " + employee.registration;
      activityRegistrationSelect.append(option);
    });
    activityRegistrationSelect.value = directory.has(previous) ? previous : "all";
  }

  function activityMonthInfo() {
    const value = activityMonthInput.value || localDateString().slice(0,7);
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new Error("Selecione uma competência válida.");
    const year = Number(match[1]), month = Number(match[2]);
    const first = new Date(year, month-1, 1, 12);
    return { value, year, month, first, days: new Date(year,month,0).getDate(), leading: first.getDay(), startDate: value + "-01" };
  }

  function activityDateRecords(date, registration) {
    return records.filter((record)=>record.startDate===date&&(registration==="all"||normalizeRegistration(record.registration)===registration));
  }

  function appendActivityNode(parent, tag, className, text) {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(text!==undefined) node.textContent=text;
    parent.append(node);
    return node;
  }

  function renderDashboardSummary(dailyMetrics, monthInfo, registration) {
    const monthRecords=records.filter((record)=>monthKey(record.startDate)===monthInfo.value&&(registration==="all"||normalizeRegistration(record.registration)===registration));
    let workedTotal=0,overtimeTotal=0;
    const activeDays=new Set();
    monthRecords.forEach((record)=>{
      const metrics=dailyMetrics.get(record)||getWorkMetrics(record);
      if(metrics.error) return;
      workedTotal+=metrics.workedMinutes;
      overtimeTotal+=metrics.overtimeMinutes;
      if(metrics.workedMinutes>0) activeDays.add(record.startDate);
    });
    document.getElementById("dashboardMonthLabel").textContent=formatMonth(monthInfo.value);
    document.getElementById("dashboardWorkedTotal").textContent=formatMinutes(workedTotal);
    document.getElementById("dashboardDailyAverage").textContent=activeDays.size?formatMinutes(Math.round(workedTotal/activeDays.size)):"—";
    document.getElementById("dashboardActiveDays").textContent=String(activeDays.size);
    const insight=document.getElementById("dashboardInsight");
    if(!monthRecords.length) insight.textContent="Ainda não há lançamentos nesta competência. Assim que você registrar suas jornadas, o resumo será atualizado.";
    else if(!activeDays.size) insight.textContent="Há lançamentos neste período, mas nenhum deles representa horas de trabalho contabilizadas.";
    else if(overtimeTotal>0){
      const extraRecords=monthRecords.filter((record)=>{const metrics=dailyMetrics.get(record);return metrics&&!metrics.error&&metrics.overtimeMinutes>0;}).length;
      insight.textContent="Foram acumuladas "+formatMinutes(overtimeTotal)+" de horas extras em "+extraRecords+" lançamento(s) com excedente.";
    } else insight.textContent="Você registrou "+formatMinutes(workedTotal)+" em "+activeDays.size+(activeDays.size===1?" dia ativo.":" dias ativos.")+" Nenhum excedente foi apurado até agora.";

    const bars=document.getElementById("dashboardWeekBars");
    bars.replaceChildren();
    const today=new Date(), maxMinutes=720;
    for(let offset=6;offset>=0;offset-=1){
      const date=new Date(today.getFullYear(),today.getMonth(),today.getDate()-offset,12);
      const key=localDateString(date);
      let regular=0,overtime=0,worked=0;
      records.filter((record)=>record.startDate===key&&(registration==="all"||normalizeRegistration(record.registration)===registration)).forEach((record)=>{
        const metrics=dailyMetrics.get(record)||getWorkMetrics(record);
        if(metrics.error)return;
        regular+=metrics.regularMinutes;overtime+=metrics.overtimeMinutes;worked+=metrics.workedMinutes;
      });
      const row=appendActivityNode(bars,"div","dashboard-week-row");
      const dateLabel=appendActivityNode(row,"span","dashboard-week-date",new Intl.DateTimeFormat("pt-BR",{weekday:"short"}).format(date).replace(".",""));
      dateLabel.title=formatDate(key);
      const track=appendActivityNode(row,"div","dashboard-week-track");
      const regularBar=appendActivityNode(track,"span","dashboard-week-regular");
      const extraBar=appendActivityNode(track,"span","dashboard-week-extra");
      const regularPercent=Math.min(100,regular/maxMinutes*100);
      regularBar.style.width=regularPercent+"%";
      extraBar.style.width=Math.min(100-regularPercent,overtime/maxMinutes*100)+"%";
      track.setAttribute("aria-label",formatDate(key)+": "+formatMinutes(worked)+" trabalhadas, "+formatMinutes(overtime)+" extras");
      appendActivityNode(row,"strong","dashboard-week-value",worked?formatMinutes(worked).replace("min",""):"—");
    }
    document.getElementById("dashboardWeekCaption").textContent="Horas líquidas por dia · azul representa horas normais e verde representa excedentes.";
  }

  function renderActivityTimeline(date, registration, dailyMetrics, forecastDay) {
    const dayRecords=activityDateRecords(date,registration).sort((a,b)=>String(a.startTime||"").localeCompare(String(b.startTime||"")));
    const titleDate=dateObject(date);
    document.getElementById("activitySelectedDateLabel").textContent=titleDate?formatLongDate(titleDate):formatDate(date);
    let worked=0,overtime=0;
    dayRecords.forEach((record)=>{
      const metrics=dailyMetrics.get(record)||getWorkMetrics(record);
      if(metrics.error)return;
      worked+=metrics.workedMinutes;overtime+=metrics.overtimeMinutes;
    });
    document.getElementById("activityDayWorked").textContent=formatMinutes(worked);
    document.getElementById("activityDayOvertime").textContent=formatMinutes(overtime);
    document.getElementById("activityDayRecords").textContent=String(dayRecords.length);
    const timeline=document.getElementById("activityTimeline");
    timeline.replaceChildren();
    if(!dayRecords.length){
      appendActivityNode(timeline,"div","activity-empty","Nenhum lançamento cadastrado para esta data.");
      if(forecastDay&&forecastDay.kind==="work") appendActivityNode(timeline,"p","activity-neutral-note","Há um turno de trabalho planejado para este dia, mas não existe lançamento associado. Isso, por si só, não caracteriza falta.");
      else if(forecastDay&&forecastDay.kind==="rest") appendActivityNode(timeline,"p","activity-neutral-note","Esta data está marcada como descanso na escala selecionada.");
      return;
    }
    dayRecords.forEach((record)=>{
      const entry=appendActivityNode(timeline,"article","activity-timeline-entry");
      const time=record.serviceType==="Folga"?"—":(record.startTime||"—")+(record.endTime?" – "+record.endTime:"");
      appendActivityNode(entry,"div","activity-event-time",time);
      appendActivityNode(entry,"span","activity-event-marker","");
      const content=appendActivityNode(entry,"div","activity-event-content");
      const heading=appendActivityNode(content,"div","activity-event-heading");
      const serviceClass=({"Plantão":"plantao","Viagem":"viagem","Intervalo":"intervalo","Folga":"folga"})[record.serviceType]||"";
      appendActivityNode(heading,"span","activity-service-pill "+serviceClass,record.serviceType||"Serviço");
      if(registration==="all") appendActivityNode(heading,"strong","activity-event-person",record.fullName||"Colaborador");
      let detail="";
      if(record.serviceType==="Folga") detail="Dia de folga registrado · nenhuma hora contabilizada.";
      else if(record.serviceType==="Intervalo") detail="Intervalo informado · não contabilizado como trabalho.";
      else {
        const metrics=dailyMetrics.get(record)||getWorkMetrics(record);
        detail=metrics.error?"Não foi possível calcular este lançamento.":"Trabalhado "+formatMinutes(metrics.workedMinutes)+" · Extras "+formatMinutes(metrics.overtimeMinutes);
        if(record.interval)detail+=" · Intervalo: "+record.interval;
        if(record.endDate&&record.endDate!==record.startDate)detail+=" · término em "+formatDate(record.endDate);
      }
      if(record.serviceType==="Viagem"){
        detail+=" · "+(record.origin||"Origem não informada")+" → "+(record.destination||"Destino não informado");
        if(record.vehicleOrder||record.plate)detail+=" · "+[record.vehicleOrder,record.plate].filter(Boolean).join(" / ");
      }
      appendActivityNode(content,"p","activity-event-detail",registration==="all"?"Matrícula "+(record.registration||"—")+" · "+detail:detail);
    });
  }

  function renderActivityCalendar(dailyMetrics,monthInfo,registration) {
    const grid=activityCalendarGrid;
    grid.replaceChildren();
    document.getElementById("activityCalendarMonthLabel").textContent=formatMonth(monthInfo.value);
    if(!activitySelectedDate||monthKey(activitySelectedDate)!==monthInfo.value)activitySelectedDate=monthInfo.value+"-01";
    const forecastByDate=new Map();
    let activePlan=null,forecastError="";
    if(registration!=="all"&&shiftPlans[registration]){
      activePlan=shiftPlans[registration];
      try{
        const counts={};
        records.forEach((record)=>{
          if(normalizeRegistration(record.registration)!==registration||!["Plantão","Viagem"].includes(record.serviceType))return;
          counts[record.startDate]=(counts[record.startDate]||0)+1;
        });
        ScheduleEngine.buildForecast(activePlan,monthInfo.startDate,monthInfo.days,counts).forEach((day)=>forecastByDate.set(day.date,day));
      }catch(error){forecastError=error.message||"Não foi possível carregar a escala.";}
    }
    for(let i=0;i<monthInfo.leading;i+=1)appendActivityNode(grid,"span","activity-calendar-blank");
    for(let dayNumber=1;dayNumber<=monthInfo.days;dayNumber+=1){
      const date=monthInfo.value+"-"+String(dayNumber).padStart(2,"0");
      const dayRecords=activityDateRecords(date,registration);
      const forecastDay=forecastByDate.get(date);
      const today=date===localDateString();
      let statusLabel="",statusClass="";
      if(dayRecords.length){statusLabel=dayRecords.length+(dayRecords.length===1?" registro":" registros");statusClass="activity-day--recorded";}
      else if(forecastDay){
        if(forecastDay.kind==="rest"){statusLabel="Descanso";statusClass="activity-day--rest";}
        else if(forecastDay.kind==="continuation"){statusLabel="Continuação";statusClass="activity-day--continuation";}
        else if(forecastDay.kind==="work"){statusLabel=forecastDay.statusKey==="missing"?"Sem lançamento":forecastDay.statusKey==="today"?"Hoje · previsto":"Previsto";statusClass=forecastDay.statusKey==="missing"?"activity-day--missing":"activity-day--planned";}
        else{statusLabel="Não iniciado";statusClass="activity-day--neutral";}
      } else {statusLabel=today?"Hoje":"";statusClass="activity-day--neutral";}
      const button=appendActivityNode(grid,"button","activity-day "+statusClass+(date===activitySelectedDate?" is-selected":"")+(today?" is-today":""));
      button.type="button";button.dataset.date=date;button.setAttribute("role","gridcell");
      button.setAttribute("aria-pressed",String(date===activitySelectedDate));
      button.setAttribute("aria-label",formatDate(date)+(statusLabel?" · "+statusLabel:""));
      appendActivityNode(button,"span","activity-day-number",String(dayNumber));
      appendActivityNode(button,"small","activity-day-status",statusLabel||" ");
    }
    while(grid.children.length%7!==0)appendActivityNode(grid,"span","activity-calendar-blank");
    const note=document.getElementById("activityCalendarNote");
    if(forecastError)note.textContent="Não foi possível montar a escala: "+forecastError;
    else if(activePlan)note.textContent="Escala "+ScheduleEngine.typeLabel(activePlan.type)+" da matrícula "+registration+" integrada ao calendário. “Sem lançamento” é apenas uma indicação de registro ausente, não uma confirmação de falta.";
    else if(registration==="all")note.textContent="Visão consolidada dos registros. Selecione uma matrícula com escala salva para visualizar os dias de trabalho e descanso planejados.";
    else note.textContent="Não há escala salva para esta matrícula. O calendário mostra apenas os lançamentos existentes; dias vazios não indicam falta.";
    renderActivityTimeline(activitySelectedDate,registration,dailyMetrics,forecastByDate.get(activitySelectedDate));
  }

  function renderDashboardExtras(sourceMetrics) {
    if(!activityCalendarGrid||!activityMonthInput)return;
    updateActivityRegistrationOptions();
    if(!activityMonthInput.value)activityMonthInput.value=localDateString().slice(0,7);
    let monthInfo;
    try{monthInfo=activityMonthInfo();}catch(error){return;}
    const registration=activityRegistrationSelect.value||"all";
    const dailyMetrics=sourceMetrics||calculateDailyMetrics(records);
    renderDashboardSummary(dailyMetrics,monthInfo,registration);
    renderActivityCalendar(dailyMetrics,monthInfo,registration);
  }

  function shiftActivityMonth(offset) {
    const info=activityMonthInfo();
    const next=new Date(info.year,info.month-1+offset,1,12);
    activityMonthInput.value=localDateString(next).slice(0,7);
    activitySelectedDate=activityMonthInput.value+"-01";
    renderDashboardExtras();
  }

  function updateMonthFilterOptions() {
    const selected = monthFilter.value;
    const months = [...new Set(records.map((record) => monthKey(record.startDate)).filter(Boolean))].sort().reverse();
    monthFilter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Todos os meses";
    monthFilter.append(allOption);

    months.forEach((month) => {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = formatMonth(month);
      monthFilter.append(option);
    });

    monthFilter.value = months.includes(selected) ? selected : "";
  }

  function renderRecords() {
    updateMonthFilterOptions();
    updateIndividualMonthOptions();
    const visibleRecords = getVisibleRecords();
    const dailyMetrics = calculateDailyMetrics(records);
    recordsBody.replaceChildren();

    if (visibleRecords.length === 0) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 7;
      const state = document.createElement("div");
      state.className = "empty-state";
      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "▤";
      const title = document.createElement("strong");
      title.textContent = monthFilter.value ? "Nenhum lançamento neste mês" : "Nenhum lançamento por enquanto";
      const description = document.createElement("small");
      description.textContent = monthFilter.value
        ? "Selecione outro mês ou limpe o filtro para consultar os demais registros."
        : "Os registros adicionados no formulário aparecerão aqui.";
      state.append(icon, title, description);
      cell.append(state);
      row.append(cell);
      recordsBody.append(row);
    } else {
      visibleRecords.forEach((record) => {
        const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
        const row = document.createElement("tr");

        row.append(createStackCell(record.fullName || "—", "Matrícula: " + (record.registration || "—"), "person-cell"));

        const intervalLabel = metrics.error ? (record.interval || "não informado") : formatMinutes(metrics.intervalMinutes);
        const periodLabel = record.serviceType === "Folga" ? "Folga · Dia sem jornada" : (record.startTime || "—") + " → " + formatDate(record.endDate) + " " + (record.endTime || "") + (record.serviceType === "Intervalo" ? " · Não contabilizado" : " · Intervalo descontado: " + intervalLabel);
        row.append(createStackCell(formatDate(record.startDate), periodLabel, "date-cell"));

        const serviceCell = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = "service-pill " + ({ "Plantão": "plantao", "Folga": "folga", "Intervalo": "intervalo", "Viagem": "viagem" }[record.serviceType] || "");
        pill.textContent = record.serviceType || "—";
        serviceCell.append(pill);
        if (record.serviceType === "Viagem") {
          const route = document.createElement("small");
          route.textContent = (record.origin || "—") + " → " + (record.destination || "—");
          route.style.display = "block";
          route.style.marginTop = "4px";
          route.style.color = "#98a3b0";
          route.style.fontSize = "9px";
          serviceCell.append(route);
        }
        row.append(serviceCell);
        row.append(createStackCell(record.vehicleOrder || "—", record.plate || "—", "vehicle-cell"));

        row.append(createCell(metrics.error ? "—" : formatMinutes(metrics.workedMinutes), "duration-cell"));
        const overtimeCell = createCell(metrics.error ? "—" : formatMinutes(metrics.overtimeMinutes), "overtime-cell");
        if (!metrics.error && metrics.overtimeMinutes > 0) overtimeCell.classList.add("has-overtime");
        row.append(overtimeCell);

        const actionCell = document.createElement("td");
        actionCell.className = "action-cell";
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "delete-button";
        removeButton.dataset.deleteId = record.id;
        removeButton.textContent = "Excluir";
        removeButton.setAttribute("aria-label", "Excluir lançamento de " + (record.fullName || "colaborador"));
        actionCell.append(removeButton);
        row.append(actionCell);

        recordsBody.append(row);
      });
    }

    const today = localDateString();
    const overtimeTotal = visibleRecords.reduce((sum, record) => {
      const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
      return sum + (metrics.error ? 0 : metrics.overtimeMinutes);
    }, 0);
    document.getElementById("totalRecords").textContent = String(visibleRecords.length);
    document.getElementById("totalOvertime").textContent = formatMinutes(overtimeTotal);
    document.getElementById("todayRecords").textContent = String(visibleRecords.filter((item) => item.startDate === today).length);
    document.getElementById("vehicleCount").textContent = String(new Set(visibleRecords.map((item) => item.startDate).filter(Boolean)).size);
    document.getElementById("recordCount").textContent = visibleRecords.length + " " + (visibleRecords.length === 1 ? "registro" : "registros");

    const periodLabel = monthFilter.value ? formatMonth(monthFilter.value) : "Todos os meses";
    document.getElementById("printReportTitle").textContent =
      "Relatório de controle de ponto · " + periodLabel +
      " · Jornada diária conforme configuração da matrícula · Horas extras após desconto do intervalo";

    if (records.length) {
      const newest = [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      const date = newest.createdAt ? new Date(newest.createdAt) : null;
      document.getElementById("lastUpdated").textContent = date && !Number.isNaN(date.getTime())
        ? "Último lançamento: " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
        : "Histórico atualizado";
    } else {
      document.getElementById("lastUpdated").textContent = "Nenhum registro salvo";
    }
    renderShiftCalendar();
    renderDashboardExtras(dailyMetrics);
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    if (records.length === 0) {
      showFeedback("Ainda não há lançamentos para exportar.", "error");
      return;
    }
    const headers = [
      "Competência", "Nome completo", "Matrícula", "Data inicial", "Horário inicial",
      "Intervalo informado", "Intervalo descontado (horas)", "Data final", "Horário final",
      "Nº de ordem do veículo", "Placa", "Tipo de serviço", "Origem", "Destino",
      "Jornada bruta (horas)", "Horas trabalhadas (horas)", "Base contratual (horas)",
      "Horas normais (horas)", "Horas extras (horas)"
    ];
    const dailyMetrics = calculateDailyMetrics(records);
    const rows = records.map((record) => {
      const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
      if (metrics.error) return [];
      return [
        monthKey(record.startDate), record.fullName, record.registration, formatDate(record.startDate),
        record.startTime, record.interval, (metrics.intervalMinutes / 60).toFixed(2).replace(".", ","),
        formatDate(record.endDate), record.endTime, record.vehicleOrder, record.plate,
        record.serviceType, record.origin, record.destination,
        (metrics.elapsedMinutes / 60).toFixed(2).replace(".", ","),
        (metrics.workedMinutes / 60).toFixed(2).replace(".", ","),
        (getDailyTargetMinutes(record.registration) / 60).toFixed(2).replace(".", ","),
        (metrics.regularMinutes / 60).toFixed(2).replace(".", ","),
        (metrics.overtimeMinutes / 60).toFixed(2).replace(".", ",")
      ];
    }).filter((row) => row.length);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "controle-de-ponto-" + localDateString() + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback("Arquivo CSV gerado com jornada líquida e horas extras.", "success");
  }

  function excelDuration(minutes) {
    return minutes / 1440;
  }

  function exportExcel() {
    if (records.length === 0) {
      showFeedback("Ainda não há lançamentos para exportar.", "error");
      return;
    }
    if (!window.XLSX || !window.XLSX.utils || !window.XLSX.writeFile) {
      showFeedback("O componente de exportação Excel não carregou. Atualize a página e tente novamente; a opção CSV continua disponível.", "error");
      return;
    }

    const XLSX = window.XLSX;
    const sortedRecords = [...records].sort((a, b) => {
      const left = (a.startDate || "") + " " + (a.startTime || "");
      const right = (b.startDate || "") + " " + (b.startTime || "");
      return left.localeCompare(right);
    });

    const headers = [
      "Competência", "Nome completo", "Matrícula", "Data inicial", "Horário inicial",
      "Intervalo informado", "Intervalo descontado", "Data final", "Horário final",
      "Nº de ordem do veículo", "Placa", "Tipo de serviço", "Origem", "Destino",
      "Jornada bruta", "Horas trabalhadas", "Base contratual", "Horas normais",
      "Horas extras", "Lançado em"
    ];

    const dailyMetrics = calculateDailyMetrics(sortedRecords);
    const rows = sortedRecords.map((record) => {
      const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
      if (metrics.error) return null;
      return [
        monthKey(record.startDate),
        record.fullName,
        record.registration,
        dateObject(record.startDate),
        record.startTime,
        record.interval || "",
        excelDuration(metrics.intervalMinutes),
        dateObject(record.endDate),
        record.endTime,
        record.vehicleOrder,
        record.plate,
        record.serviceType,
        record.origin || "",
        record.destination || "",
        excelDuration(metrics.elapsedMinutes),
        excelDuration(metrics.workedMinutes),
        excelDuration(getDailyTargetMinutes(record.registration)),
        excelDuration(metrics.regularMinutes),
        excelDuration(metrics.overtimeMinutes),
        record.createdAt ? new Date(record.createdAt) : ""
      ];
    }).filter(Boolean);

    if (rows.length === 0) {
      showFeedback("Não há registros válidos para exportar. Revise as datas, horários e intervalos.", "error");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const launchSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const finalRow = rows.length + 1;
    launchSheet["!autofilter"] = { ref: "A1:T" + finalRow };
    launchSheet["!cols"] = [
      { wch: 13 }, { wch: 28 }, { wch: 14 }, { wch: 13 }, { wch: 12 },
      { wch: 24 }, { wch: 19 }, { wch: 13 }, { wch: 12 }, { wch: 20 },
      { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 16 },
      { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }
    ];

    for (let rowIndex = 2; rowIndex <= finalRow; rowIndex += 1) {
      ["G", "O", "P", "Q", "R", "S"].forEach((column) => {
        const cell = launchSheet[column + rowIndex];
        if (cell) cell.z = "[h]:mm";
      });
      ["D", "H"].forEach((column) => {
        const cell = launchSheet[column + rowIndex];
        if (cell) cell.z = "dd/mm/yyyy";
      });
      const timestampCell = launchSheet["T" + rowIndex];
      if (timestampCell) timestampCell.z = "dd/mm/yyyy hh:mm";
    }
    XLSX.utils.book_append_sheet(workbook, launchSheet, "Lançamentos");

    const months = [...new Set(sortedRecords.map((record) => monthKey(record.startDate)).filter(Boolean))].sort();
    const summaryHeaders = ["Competência", "Lançamentos", "Horas trabalhadas", "Horas extras", "Plantões", "Viagens"];
    const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...months.map((month) => [month, 0, 0, 0, 0, 0])]);
    const summaryEndRow = rows.length + 1;
    months.forEach((month, index) => {
      const excelRow = index + 2;
      const monthRecords = sortedRecords.filter((record) => monthKey(record.startDate) === month);
      const totals = monthRecords.reduce((acc, record) => {
        const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
        if (!metrics.error) {
          acc.worked += metrics.workedMinutes;
          acc.overtime += metrics.overtimeMinutes;
        }
        return acc;
      }, { worked: 0, overtime: 0 });
      const recordsRange = "'Lançamentos'!$A$2:$A$" + summaryEndRow;
      const serviceRange = "'Lançamentos'!$L$2:$L$" + summaryEndRow;
      const workedRange = "'Lançamentos'!$P$2:$P$" + summaryEndRow;
      const overtimeRange = "'Lançamentos'!$S$2:$S$" + summaryEndRow;
      summarySheet["B" + excelRow] = { t: "n", f: "COUNTIF(" + recordsRange + ",A" + excelRow + ")", v: monthRecords.length };
      summarySheet["C" + excelRow] = { t: "n", f: "SUMIF(" + recordsRange + ",A" + excelRow + "," + workedRange + ")", v: excelDuration(totals.worked) , z: "[h]:mm" };
      summarySheet["D" + excelRow] = { t: "n", f: "SUMIF(" + recordsRange + ",A" + excelRow + "," + overtimeRange + ")", v: excelDuration(totals.overtime), z: "[h]:mm" };
      const plantaoCount = monthRecords.filter((record) => record.serviceType === "Plantão").length;
      const tripCount = monthRecords.filter((record) => record.serviceType === "Viagem").length;
      summarySheet["E" + excelRow] = { t: "n", f: "COUNTIFS(" + recordsRange + ",A" + excelRow + "," + serviceRange + ",\"Plantão\")", v: plantaoCount };
      summarySheet["F" + excelRow] = { t: "n", f: "COUNTIFS(" + recordsRange + ",A" + excelRow + "," + serviceRange + ",\"Viagem\")", v: tripCount };
    });
    summarySheet["!autofilter"] = { ref: "A1:F" + Math.max(1, months.length + 1) };
    summarySheet["!cols"] = [{ wch: 17 }, { wch: 16 }, { wch: 23 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    for (let rowIndex = 2; rowIndex <= months.length + 1; rowIndex += 1) {
      ["C", "D"].forEach((column) => {
        const cell = summarySheet[column + rowIndex];
        if (cell) cell.z = "[h]:mm";
      });
    }
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo mensal");

    // Uma linha por competência + matrícula, para filtrar e imprimir o resumo individual.
    const employeeGroups = new Map();
    sortedRecords.forEach((record) => {
      const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
      if (metrics.error) return;
      const month = monthKey(record.startDate);
      const registration = String(record.registration || "").trim();
      if (!month || !registration) return;

      const key = month + "|" + registration;
      if (!employeeGroups.has(key)) {
        employeeGroups.set(key, {
          month,
          registration,
          names: new Map(),
          launches: 0,
          plantons: 0,
          trips: 0,
          grossMinutes: 0,
          workedMinutes: 0,
          overtimeMinutes: 0
        });
      }
      const group = employeeGroups.get(key);
      const employeeName = String(record.fullName || "").trim() || "Nome não informado";
      group.names.set(employeeName, (group.names.get(employeeName) || 0) + 1);
      group.launches += 1;
      if (record.serviceType === "Plantão") group.plantons += 1;
      if (record.serviceType === "Viagem") group.trips += 1;
      group.grossMinutes += metrics.elapsedMinutes;
      group.workedMinutes += metrics.workedMinutes;
      group.overtimeMinutes += metrics.overtimeMinutes;
    });

    const employeeSummaries = [...employeeGroups.values()].map((group) => {
      const mostFrequentName = [...group.names.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0];
      return { ...group, fullName: mostFrequentName ? mostFrequentName[0] : "Nome não informado" };
    }).sort((a, b) =>
      a.month.localeCompare(b.month) ||
      a.fullName.localeCompare(b.fullName, "pt-BR") ||
      a.registration.localeCompare(b.registration, "pt-BR")
    );

    const employeeHeaders = [
      "Competência", "Colaborador", "Matrícula", "Lançamentos",
      "Plantões", "Viagens", "Jornada bruta", "Horas trabalhadas", "Horas extras"
    ];
    const employeeRows = employeeSummaries.map((group) => [
      group.month,
      group.fullName,
      group.registration,
      group.launches,
      group.plantons,
      group.trips,
      excelDuration(group.grossMinutes),
      excelDuration(group.workedMinutes),
      excelDuration(group.overtimeMinutes)
    ]);
    const employeeSheet = XLSX.utils.aoa_to_sheet([
      ["RESUMO INDIVIDUAL POR COLABORADOR"],
      ["Uma linha por matrícula e competência. Use os filtros da tabela para selecionar o mês e o colaborador; depois, imprima somente as linhas filtradas."],
      [],
      employeeHeaders,
      ...employeeRows
    ]);

    const employeeLastRow = employeeRows.length + 4;
    const employeeRawLastRow = rows.length + 1;
    const employeeMonthRange = "'Lançamentos'!$A$2:$A$" + employeeRawLastRow;
    const employeeRegistrationRange = "'Lançamentos'!$C$2:$C$" + employeeRawLastRow;
    const employeeServiceRange = "'Lançamentos'!$L$2:$L$" + employeeRawLastRow;
    const employeeGrossRange = "'Lançamentos'!$O$2:$O$" + employeeRawLastRow;
    const employeeWorkedRange = "'Lançamentos'!$P$2:$P$" + employeeRawLastRow;
    const employeeOvertimeRange = "'Lançamentos'!$S$2:$S$" + employeeRawLastRow;

    employeeSummaries.forEach((group, index) => {
      const excelRow = index + 5;
      employeeSheet["D" + excelRow] = {
        t: "n",
        f: "COUNTIFS(" + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + ")",
        v: group.launches,
        z: "0"
      };
      employeeSheet["E" + excelRow] = {
        t: "n",
        f: "COUNTIFS(" + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + "," + employeeServiceRange + ",\"Plantão\")",
        v: group.plantons,
        z: "0"
      };
      employeeSheet["F" + excelRow] = {
        t: "n",
        f: "COUNTIFS(" + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + "," + employeeServiceRange + ",\"Viagem\")",
        v: group.trips,
        z: "0"
      };
      employeeSheet["G" + excelRow] = {
        t: "n",
        f: "SUMIFS(" + employeeGrossRange + "," + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + ")",
        v: excelDuration(group.grossMinutes),
        z: "[h]:mm"
      };
      employeeSheet["H" + excelRow] = {
        t: "n",
        f: "SUMIFS(" + employeeWorkedRange + "," + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + ")",
        v: excelDuration(group.workedMinutes),
        z: "[h]:mm"
      };
      employeeSheet["I" + excelRow] = {
        t: "n",
        f: "SUMIFS(" + employeeOvertimeRange + "," + employeeMonthRange + ",A" + excelRow + "," + employeeRegistrationRange + ",C" + excelRow + ")",
        v: excelDuration(group.overtimeMinutes),
        z: "[h]:mm"
      };
    });

    employeeSheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
    ];
    employeeSheet["!rows"] = [
      { hpt: 28 },
      { hpt: 34 },
      { hpt: 8 },
      { hpt: 24 }
    ];
    employeeSheet["!autofilter"] = { ref: "A4:I" + Math.max(4, employeeLastRow) };
    employeeSheet["!cols"] = [
      { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 21 }, { wch: 16 }
    ];
    employeeSheet["!margins"] = {
      left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2
    };
    XLSX.utils.book_append_sheet(workbook, employeeSheet, "Resumo por colaborador");

    const instructions = [
      ["CONTROLE DE PONTO · INSTRUÇÕES"],
      ["Como usar", "Na aba Lançamentos, use o filtro da coluna Competência para selecionar o mês desejado."],
      ["Resumo mensal", "A aba Resumo mensal consolida quantidade de lançamentos, horas trabalhadas, horas extras, plantões e viagens por mês."],
      ["Resumo individual", "A aba Resumo por colaborador apresenta uma linha por matrícula e competência, com lançamentos, plantões, viagens, jornada bruta, horas trabalhadas e horas extras."],
      ["Filtro individual", "Use os filtros da tabela na aba Resumo por colaborador para selecionar Competência, Colaborador ou Matrícula."],
      ["Impressão individual", "Depois de aplicar os filtros de competência e matrícula/colaborador, use Arquivo > Imprimir. Para melhor leitura, escolha papel A4, orientação Paisagem e ajuste todas as colunas em uma página de largura."],
      ["Jornada bruta", "Diferença entre a data/hora final e a data/hora inicial."],
      ["Intervalo", "O intervalo informado é descontado da jornada bruta. Formatos aceitos no site: 01:00, 1h, 60 min ou 12:00 às 13:00. Campo vazio equivale a zero."],
      ["Horas trabalhadas", "Jornada bruta menos intervalo descontado."],
      ["Jornada diária", "A carga diária é configurável por matrícula no site. Matrículas sem configuração usam o padrão de 7h20. O valor configurado é exportado na coluna Base contratual."],
      ["Horas extras", "Apuradas sobre o total de horas líquidas da matrícula em cada data inicial. O limite é a jornada diária configurada para aquela matrícula; os excedentes são distribuídos cronologicamente entre os lançamentos."],
      ["Horas normais", "Até completar a jornada diária configurada para a matrícula. Lançamentos posteriores no mesmo dia recebem somente a parcela que exceder a cota diária restante."],
      ["Jornadas após meia-noite", "Todo o período líquido do lançamento é atribuído à data inicial, conforme regra operacional configurada."],
      ["Competência", "Mês e ano da Data inicial do lançamento."],
      ["Armazenamento", "A exportação contém os registros guardados no navegador em que o site foi utilizado. Esta versão ainda não sincroniza dados entre computadores."],
      ["Observação", "O cálculo é operacional, com base nos critérios configurados nesta versão. Regras específicas de folha, adicionais, feriados ou convenções não são aplicadas."]
    ];
    const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionSheet["!cols"] = [{ wch: 24 }, { wch: 105 }];
    XLSX.utils.book_append_sheet(workbook, instructionSheet, "Instruções");

    workbook.Workbook = workbook.Workbook || {};
    workbook.Workbook.CalcPr = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };
    XLSX.writeFile(workbook, "controle-de-ponto-" + localDateString() + ".xlsx", { bookType: "xlsx", compression: true });
    showFeedback("Planilha Excel gerada com quatro abas, filtros mensais e apuração diária de horas extras.", "success");
  }


  const individualMonth = document.getElementById("individualMonth");
  const individualEmployee = document.getElementById("individualEmployee");
  const generateIndividualReportButton = document.getElementById("generateIndividualReport");
  const individualReportOutput = document.getElementById("individualReportOutput");

  function updateIndividualMonthOptions() {
    const previous = individualMonth.value;
    const months = [...new Set(records.map((record) => monthKey(record.startDate)).filter(Boolean))].sort().reverse();
    individualMonth.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = months.length ? "Selecione o mês" : "Nenhum mês disponível";
    individualMonth.append(placeholder);
    months.forEach((month) => {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = formatMonth(month);
      individualMonth.append(option);
    });
    individualMonth.value = months.includes(previous) ? previous : (months[0] || "");
    updateIndividualEmployeeOptions();
  }

  function updateIndividualEmployeeOptions() {
    const previous = individualEmployee.value;
    const month = individualMonth.value;
    const monthRecords = records.filter((record) => monthKey(record.startDate) === month);
    const employees = new Map();
    monthRecords.forEach((record) => {
      const registration = normalizeRegistration(record.registration);
      if (!registration) return;
      const current = employees.get(registration);
      if (!current || (!current.fullName && record.fullName)) {
        employees.set(registration, { registration, fullName: record.fullName || "" });
      }
    });
    individualEmployee.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = employees.size ? "Selecione o colaborador" : "Nenhum colaborador neste mês";
    individualEmployee.append(placeholder);
    [...employees.values()].sort((a, b) => (a.fullName || a.registration).localeCompare(b.fullName || b.registration, "pt-BR"))
      .forEach((employee) => {
        const option = document.createElement("option");
        option.value = employee.registration;
        option.textContent = (employee.fullName || "Colaborador") + " · Matrícula " + employee.registration;
        individualEmployee.append(option);
      });
    individualEmployee.disabled = employees.size === 0;
    individualEmployee.value = employees.has(previous) ? previous : "";
  }

  function appendReportCell(row, value, className, tagName = "td") {
    const cell = document.createElement(tagName);
    if (className) cell.className = className;
    cell.textContent = value;
    row.append(cell);
    return cell;
  }

  function generateIndividualReport() {
    const month = individualMonth.value;
    const registration = individualEmployee.value;
    if (!month || !registration) {
      showFeedback("Selecione a competência e o colaborador para gerar o espelho.", "error");
      return;
    }
    const employeeRecords = records.filter((record) =>
      monthKey(record.startDate) === month && normalizeRegistration(record.registration) === registration
    ).sort((a, b) => ((a.startDate || "") + " " + (a.startTime || "")).localeCompare((b.startDate || "") + " " + (b.startTime || "")));
    if (!employeeRecords.length) {
      showFeedback("Não há lançamentos para este colaborador na competência selecionada.", "error");
      return;
    }

    const dailyMetrics = calculateDailyMetrics(records);
    const days = new Map();
    let workedTotal = 0;
    let regularTotal = 0;
    let overtimeTotal = 0;
    let invalidCount = 0;
    employeeRecords.forEach((record) => {
      const metrics = dailyMetrics.get(record) || getWorkMetrics(record);
      if (metrics.error) { invalidCount += 1; return; }
      workedTotal += metrics.workedMinutes;
      regularTotal += metrics.regularMinutes;
      overtimeTotal += metrics.overtimeMinutes;
      if (!days.has(record.startDate)) days.set(record.startDate, { worked: 0, regular: 0, overtime: 0, shifts: [] });
      const day = days.get(record.startDate);
      day.worked += metrics.workedMinutes;
      day.regular += metrics.regularMinutes;
      day.overtime += metrics.overtimeMinutes;
      const service = record.serviceType === "Viagem"
        ? "Viagem" + (record.origin || record.destination ? " (" + (record.origin || "—") + " → " + (record.destination || "—") + ")" : "")
        : (record.serviceType || "Serviço");
      if (record.serviceType === "Folga") day.shifts.push("FOLGA · Nenhuma hora contabilizada");
      else if (record.serviceType === "Intervalo") day.shifts.push("INTERVALO · " + record.startTime + "–" + record.endTime + " · Não contabilizado");
      else day.shifts.push((record.startTime || "—") + "–" + (record.endTime || "—") + (record.endDate && record.endDate !== record.startDate ? " (" + formatDate(record.endDate) + ")" : "") + " · " + service + " · Intervalo descontado: " + (record.interval || "não informado"));
    });

    const first = employeeRecords.find((record) => record.fullName);
    individualReportOutput.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "individual-report-heading";
    const title = document.createElement("h3");
    title.textContent = "Espelho mensal de ponto";
    const subtitle = document.createElement("p");
    subtitle.textContent = formatMonth(month) + " · " + (first ? first.fullName : "Colaborador") + " · Matrícula " + registration;
    heading.append(title, subtitle);
    const printReportButton = document.createElement("button");
    printReportButton.type = "button";
    printReportButton.className = "button button-outline individual-print-button";
    printReportButton.textContent = "Imprimir espelho";
    printReportButton.addEventListener("click", printIndividualReport);
    heading.append(printReportButton);
    const generated = document.createElement("small");
    generated.className = "individual-generated";
    generated.textContent = "Gerado em " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    heading.append(generated);
    individualReportOutput.append(heading);

    const summary = document.createElement("div");
    summary.className = "individual-summary";
    [
      ["Dias com lançamento", String(days.size)],
      ["Horas trabalhadas", formatMinutes(workedTotal)],
      ["Horas normais", formatMinutes(regularTotal)],
      ["Horas extras", formatMinutes(overtimeTotal)]
    ].forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "individual-summary-card";
      const strong = document.createElement("strong");
      strong.textContent = value;
      const small = document.createElement("small");
      small.textContent = label;
      card.append(strong, small);
      summary.append(card);
    });
    individualReportOutput.append(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "individual-table-wrap";
    const table = document.createElement("table");
    table.className = "individual-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Data", "Jornadas / serviços do dia", "Trabalhadas", "Normais", "Extras"].forEach((label) => appendReportCell(headerRow, label, "", "th"));
    thead.append(headerRow);
    table.append(thead);
    const tbody = document.createElement("tbody");
    [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, day]) => {
      const row = document.createElement("tr");
      appendReportCell(row, formatDate(date));
      const shiftsCell = appendReportCell(row, day.shifts.join("\n"), "individual-shifts");
      shiftsCell.style.whiteSpace = "pre-line";
      appendReportCell(row, formatMinutes(day.worked), "numeric-cell");
      appendReportCell(row, formatMinutes(day.regular), "numeric-cell");
      appendReportCell(row, formatMinutes(day.overtime), "numeric-cell " + (day.overtime > 0 ? "has-overtime" : ""));
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    individualReportOutput.append(tableWrap);

    const note = document.createElement("p");
    note.className = "individual-report-note";
    note.textContent = "Critério: jornada diária de " + formatTarget(getDailyTargetMinutes(registration)) + " para esta matrícula. As horas normais são alocadas cronologicamente entre os lançamentos do dia; o excedente é classificado como hora extra. Jornadas que atravessam a meia-noite permanecem vinculadas à data inicial.";
    individualReportOutput.append(note);
    if (invalidCount) {
      const warning = document.createElement("p");
      warning.className = "individual-report-warning";
      warning.textContent = invalidCount + " lançamento(s) com dados inválidos foram desconsiderados dos totais.";
      individualReportOutput.append(warning);
    }
    individualReportOutput.classList.remove("is-hidden");
    individualReportOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    clearFeedback();
  }

  function printIndividualReport() {
    if (individualReportOutput.classList.contains("is-hidden")) {
      showFeedback("Gere o espelho mensal antes de imprimir.", "error");
      return;
    }
    document.body.classList.add("printing-individual-report");
    window.print();
  }

  window.addEventListener("afterprint", () => document.body.classList.remove("printing-individual-report"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFeedback();

    const record = getFormData();
    const validationMessage = validateRecord(record);
    if (validationMessage) {
      showFeedback(validationMessage, "error");
      const firstInvalid = form.querySelector(":invalid");
      if (firstInvalid && !firstInvalid.disabled) firstInvalid.focus();
      return;
    }

    if (!confirmRecordConflicts(record)) {
      showFeedback("Lançamento não salvo. A gravação foi cancelada após a identificação de conflito.", "error");
      return;
    }

    records.push(record);
    if (!persistRecords()) {
      records.pop();
      return;
    }

    renderRecords();
    form.reset();
    window.setTimeout(() => showFeedback("Lançamento salvo com sucesso neste navegador.", "success"), 0);
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      startDateInput.value = localDateString();
      endDateInput.value = localDateString();
      clearFeedback();
      toggleRouteFields();
      updateDurationPreview();
    }, 0);
  });

  schedulePreset.addEventListener("change", () => customScheduleField.classList.toggle("is-hidden", schedulePreset.value !== "custom"));
  scheduleRegistrationInput.addEventListener("input", refreshScheduleForm);
  document.getElementById("saveScheduleButton").addEventListener("click", () => {
    const key = normalizeRegistration(scheduleRegistrationInput.value);
    if (!key) { scheduleFeedback.textContent = "Informe a matrícula para salvar uma jornada."; scheduleRegistrationInput.focus(); return; }
    let target = Number(schedulePreset.value);
    if (schedulePreset.value === "custom") {
      const match = customScheduleTime.value.match(/^(\d{2}):(\d{2})$/);
      if (!match) { scheduleFeedback.textContent = "Informe a carga no formato HH:MM."; return; }
      target = Number(match[1])*60+Number(match[2]);
    }
    if (!Number.isInteger(target) || target < 1 || target > 1439) { scheduleFeedback.textContent = "A carga deve ser maior que zero e deve ser inferior a 24 horas."; return; }
    schedules[key] = target;
    if (!persistSchedules()) return;
    renderRecords(); updateDurationPreview(); refreshScheduleForm();
    scheduleFeedback.textContent = "Jornada de "+formatTarget(target)+" salva para a matrícula "+key+". Cálculos e relatórios atualizados.";
  });
  document.getElementById("resetScheduleButton").addEventListener("click", () => {
    const key = normalizeRegistration(scheduleRegistrationInput.value);
    if (!key) { scheduleFeedback.textContent = "Informe a matrícula para restaurar o padrão."; return; }
    delete schedules[key];
    if (!persistSchedules()) return;
    renderRecords(); updateDurationPreview(); refreshScheduleForm();
    scheduleFeedback.textContent = "Matrícula "+key+" restaurada para a jornada padrão de 7h20.";
  });
  
  document.getElementById("shiftScheduleType").addEventListener("change", () => {
    refreshShiftPlannerTypeFields();
    renderShiftCalendar();
  });
  document.getElementById("shiftScheduleRegistration").addEventListener("input", renderShiftCalendar);
  document.getElementById("shiftScheduleRegistration").addEventListener("change", (event) => {
    const key = normalizeRegistration(event.target.value);
    if (key && shiftPlans[key]) applyShiftPlanToForm(shiftPlans[key]);
    else renderShiftCalendar();
  });
  document.getElementById("savedShiftScheduleSelect").addEventListener("change", (event) => {
    if (event.target.value && shiftPlans[event.target.value]) applyShiftPlanToForm(shiftPlans[event.target.value]);
  });
  document.getElementById("loadShiftScheduleButton").addEventListener("click", () => {
    const key = document.getElementById("savedShiftScheduleSelect").value;
    if (!key || !shiftPlans[key]) {
      document.getElementById("shiftScheduleFeedback").textContent = "Selecione uma escala salva.";
      return;
    }
    applyShiftPlanToForm(shiftPlans[key]);
    document.getElementById("shiftScheduleFeedback").textContent = "Escala da matrícula " + key + " carregada.";
  });
  document.getElementById("saveShiftScheduleButton").addEventListener("click", saveShiftPlan);
  document.getElementById("deleteShiftScheduleButton").addEventListener("click", deleteShiftPlan);
  ["shiftAnchorDate", "shiftStartTime", "shiftDuration", "shiftInterval", "shiftCustomWorkDays", "shiftCustomRestDays", "planCalendarStartDate", "planHorizon"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", renderShiftCalendar);
    input.addEventListener("change", renderShiftCalendar);
  });

  serviceType.addEventListener("change", () => {
    toggleRouteFields();
    updateDurationPreview();
    clearFeedback();
  });

  [startDateInput, startTimeInput, endDateInput, endTimeInput, intervalInput].forEach((input) => {
    input.addEventListener("input", updateDurationPreview);
    input.addEventListener("change", updateDurationPreview);
  });

  document.getElementById("plate").addEventListener("blur", (event) => {
    event.target.value = event.target.value.trim().toUpperCase();
  });

  recordsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.deleteId);
    if (!record) return;
    if (!window.confirm("Deseja excluir o lançamento de " + (record.fullName || "colaborador") + "?")) return;
    records = records.filter((item) => item.id !== button.dataset.deleteId);
    if (persistRecords()) {
      renderRecords();
      showFeedback("Lançamento excluído do histórico local.", "success");
    }
  });

  monthFilter.addEventListener("change", renderRecords);
  activityRegistrationSelect.addEventListener("change", () => renderDashboardExtras());
  activityMonthInput.addEventListener("change", () => {
    activitySelectedDate = activityMonthInput.value ? activityMonthInput.value + "-01" : localDateString();
    renderDashboardExtras();
  });
  activityCalendarGrid.addEventListener("click", (event) => {
    const dayButton = event.target.closest("button[data-date]");
    if (!dayButton) return;
    activitySelectedDate = dayButton.dataset.date;
    renderDashboardExtras();
  });
  document.getElementById("activityPrevMonth").addEventListener("click", () => shiftActivityMonth(-1));
  document.getElementById("activityNextMonth").addEventListener("click", () => shiftActivityMonth(1));
  individualMonth.addEventListener("change", () => { updateIndividualEmployeeOptions(); individualReportOutput.classList.add("is-hidden"); });
  individualEmployee.addEventListener("change", () => individualReportOutput.classList.add("is-hidden"));
  generateIndividualReportButton.addEventListener("click", generateIndividualReport);
  clearFilterButton.addEventListener("click", () => {
    monthFilter.value = "";
    renderRecords();
  });
  document.getElementById("exportBackupButton").addEventListener("click", exportBackup);
  document.getElementById("importBackupButton").addEventListener("click", () => document.getElementById("backupFileInput").click());
  document.getElementById("backupFileInput").addEventListener("change", importBackup);
  exportButton.addEventListener("click", exportExcel);
  exportCsvButton.addEventListener("click", exportCsv);
  printButton.addEventListener("click", () => window.print());

  document.getElementById("todayLabel").textContent = formatLongDate(new Date());
  refreshScheduleForm();
  startDateInput.value = localDateString();
  endDateInput.value = localDateString();
  document.getElementById("shiftAnchorDate").value = localDateString();
  document.getElementById("planCalendarStartDate").value = localDateString();
  activityMonthInput.value = localDateString().slice(0,7);
  activitySelectedDate = localDateString();
  refreshShiftPlannerTypeFields();
  renderShiftScheduleOptions();
  toggleRouteFields();
  updateDurationPreview();
  renderRecords();
  updateIndividualMonthOptions();
  if ("serviceWorker" in navigator && (window.location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Não foi possível ativar o modo offline.", error));
  }
})();
