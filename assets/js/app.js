"use strict";

(() => {
  const STORAGE_KEY = "controleDePonto.registros.v1";
  const form = document.getElementById("timeForm");
  const routeFields = document.getElementById("routeFields");
  const serviceType = document.getElementById("serviceType");
  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");
  const startDateInput = document.getElementById("startDate");
  const startTimeInput = document.getElementById("startTime");
  const endDateInput = document.getElementById("endDate");
  const endTimeInput = document.getElementById("endTime");
  const durationPreview = document.getElementById("durationPreview");
  const feedback = document.getElementById("formFeedback");
  const recordsBody = document.getElementById("recordsBody");
  const exportButton = document.getElementById("exportButton");
  const printButton = document.getElementById("printButton");

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
    return `${year}-${month}-${day}`;
  }

  function parseLocalDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    const date = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatDuration(startDate, startTime, endDate, endTime) {
    const start = parseLocalDateTime(startDate, startTime);
    const end = parseLocalDateTime(endDate, endTime);
    if (!start || !end || end <= start) return "—";
    const totalMinutes = Math.floor((end - start) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  }

  function formatLongDate(date) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `feedback is-visible is-${type}`;
  }

  function clearFeedback() {
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function toggleRouteFields() {
    const isTrip = serviceType.value === "Viagem";
    routeFields.classList.toggle("is-hidden", !isTrip);
    routeFields.setAttribute("aria-hidden", String(!isTrip));
    originInput.disabled = !isTrip;
    destinationInput.disabled = !isTrip;
    originInput.required = isTrip;
    destinationInput.required = isTrip;

    if (!isTrip) {
      originInput.value = "";
      destinationInput.value = "";
    }
  }

  function updateDurationPreview() {
    const start = parseLocalDateTime(startDateInput.value, startTimeInput.value);
    const end = parseLocalDateTime(endDateInput.value, endTimeInput.value);
    if (!start || !end) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = "Preencha as datas e os horários para visualizar a duração da jornada.";
      return;
    }
    if (end <= start) {
      durationPreview.classList.remove("is-ready");
      durationPreview.textContent = "A data e o horário finais precisam ser posteriores ao início.";
      return;
    }
    durationPreview.classList.add("is-ready");
    durationPreview.textContent = `Duração entre início e término: ${formatDuration(startDateInput.value, startTimeInput.value, endDateInput.value, endTimeInput.value)}`;
  }

  function getFormData() {
    const data = new FormData(form);
    return {
      id: (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : `registro-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fullName: String(data.get("fullName") || "").trim(),
      registration: String(data.get("registration") || "").trim(),
      startDate: String(data.get("startDate") || ""),
      startTime: String(data.get("startTime") || ""),
      interval: String(data.get("interval") || "").trim(),
      endDate: String(data.get("endDate") || ""),
      endTime: String(data.get("endTime") || ""),
      vehicleOrder: String(data.get("vehicleOrder") || "").trim(),
      plate: String(data.get("plate") || "").trim().toUpperCase(),
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
      ["Nº de ordem do veículo", record.vehicleOrder],
      ["Placa", record.plate],
      ["Tipo de serviço", record.serviceType]
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) return `Preencha o campo obrigatório: ${missing[0]}.`;
    if (record.serviceType !== "Plantão" && record.serviceType !== "Viagem") return "Selecione Plantão ou Viagem.";
    if (record.serviceType === "Viagem" && (!record.origin || !record.destination)) return "Informe a origem e o destino da viagem.";
    const start = parseLocalDateTime(record.startDate, record.startTime);
    const end = parseLocalDateTime(record.endDate, record.endTime);
    if (!start || !end) return "Confira as datas e os horários informados.";
    if (end <= start) return "A data e o horário finais devem ser posteriores ao início.";
    return "";
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

  function renderRecords() {
    recordsBody.replaceChildren();

    if (records.length === 0) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 6;
      const state = document.createElement("div");
      state.className = "empty-state";
      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "▤";
      const title = document.createElement("strong");
      title.textContent = "Nenhum lançamento por enquanto";
      const description = document.createElement("small");
      description.textContent = "Os registros adicionados no formulário aparecerão aqui.";
      state.append(icon, title, description);
      cell.append(state);
      row.append(cell);
      recordsBody.append(row);
    } else {
      [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).forEach((record) => {
        const row = document.createElement("tr");

        const person = createStackCell(record.fullName || "—", `Matrícula: ${record.registration || "—"}`, "person-cell");
        row.append(person);

        row.append(createStackCell(formatDate(record.startDate), `${record.startTime || "—"} → ${formatDate(record.endDate)} ${record.endTime || ""}`, "date-cell"));

        const serviceCell = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = `service-pill ${record.serviceType === "Plantão" ? "plantao" : ""}`;
        pill.textContent = record.serviceType || "—";
        serviceCell.append(pill);
        if (record.serviceType === "Viagem") {
          const route = document.createElement("small");
          route.textContent = `${record.origin || "—"} → ${record.destination || "—"}`;
          route.style.display = "block";
          route.style.marginTop = "4px";
          route.style.color = "#98a3b0";
          route.style.fontSize = "9px";
          serviceCell.append(route);
        }
        row.append(serviceCell);

        row.append(createStackCell(record.vehicleOrder || "—", record.plate || "—", "vehicle-cell"));
        row.append(createCell(formatDuration(record.startDate, record.startTime, record.endDate, record.endTime), "duration-cell"));

        const actionCell = document.createElement("td");
        actionCell.className = "action-cell";
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "delete-button";
        removeButton.dataset.deleteId = record.id;
        removeButton.textContent = "Excluir";
        removeButton.setAttribute("aria-label", `Excluir lançamento de ${record.fullName || "colaborador"}`);
        actionCell.append(removeButton);
        row.append(actionCell);

        recordsBody.append(row);
      });
    }

    const today = localDateString();
    document.getElementById("totalRecords").textContent = String(records.length);
    document.getElementById("todayRecords").textContent = String(records.filter((item) => item.startDate === today).length);
    document.getElementById("vehicleCount").textContent = String(new Set(records.map((item) => (item.plate || "").toUpperCase()).filter(Boolean)).size);
    document.getElementById("recordCount").textContent = `${records.length} ${records.length === 1 ? "registro" : "registros"}`;

    if (records.length) {
      const newest = [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      const date = newest.createdAt ? new Date(newest.createdAt) : null;
      document.getElementById("lastUpdated").textContent = date && !Number.isNaN(date.getTime())
        ? `Último lançamento: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)}`
        : "Histórico atualizado";
    } else {
      document.getElementById("lastUpdated").textContent = "Nenhum registro salvo";
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (records.length === 0) {
      showFeedback("Ainda não há lançamentos para exportar.", "error");
      return;
    }
    const headers = [
      "Nome completo", "Matrícula", "Data inicial", "Horário inicial", "Intervalo",
      "Data final", "Horário final", "Nº de ordem do veículo", "Placa", "Tipo de serviço",
      "Origem", "Destino", "Duração"
    ];
    const rows = records.map((record) => [
      record.fullName, record.registration, formatDate(record.startDate), record.startTime,
      record.interval, formatDate(record.endDate), record.endTime, record.vehicleOrder,
      record.plate, record.serviceType, record.origin, record.destination,
      formatDuration(record.startDate, record.startTime, record.endDate, record.endTime)
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `controle-de-ponto-${localDateString()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showFeedback("Arquivo CSV gerado. Você pode abri-lo no Excel ou importá-lo no Google Sheets.", "success");
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

    records.push(record);
    if (!persistRecords()) {
      records.pop();
      return;
    }

    renderRecords();
    form.reset();
    toggleRouteFields();
    updateDurationPreview();
    showFeedback("Lançamento salvo com sucesso neste navegador.", "success");
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      clearFeedback();
      toggleRouteFields();
      updateDurationPreview();
    }, 0);
  });

  serviceType.addEventListener("change", () => {
    toggleRouteFields();
    clearFeedback();
  });

  [startDateInput, startTimeInput, endDateInput, endTimeInput].forEach((input) => {
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
    if (!window.confirm(`Deseja excluir o lançamento de ${record.fullName || "colaborador"}?`)) return;
    records = records.filter((item) => item.id !== button.dataset.deleteId);
    if (persistRecords()) {
      renderRecords();
      showFeedback("Lançamento excluído do histórico local.", "success");
    }
  });

  exportButton.addEventListener("click", exportCsv);
  printButton.addEventListener("click", () => window.print());

  document.getElementById("todayLabel").textContent = formatLongDate(new Date());
  startDateInput.value = localDateString();
  endDateInput.value = localDateString();
  toggleRouteFields();
  updateDurationPreview();
  renderRecords();
})();
