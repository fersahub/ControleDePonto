"use strict";

(() => {
  const STORAGE_KEY = "controleDePonto.registros.v1";
  const CONTRACT_MINUTES = 7 * 60 + 20;
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
    if (!dateValue || !timeValue) return null;
    const date = new Date(dateValue + "T" + timeValue + ":00");
    return Number.isNaN(date.getTime()) ? null : date;
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
    const input = String(value || "").trim().toLowerCase();
    if (!input) return 0;

    let match = input.match(/(\d{1,2}):([0-5]\d)\s*(?:às|as|a|[-–—])\s*(\d{1,2}):([0-5]\d)/i);
    if (match) {
      const startHour = Number(match[1]);
      const startMinute = Number(match[2]);
      const endHour = Number(match[3]);
      const endMinute = Number(match[4]);
      if (startHour > 23 || endHour > 23) return null;
      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;
      return (end - start + 1440) % 1440;
    }

    match = input.match(/^(\d{1,3}):([0-5]\d)$/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);

    match = input.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)$/i);
    if (match) return Math.round(Number(match[1].replace(",", ".")) * 60);

    match = input.match(/^(\d+)\s*(?:min|minuto|minutos)$/i);
    if (match) return Number(match[1]);

    return null;
  }

  function getWorkMetrics(record) {
    const start = parseLocalDateTime(record.startDate, record.startTime);
    const end = parseLocalDateTime(record.endDate, record.endTime);
    if (!start || !end || end <= start) {
      return { error: "A data e o horário finais devem ser posteriores ao início." };
    }

    const elapsedMinutes = Math.floor((end - start) / 60000);
    const intervalMinutes = parseIntervalMinutes(record.interval);
    if (intervalMinutes === null) {
      return { error: "Informe o intervalo como 01:00, 1h, 60 min ou uma faixa como 12:00 às 13:00." };
    }
    if (intervalMinutes > elapsedMinutes) {
      return { error: "O intervalo informado não pode ser maior que o período entre o início e o término." };
    }

    const workedMinutes = elapsedMinutes - intervalMinutes;
    const regularMinutes = Math.min(workedMinutes, CONTRACT_MINUTES);
    const overtimeMinutes = Math.max(0, workedMinutes - CONTRACT_MINUTES);
    return {
      elapsedMinutes,
      intervalMinutes,
      workedMinutes,
      regularMinutes,
      overtimeMinutes
    };
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
    const isTrip = serviceType.value === "Viagem";
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

    const metrics = getWorkMetrics({
      startDate: startDateInput.value,
      startTime: startTimeInput.value,
      endDate: endDateInput.value,
      endTime: endTimeInput.value,
      interval: intervalInput.value
    });
    if (metrics.error) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = metrics.error;
      return;
    }

    durationPreview.classList.add("is-ready");
    durationPreview.textContent = "Jornada líquida: " + formatMinutes(metrics.workedMinutes) +
      " · Horas extras: " + formatMinutes(metrics.overtimeMinutes) + " (base 7h20).";
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
      startTime: String(data.get("startTime") || ""),
      interval: String(data.get("interval") || "").trim(),
      endDate: String(data.get("endDate") || ""),
      endTime: String(data.get("endTime") || ""),
      vehicleOrder: serviceType.value === "Viagem" ? String(data.get("vehicleOrder") || "").trim() : "",
      plate: serviceType.value === "Viagem" ? String(data.get("plate") || "").trim().toUpperCase() : "",
      serviceType: String(data.get("serviceType") || ""),
      origin: serviceType.value === "Viagem" ? String(data.get("origin") || "").trim() : "",
      destination: serviceType.value === "Viagem" ? String(data.get("destination") || "").trim() : "",
      createdAt: new Date().toISOString()
    };
  }

  function validateRecord(record) {
    const requiredFields = [
      ["Nome completo", record.fullName],
      ["Matrícula", record.registration],
      ["Data inicial", record.startDate],
      ["Horário inicial", record.startTime],
      ["Data final", record.endDate],
      ["Horário final", record.endTime],
      ["Tipo de serviço", record.serviceType]
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) return "Preencha o campo obrigatório: " + missing[0] + ".";
    if (record.serviceType !== "Plantão" && record.serviceType !== "Viagem") return "Selecione Plantão ou Viagem.";
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
    return String(value || "").trim().replace(/\\s+/g, " ").toLocaleUpperCase("pt-BR");
  }

  function getRecordPeriod(record) {
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

    return lines.join("\\n");
  }

  function confirmRecordConflicts(record) {
    const conflicts = findRecordConflicts(record);
    const sections = [];

    if (conflicts.duplicates.length) {
      sections.push(
        "POSSÍVEL LANÇAMENTO DUPLICADO\\n" +
        "Já existe registro(s) para esta matrícula com o mesmo início e término:\\n" +
        formatConflictEntries(conflicts.duplicates)
      );
    }

    if (conflicts.overlaps.length) {
      sections.push(
        "POSSÍVEL SOBREPOSIÇÃO DE JORNADA\\n" +
        "O período informado se cruza com outro(s) lançamento(s) desta matrícula:\\n" +
        formatConflictEntries(conflicts.overlaps)
      );
    }

    if (!sections.length) return true;

    sections.push("Deseja salvar mesmo assim? A gravação só será feita com sua confirmação.");
    return window.confirm(sections.join("\\n\\n"));
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
    const visibleRecords = getVisibleRecords();
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
        const metrics = getWorkMetrics(record);
        const row = document.createElement("tr");

        row.append(createStackCell(record.fullName || "—", "Matrícula: " + (record.registration || "—"), "person-cell"));

        const intervalLabel = metrics.error ? (record.interval || "não informado") : formatMinutes(metrics.intervalMinutes);
        row.append(createStackCell(formatDate(record.startDate), (record.startTime || "—") + " → " + formatDate(record.endDate) + " " + (record.endTime || "") + " · Intervalo: " + intervalLabel, "date-cell"));

        const serviceCell = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = "service-pill " + (record.serviceType === "Plantão" ? "plantao" : "");
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
      const metrics = getWorkMetrics(record);
      return sum + (metrics.error ? 0 : metrics.overtimeMinutes);
    }, 0);
    document.getElementById("totalRecords").textContent = String(visibleRecords.length);
    document.getElementById("totalOvertime").textContent = formatMinutes(overtimeTotal);
    document.getElementById("todayRecords").textContent = String(visibleRecords.filter((item) => item.startDate === today).length);
    document.getElementById("vehicleCount").textContent = String(new Set(visibleRecords.map((item) => (item.plate || "").toUpperCase()).filter(Boolean)).size);
    document.getElementById("recordCount").textContent = visibleRecords.length + " " + (visibleRecords.length === 1 ? "registro" : "registros");

    const periodLabel = monthFilter.value ? formatMonth(monthFilter.value) : "Todos os meses";
    document.getElementById("printReportTitle").textContent =
      "Relatório de controle de ponto · " + periodLabel +
      " · Base contratual 7h20 · Horas extras calculadas após desconto do intervalo";

    if (records.length) {
      const newest = [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      const date = newest.createdAt ? new Date(newest.createdAt) : null;
      document.getElementById("lastUpdated").textContent = date && !Number.isNaN(date.getTime())
        ? "Último lançamento: " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
        : "Histórico atualizado";
    } else {
      document.getElementById("lastUpdated").textContent = "Nenhum registro salvo";
    }
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
    const rows = records.map((record) => {
      const metrics = getWorkMetrics(record);
      if (metrics.error) return [];
      return [
        monthKey(record.startDate), record.fullName, record.registration, formatDate(record.startDate),
        record.startTime, record.interval, (metrics.intervalMinutes / 60).toFixed(2).replace(".", ","),
        formatDate(record.endDate), record.endTime, record.vehicleOrder, record.plate,
        record.serviceType, record.origin, record.destination,
        (metrics.elapsedMinutes / 60).toFixed(2).replace(".", ","),
        (metrics.workedMinutes / 60).toFixed(2).replace(".", ","),
        (CONTRACT_MINUTES / 60).toFixed(2).replace(".", ","),
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
    URL.revokeObjectURL(url);
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

    const rows = sortedRecords.map((record) => {
      const metrics = getWorkMetrics(record);
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
        excelDuration(CONTRACT_MINUTES),
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
        const metrics = getWorkMetrics(record);
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
      const metrics = getWorkMetrics(record);
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
      ["Base contratual", "7 horas e 20 minutos por lançamento."],
      ["Horas extras", "Somente o tempo que exceder 7h20 de horas trabalhadas líquidas em cada lançamento."],
      ["Horas normais", "Limitadas a 7h20 por lançamento. O excedente aparece na coluna Horas extras."],
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
    showFeedback("Planilha Excel gerada com três abas, filtros mensais e resumo de horas extras.", "success");
  }

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

  serviceType.addEventListener("change", () => {
    toggleRouteFields();
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
  clearFilterButton.addEventListener("click", () => {
    monthFilter.value = "";
    renderRecords();
  });
  exportButton.addEventListener("click", exportExcel);
  exportCsvButton.addEventListener("click", exportCsv);
  printButton.addEventListener("click", () => window.print());

  document.getElementById("todayLabel").textContent = formatLongDate(new Date());
  startDateInput.value = localDateString();
  endDateInput.value = localDateString();
  toggleRouteFields();
  updateDurationPreview();
  renderRecords();
})();
