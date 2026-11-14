"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TimeEngine = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  const DEFAULT_DAILY_TARGET_MINUTES = 440;

  function normalizeRegistration(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  }

  function isValidDateString(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function parseLocalDateTime(dateValue, timeValue) {
    if (!isValidDateString(dateValue) || typeof timeValue !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) return null;
    const date = new Date(dateValue + "T" + timeValue + ":00");
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== Number(dateValue.slice(0, 4)) ||
        date.getMonth() !== Number(dateValue.slice(5, 7)) - 1 ||
        date.getDate() !== Number(dateValue.slice(8, 10))) return null;
    return date;
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

  function getDailyTargetMinutes(registration, schedules, fallback = DEFAULT_DAILY_TARGET_MINUTES) {
    const safeSchedules = schedules && typeof schedules === "object" && !Array.isArray(schedules) ? schedules : {};
    const value = Number(safeSchedules[normalizeRegistration(registration)]);
    return Number.isInteger(value) && value > 0 && value < 1440 ? value : fallback;
  }

  function getWorkMetrics(record, defaultTarget = DEFAULT_DAILY_TARGET_MINUTES) {
    if (record.serviceType === "Intervalo" || record.serviceType === "Folga") {
      return { elapsedMinutes: 0, intervalMinutes: 0, workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0 };
    }
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
    const regularMinutes = Math.min(workedMinutes, defaultTarget);
    const overtimeMinutes = Math.max(0, workedMinutes - defaultTarget);
    return { elapsedMinutes, intervalMinutes, workedMinutes, regularMinutes, overtimeMinutes };
  }

  function calculateDailyMetrics(sourceRecords, getTargetForRegistration) {
    const result = new Map();
    const dailyTotals = new Map();
    const ordered = [...sourceRecords].sort((a, b) => {
      const left = (a.startDate || "") + " " + (a.startTime || "");
      const right = (b.startDate || "") + " " + (b.startTime || "");
      return left.localeCompare(right);
    });

    ordered.forEach((record) => {
      const rawMetrics = getWorkMetrics(record);
      if (rawMetrics.error) {
        result.set(record, rawMetrics);
        return;
      }
      if (record.serviceType === "Intervalo" || record.serviceType === "Folga") {
        result.set(record, { ...rawMetrics, dailyWorkedMinutes: 0, dailyOvertimeMinutes: 0 });
        return;
      }

      const dailyKey = normalizeRegistration(record.registration) + "|" + (record.startDate || "");
      const alreadyAllocated = dailyTotals.get(dailyKey) || 0;
      const dailyTarget = getTargetForRegistration(record.registration);
      const regularMinutes = Math.min(rawMetrics.workedMinutes, Math.max(0, dailyTarget - alreadyAllocated));
      const overtimeMinutes = rawMetrics.workedMinutes - regularMinutes;
      const dailyWorkedMinutes = alreadyAllocated + rawMetrics.workedMinutes;
      dailyTotals.set(dailyKey, dailyWorkedMinutes);
      result.set(record, {
        ...rawMetrics,
        regularMinutes,
        overtimeMinutes,
        dailyWorkedMinutes,
        dailyOvertimeMinutes: Math.max(0, dailyWorkedMinutes - dailyTarget)
      });
    });

    return result;
  }

  return {
    DEFAULT_DAILY_TARGET_MINUTES,
    normalizeRegistration,
    isValidDateString,
    parseLocalDateTime,
    parseIntervalMinutes,
    getDailyTargetMinutes,
    getWorkMetrics,
    calculateDailyMetrics
  };
});
