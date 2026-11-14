"use strict";
const assert = require("node:assert/strict");
const ScheduleEngine = require("../assets/js/schedule-engine.js");
function config(type, extra) {
  return ScheduleEngine.normalizeConfig({
    registration: "TESTE", type, anchorDate: "2026-11-10", startTime: "08:00",
    durationMinutes: 480, intervalMinutes: 60, workDays: 2, restDays: 2, ...(extra || {})
  });
}
assert.equal(ScheduleEngine.isValidDateString("2024-02-29"), true);
assert.equal(ScheduleEngine.isValidDateString("2026-02-29"), false);
assert.equal(ScheduleEngine.isValidDateString("2026-13-01"), false);
const fiveTwo = ScheduleEngine.buildForecast(config("5x2"), "2026-11-10", 7, {});
assert.deepEqual(fiveTwo.map((day) => day.kind), ["work","work","work","work","work","rest","rest"]);
assert.equal(fiveTwo[0].netMinutes, 420);
const sixOne = ScheduleEngine.buildForecast(config("6x1"), "2026-11-10", 7, {});
assert.deepEqual(sixOne.map((day) => day.kind), ["work","work","work","work","work","work","rest"]);
const custom = ScheduleEngine.buildForecast(config("custom"), "2026-11-10", 8, {});
assert.deepEqual(custom.map((day) => day.kind), ["work","work","rest","rest","work","work","rest","rest"]);
const twelveConfig = config("12x36", { startTime: "18:00", durationMinutes: 600, intervalMinutes: 60 });
assert.equal(twelveConfig.durationMinutes, 720);
const twelve = ScheduleEngine.buildForecast(twelveConfig, "2026-11-10", 5, {});
assert.deepEqual(twelve.map((day) => day.kind), ["work","continuation","work","continuation","work"]);
assert.equal(twelve[0].startTime, "18:00");
assert.equal(twelve[1].endTime, "06:00");
assert.equal(twelve[2].startTime, "18:00");
const dayShift = ScheduleEngine.buildForecast(config("12x36", { startTime: "08:00" }), "2026-11-10", 4, {});
assert.deepEqual(dayShift.map((day) => day.kind), ["work","rest","work","rest"]);
const withRecords = ScheduleEngine.buildForecast(config("6x1"), "2026-11-10", 7, { "2026-11-10": 2 });
assert.equal(withRecords[0].statusKey, "recorded");
assert.equal(withRecords[0].recordCount, 2);
assert.equal(withRecords[6].statusKey, "rest");
assert.throws(() => config("custom", { workDays: 0, restDays: 2 }), /dias de trabalho e descanso/);
assert.throws(() => config("5x2", { intervalMinutes: 480 }), /intervalo/);
assert.throws(() => ScheduleEngine.buildForecast(config("5x2"), "2026-02-30", 30, {}), /data inicial válida/);
assert.throws(() => ScheduleEngine.buildForecast(config("5x2"), "2026-11-10", 91, {}), /entre 1 e 90 dias/);
console.log("Schedule tests passed: ciclos 5x2, 6x1, 12x36, personalizado e validações.");
