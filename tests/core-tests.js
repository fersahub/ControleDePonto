const assert = require("node:assert/strict");
const TimeEngine = require("../assets/js/time-engine.js");

const make = (id, startDate, startTime, endDate, endTime, interval = "", serviceType = "Plantão", registration = "A") => ({
  id, registration, startDate, startTime, endDate, endTime, interval, serviceType
});

const schedules = { A: 440, B: 480, C: 360, D: 1439 };
const getTarget = (registration) => TimeEngine.getDailyTargetMinutes(registration, schedules);

assert.equal(TimeEngine.normalizeRegistration("  abc  123 "), "ABC 123");
assert.equal(TimeEngine.isValidDateString("2024-02-29"), true);
assert.equal(TimeEngine.isValidDateString("2026-02-29"), false);
assert.equal(TimeEngine.isValidDateString("2026-13-01"), false);
assert.equal(TimeEngine.isValidDateString("01/11/2026"), false);
assert.equal(TimeEngine.parseLocalDateTime("2026-02-30", "08:00"), null);
assert.equal(TimeEngine.parseLocalDateTime("2026-11-13", "24:00"), null);

assert.equal(TimeEngine.parseIntervalMinutes("01:30"), 90);
assert.equal(TimeEngine.parseIntervalMinutes("1,5h"), 90);
assert.equal(TimeEngine.parseIntervalMinutes("45 min"), 45);
assert.equal(TimeEngine.parseIntervalMinutes("12:00 às 13:00"), 60);
assert.equal(TimeEngine.parseIntervalMinutes("23:00–01:00"), 120);
assert.equal(TimeEngine.parseIntervalMinutes("texto inválido"), null);
assert.equal(TimeEngine.parseIntervalMinutes("01:60"), null);

const exact = make("exact", "2026-11-01", "08:00", "2026-11-01", "15:20");
let metrics = TimeEngine.calculateDailyMetrics([exact], getTarget).get(exact);
assert.equal(metrics.workedMinutes, 440);
assert.equal(metrics.regularMinutes, 440);
assert.equal(metrics.overtimeMinutes, 0);

const overtime = make("overtime", "2026-11-02", "08:00", "2026-11-02", "16:00");
metrics = TimeEngine.calculateDailyMetrics([overtime], getTarget).get(overtime);
assert.equal(metrics.workedMinutes, 480);
assert.equal(metrics.overtimeMinutes, 40);

const personalized = make("personalized", "2026-11-03", "08:00", "2026-11-03", "17:00", "", "Plantão", "B");
metrics = TimeEngine.calculateDailyMetrics([personalized], getTarget).get(personalized);
assert.equal(metrics.regularMinutes, 480);
assert.equal(metrics.overtimeMinutes, 60);

const splitFirst = make("first", "2026-11-04", "06:00", "2026-11-04", "10:00");
const splitSecond = make("second", "2026-11-04", "11:00", "2026-11-04", "15:00");
const split = TimeEngine.calculateDailyMetrics([splitSecond, splitFirst], getTarget);
assert.equal(split.get(splitFirst).regularMinutes, 240);
assert.equal(split.get(splitSecond).regularMinutes, 200);
assert.equal(split.get(splitSecond).overtimeMinutes, 40);

const otherRegistration = make("other", "2026-11-04", "06:00", "2026-11-04", "15:00", "", "Plantão", "C");
const independent = TimeEngine.calculateDailyMetrics([splitFirst, splitSecond, otherRegistration], getTarget);
assert.equal(independent.get(otherRegistration).regularMinutes, 360);
assert.equal(independent.get(otherRegistration).overtimeMinutes, 180);

const newDay = make("new-day", "2026-11-05", "08:00", "2026-11-05", "16:00");
metrics = TimeEngine.calculateDailyMetrics([splitFirst, splitSecond, newDay], getTarget).get(newDay);
assert.equal(metrics.regularMinutes, 440);
assert.equal(metrics.overtimeMinutes, 40);

const withBreak = make("break", "2026-11-06", "08:00", "2026-11-06", "17:00", "01:00");
metrics = TimeEngine.calculateDailyMetrics([withBreak], getTarget).get(withBreak);
assert.equal(metrics.elapsedMinutes, 540);
assert.equal(metrics.intervalMinutes, 60);
assert.equal(metrics.workedMinutes, 480);
assert.equal(metrics.overtimeMinutes, 40);

const overnight = make("overnight", "2026-11-07", "22:00", "2026-11-08", "06:00", "01:00");
metrics = TimeEngine.calculateDailyMetrics([overnight], getTarget).get(overnight);
assert.equal(metrics.workedMinutes, 420);
assert.equal(metrics.overtimeMinutes, 0);
assert.equal(metrics.dailyWorkedMinutes, 420);

const intervalRecord = make("interval", "2026-11-09", "12:00", "2026-11-09", "13:00", "", "Intervalo");
const folgaRecord = make("folga", "2026-11-10", "", "", "", "", "Folga");
const special = TimeEngine.calculateDailyMetrics([intervalRecord, folgaRecord], getTarget);
assert.equal(special.get(intervalRecord).workedMinutes, 0);
assert.equal(special.get(intervalRecord).overtimeMinutes, 0);
assert.equal(special.get(folgaRecord).workedMinutes, 0);
assert.equal(special.get(folgaRecord).regularMinutes, 0);

const invalidEnd = make("bad-end", "2026-11-11", "10:00", "2026-11-11", "09:00");
assert.match(TimeEngine.getWorkMetrics(invalidEnd).error, /posteriores/);
const invalidDate = make("bad-date", "2026-02-30", "08:00", "2026-02-30", "17:00");
assert.ok(TimeEngine.getWorkMetrics(invalidDate).error);
const excessiveBreak = make("bad-break", "2026-11-12", "08:00", "2026-11-12", "16:00", "09:00");
assert.match(TimeEngine.getWorkMetrics(excessiveBreak).error, /maior que o período/);
assert.equal(TimeEngine.getDailyTargetMinutes("unknown", schedules), 440);
assert.equal(TimeEngine.getDailyTargetMinutes("D", schedules), 1439);
assert.equal(TimeEngine.getDailyTargetMinutes("x", { X: 0 }), 440);
assert.equal(TimeEngine.getDailyTargetMinutes("x", { X: 1440 }), 440);

console.log("Core tests passed: 38 assertions.");
