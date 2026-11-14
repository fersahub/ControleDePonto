"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScheduleEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAY_MS = 86400000;
  const MINUTE_MS = 60000;
  const TYPES = ["5x2", "6x1", "12x36", "custom"];

  function parseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day, index: Math.floor(date.getTime() / DAY_MS) };
  }

  function isValidDateString(value) { return !!parseDate(value); }
  function dateFromIndex(index) { return new Date(index * DAY_MS).toISOString().slice(0, 10); }
  function localDateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function parseTime(value) {
    const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  function localDateTime(dateString, timeString) {
    const parts = parseDate(dateString), minutes = parseTime(timeString);
    if (!parts || minutes === null) return null;
    return new Date(parts.year, parts.month - 1, parts.day, Math.floor(minutes / 60), minutes % 60, 0, 0);
  }
  function dayBounds(dateString) {
    const parts = parseDate(dateString);
    if (!parts) return null;
    return {
      start: new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0),
      end: new Date(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0, 0)
    };
  }
  function formatTime(date) {
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  }
  function formatDuration(minutes) {
    return Math.floor(minutes / 60) + "h" + String(minutes % 60).padStart(2, "0");
  }
  function typeLabel(type) {
    return ({ "5x2": "5x2", "6x1": "6x1", "12x36": "12x36", custom: "Personalizada" })[type] || type;
  }

  function normalizeConfig(raw, registrationOverride) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Configuração de escala inválida.");
    const registration = String(registrationOverride || raw.registration || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!registration) throw new Error("Informe a matrícula para configurar a escala.");
    const type = String(raw.type || "");
    if (!TYPES.includes(type)) throw new Error("Selecione um tipo de escala válido.");
    if (!isValidDateString(raw.anchorDate)) throw new Error("Informe uma data-base válida.");
    const startTime = String(raw.startTime || "");
    if (parseTime(startTime) === null) throw new Error("Informe um horário de entrada válido.");
    let durationMinutes = Number(raw.durationMinutes);
    const intervalMinutes = Number(raw.intervalMinutes || 0);
    let workDays = 0, restDays = 0;
    if (type === "12x36") {
      durationMinutes = 720;
      workDays = 1;
      restDays = 1;
    } else if (type === "5x2") {
      durationMinutes = Number.isInteger(durationMinutes) ? durationMinutes : 480;
      workDays = 5;
      restDays = 2;
    } else if (type === "6x1") {
      durationMinutes = Number.isInteger(durationMinutes) ? durationMinutes : 480;
      workDays = 6;
      restDays = 1;
    } else {
      workDays = Number(raw.workDays);
      restDays = Number(raw.restDays);
      if (!Number.isInteger(workDays) || workDays < 1 || workDays > 31 ||
          !Number.isInteger(restDays) || restDays < 1 || restDays > 31) {
        throw new Error("Na escala personalizada, os dias de trabalho e descanso devem ficar entre 1 e 31.");
      }
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1439) {
      throw new Error("A duração do turno deve ser maior que zero e inferior a 24 horas.");
    }
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes >= durationMinutes) {
      throw new Error("O intervalo precisa ser igual ou maior que zero e menor que a duração do turno.");
    }
    return {
      registration, type, anchorDate: String(raw.anchorDate), startTime,
      durationMinutes, intervalMinutes, workDays, restDays
    };
  }

  function buildForecast(rawConfig, startDate, count, recordCounts) {
    const config = normalizeConfig(rawConfig);
    const startParts = parseDate(startDate);
    if (!startParts) throw new Error("Escolha uma data inicial válida para a projeção.");
    if (!Number.isInteger(count) || count < 1 || count > 90) throw new Error("A projeção deve ter entre 1 e 90 dias.");
    const today = localDateKey(new Date());
    const lastDate = dateFromIndex(startParts.index + count - 1);
    const rangeStart = dayBounds(startDate).start.getTime();
    const rangeEnd = dayBounds(lastDate).end.getTime();
    const shifts = [];
    const anchorIndex = parseDate(config.anchorDate).index;
    const anchorDateTime = localDateTime(config.anchorDate, config.startTime);

    if (config.type === "12x36") {
      const stepMs = 48 * 60 * MINUTE_MS;
      const durationMs = 12 * 60 * MINUTE_MS;
      const firstK = Math.max(0, Math.floor((rangeStart - durationMs - anchorDateTime.getTime()) / stepMs) - 1);
      const lastK = Math.ceil((rangeEnd - anchorDateTime.getTime()) / stepMs) + 1;
      for (let k = firstK; k <= lastK; k += 1) {
        const start = new Date(anchorDateTime.getTime() + k * stepMs);
        const end = new Date(start.getTime() + durationMs);
        if (start.getTime() < rangeEnd && end.getTime() > rangeStart) shifts.push({ start, end });
      }
    } else {
      const cycleLength = config.workDays + config.restDays;
      const firstIndex = Math.max(anchorIndex, startParts.index - 1);
      const lastIndex = startParts.index + count - 1;
      for (let dayIndex = firstIndex; dayIndex <= lastIndex; dayIndex += 1) {
        const offset = dayIndex - anchorIndex;
        if (offset % cycleLength >= config.workDays) continue;
        const start = localDateTime(dateFromIndex(dayIndex), config.startTime);
        const end = new Date(start.getTime() + config.durationMinutes * MINUTE_MS);
        if (start.getTime() < rangeEnd && end.getTime() > rangeStart) shifts.push({ start, end });
      }
    }

    const rows = [];
    const counts = recordCounts && typeof recordCounts === "object" ? recordCounts : {};
    for (let offset = 0; offset < count; offset += 1) {
      const date = dateFromIndex(startParts.index + offset);
      const bounds = dayBounds(date);
      const matches = shifts.filter((shift) => shift.start.getTime() < bounds.end.getTime() && shift.end.getTime() > bounds.start.getTime());
      const shift = matches.find((item) => localDateKey(item.start) === date) || matches[0] || null;
      const startsToday = !!shift && localDateKey(shift.start) === date;
      const continues = !!shift && !startsToday;
      const recordCount = Math.max(0, Number(counts[date] || 0) || 0);
      let kind = "rest", statusKey = "rest", status = "Descanso", detail = "Descanso programado", netMinutes = 0;
      if (!shift && date < config.anchorDate) {
        kind = "not-started"; statusKey = "not-started"; status = "Aguardando início"; detail = "A escala ainda não começou";
      } else if (startsToday) {
        kind = "work";
        netMinutes = Math.max(0, config.durationMinutes - config.intervalMinutes);
        detail = "Entrada " + formatTime(shift.start) + " · saída " + formatTime(shift.end) + " · " + formatDuration(netMinutes) + " líquidas";
        if (config.intervalMinutes > 0) detail += " · pausa " + formatDuration(config.intervalMinutes);
        if (recordCount > 0) {
          statusKey = "recorded"; status = recordCount + (recordCount === 1 ? " lançamento" : " lançamentos");
        } else if (date < today) {
          statusKey = "missing"; status = "Sem lançamento";
        } else if (date === today) {
          statusKey = "today"; status = "Hoje";
        } else {
          statusKey = "planned"; status = "Previsto";
        }
      } else if (continues) {
        kind = "continuation"; netMinutes = Math.max(0, config.durationMinutes - config.intervalMinutes);
        detail = "Continuação do turno · saída " + formatTime(shift.end);
        statusKey = "continuation"; status = "Continuação";
      } else if (recordCount > 0) {
        statusKey = "rest-recorded";
        status = recordCount + (recordCount === 1 ? " lançamento em descanso" : " lançamentos em descanso");
      }
      if (recordCount > 0 && (kind === "rest" || kind === "not-started")) detail += " · há registro nesta data";
      rows.push({
        date, kind, statusKey, status, detail, recordCount,
        startTime: shift ? formatTime(shift.start) : "",
        endTime: shift ? formatTime(shift.end) : "",
        durationMinutes: shift ? config.durationMinutes : 0,
        netMinutes
      });
    }
    return rows;
  }

  return { isValidDateString, normalizeConfig, buildForecast, typeLabel, formatDuration };
});
