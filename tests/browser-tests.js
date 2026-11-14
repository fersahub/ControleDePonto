"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname.replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (error, content) => {
      if (error) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(content);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    resolve({ server, url: "http://127.0.0.1:" + address.port + "/" });
  }));
}

async function run() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  let assertions = 0;
  const check = (condition, message) => {
    assertions += 1;
    assert.ok(condition, message);
  };

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#timeForm");
    check(await page.title() === "Meu Controle de Jornada", "Título da versão pessoal");
    check(await page.locator("#schedulePreset").count() === 1, "Seção de jornada personalizada visível");
    check(await page.evaluate(() => !!window.TimeEngine), "Motor de cálculo carregado antes do app");
    check(await page.locator(".dashboard-intro").count() === 1, "Resumo visual do dashboard presente");
    check(await page.locator("#activityCalendarPanel").count() === 1, "Calendário mensal da jornada presente");
    check(await page.locator("#activityTimeline").count() === 1, "Linha do tempo diária presente");
    check(await page.locator("#dashboardWeekBars .dashboard-week-row").count() === 7, "Resumo visual dos últimos sete dias");
    const desktopVisuals = await page.evaluate(() => ({
      navDisplay: getComputedStyle(document.querySelector(".side-nav")).display,
      navLinkDecoration: getComputedStyle(document.querySelector(".side-nav-link")).textDecorationLine,
      introDisplay: getComputedStyle(document.querySelector(".dashboard-intro")).display,
      introBorder: getComputedStyle(document.querySelector(".dashboard-intro")).borderTopStyle,
      navPosition: getComputedStyle(document.querySelector(".side-nav")).position,
      headerPosition: getComputedStyle(document.querySelector(".topbar")).position
    }));
    check(desktopVisuals.navDisplay === "flex", "Navegação lateral realmente estilizada: " + JSON.stringify(desktopVisuals));
    check(desktopVisuals.navLinkDecoration === "none", "Links do menu sem sublinhado padrão");
    check(desktopVisuals.introDisplay === "grid" && desktopVisuals.introBorder === "solid", "Painel de resumo com grade e contorno visual");
    check(desktopVisuals.navPosition === "fixed", "Menu lateral permanece fixo em telas de computador: " + JSON.stringify(desktopVisuals));
    check(desktopVisuals.headerPosition === "sticky", "Cabeçalho permanece acessível durante a rolagem");
    await page.evaluate(() => window.scrollTo(0, 500));
    const fixedNavigation = await page.evaluate(() => ({
      navTop: Math.round(document.querySelector(".side-nav").getBoundingClientRect().top),
      headerTop: Math.round(document.querySelector(".topbar").getBoundingClientRect().top)
    }));
    check(fixedNavigation.navTop === 108 && fixedNavigation.headerTop === 0, "Menu e cabeçalho permanecem visíveis ao rolar: " + JSON.stringify(fixedNavigation));
    await page.evaluate(() => window.scrollTo(0, 0));
    check(await page.locator(".dashboard-intro-actions a[href='#newRecordPanel']").count() === 1, "Ação rápida para novo lançamento");
    check(await page.locator(".dashboard-intro-actions a[href='#recordsPanel']").count() === 1, "Ação rápida para histórico");
    check(await page.locator(".stat-card").count() === 4, "Quatro indicadores originais preservados");
    check(await page.locator(".stat-card .stat-value").count() === 4, "Valores dos indicadores preservados");

    check(await page.locator(".side-nav").count() === 1, "Navegação lateral presente");
    for (const target of ["#overview", "#scheduleTitle", "#shiftPlannerPanel", "#newRecordPanel", "#recordsPanel", "#individualReportPanel", "#backupTitle"]) {
      check(await page.locator('.side-nav a[href="' + target + '"]').count() === 1, "Atalho de navegação válido: " + target);
      check(await page.locator(target).count() === 1, "Destino da navegação existe: " + target);
    }


    // Custom daily target and a shift with deducted break.
    await page.locator("#scheduleRegistration").fill("TESTE-001");
    await page.locator("#schedulePreset").selectOption("custom");
    await page.locator("#customScheduleTime").fill("08:00");
    const beforeScheduleSave = await page.evaluate(() => ({
      preset: document.querySelector("#schedulePreset").value,
      customValue: document.querySelector("#customScheduleTime").value
    }));
    check(beforeScheduleSave.preset === "custom" && beforeScheduleSave.customValue === "08:00", "Campo personalizado preservado antes de salvar: " + JSON.stringify(beforeScheduleSave));
    await page.locator("#saveScheduleButton").click();
    const scheduleResult = await page.evaluate(() => ({
      feedback: document.querySelector("#scheduleFeedback").textContent,
      customValue: document.querySelector("#customScheduleTime").value,
      preset: document.querySelector("#schedulePreset").value,
      saved: JSON.parse(localStorage.getItem("controleDePonto.jornadas.v1") || "{}")
    }));
    check(scheduleResult.saved["TESTE-001"] === 480, "Jornada personalizada salva: " + JSON.stringify(scheduleResult));

    // Planner saves and projects independent work/rest cycles.
    await page.locator("#shiftScheduleRegistration").fill("PLAN-001");
    await page.locator("#shiftScheduleType").selectOption("6x1");
    await page.locator("#shiftAnchorDate").fill("2026-11-10");
    await page.locator("#shiftStartTime").fill("08:00");
    await page.locator("#shiftDuration").fill("08:00");
    await page.locator("#shiftInterval").fill("01:00");
    await page.locator("#planCalendarStartDate").fill("2026-11-10");
    await page.locator("#saveShiftScheduleButton").click();
    const sixOnePlanner = await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem("controleDePonto.escalas.v1") || "{}")["PLAN-001"],
      kinds: [...document.querySelectorAll("#shiftCalendarBody tr")].slice(0, 7).map((row) => row.dataset.kind)
    }));
    check(sixOnePlanner.saved.type === "6x1", "Planejador salva escala separada por matrícula");
    await page.locator("#activityRegistration").selectOption("PLAN-001");
    await page.locator("#activityMonth").fill("2026-11");
    check(await page.locator("#activityCalendarGrid button[data-date='2026-11-10']").count() === 1, "Calendário inclui o dia planejado da escala salva");
    check((await page.locator("#activityCalendarNote").textContent()).includes("integrada ao calendário"), "Calendário informa integração da escala");
    check(JSON.stringify(sixOnePlanner.kinds) === JSON.stringify(["work","work","work","work","work","work","rest"]), "Calendário projeta o ciclo 6x1");

    await page.locator("#shiftScheduleRegistration").fill("PLAN-12");
    await page.locator("#shiftScheduleType").selectOption("12x36");
    await page.locator("#shiftAnchorDate").fill("2026-11-10");
    await page.locator("#shiftStartTime").fill("18:00");
    await page.locator("#planCalendarStartDate").fill("2026-11-10");
    check(await page.locator("#shiftDuration").inputValue() === "12:00" && await page.locator("#shiftDuration").isDisabled(), "12x36 fixa o turno em 12 horas");
    await page.locator("#saveShiftScheduleButton").click();
    const twelvePlanner = await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem("controleDePonto.escalas.v1") || "{}")["PLAN-12"],
      kinds: [...document.querySelectorAll("#shiftCalendarBody tr")].slice(0, 5).map((row) => row.dataset.kind)
    }));
    check(twelvePlanner.saved.durationMinutes === 720, "12x36 salva duração de 12 horas");
    check(JSON.stringify(twelvePlanner.kinds) === JSON.stringify(["work","continuation","work","continuation","work"]), "Calendário identifica turnos noturnos e continuações no 12x36");

    // Required-field validation must stop an incomplete record.
    await page.locator("#serviceType").selectOption("Plantão");
    await page.locator("#startDate").fill("2026-11-12");
    await page.locator("#startTime").fill("08:00");
    await page.locator("#endDate").fill("2026-11-12");
    await page.locator("#endTime").fill("17:00");
    await page.locator("#interval").fill("01:00");
    await submit();
    check((await page.locator("#formFeedback").textContent()).includes("Nome completo"), "Formulário rejeita identificação incompleta");
    await fillIdentity();

    async function fillIdentity() {
      await page.locator("#fullName").fill("Pessoa de Teste");
      await page.locator("#registration").fill("TESTE-001");
    }
    async function fillDates(date, start, end) {
      await page.locator("#startDate").fill(date);
      await page.locator("#startTime").fill(start);
      await page.locator("#endDate").fill(date);
      await page.locator("#endTime").fill(end);
    }
    async function submit() {
      await page.locator('#timeForm button[type="submit"]').click();
    }

    await fillIdentity();
    await page.locator("#serviceType").selectOption("Plantão");
    await fillDates("2026-11-12", "08:00", "17:00");
    await page.locator("#interval").fill("01:00");
    await submit();
    let records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 1, "Plantão salvo");
    check(records[0].interval === "01:00", "Intervalo descontado armazenado");
    await page.locator("#activityRegistration").selectOption("TESTE-001");
    await page.locator("#activityMonth").fill("2026-11");
    await page.locator("#activityCalendarGrid button[data-date='2026-11-12']").click();
    check(await page.locator(".activity-timeline-entry").count() === 1, "Linha do tempo mostra o lançamento do dia selecionado");
    check((await page.locator("#activityDayWorked").textContent()).includes("8h 00min"), "Resumo diário usa a jornada líquida calculada");
    check((await page.locator("#activityDayRecords").textContent()) === "1", "Resumo diário conta os lançamentos da matrícula selecionada");

    // Duplicate periods require explicit confirmation; cancelling must preserve the unsaved form.
    await fillIdentity();
    await page.locator("#serviceType").selectOption("Plantão");
    await fillDates("2026-11-12", "08:00", "17:00");
    await page.locator("#interval").fill("01:00");
    page.once("dialog", (dialog) => dialog.dismiss());
    await submit();
    records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 1, "Duplicidade cancelada não grava registro");
    check((await page.locator("#formFeedback").textContent()).includes("cancelada"), "Cancelamento de duplicidade informado");

    // The 8h target is shared by all shifts in the same day. The second shift is fully overtime.
    await fillIdentity();
    await page.locator("#serviceType").selectOption("Plantão");
    await fillDates("2026-11-12", "18:00", "19:00");
    await page.locator("#interval").fill("");
    await submit();
    records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 2, "Segundo lançamento sequencial permitido");
    check(await page.locator("#recordsBody tr").count() === 2, "Histórico atualiza com dois lançamentos");

    // Folga must hide and disable time fields; it contributes no working time.
    await fillIdentity();
    await page.locator("#serviceType").selectOption("Folga");
    check(await page.locator("#startTime").isDisabled(), "Folga desabilita horário inicial");
    check(await page.locator("#endTime").isDisabled(), "Folga desabilita horário final");
    await page.locator("#startDate").fill("2026-11-14");
    await submit();
    records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 3 && records[2].serviceType === "Folga", "Folga salva sem horários");

    // Intervalo is a standalone occurrence and contributes zero working/overtime hours.
    await fillIdentity();
    await page.locator("#serviceType").selectOption("Intervalo");
    await fillDates("2026-11-13", "12:00", "13:00");
    await submit();
    records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 4 && records[3].serviceType === "Intervalo", "Intervalo autônomo salvo");

    // Viagem makes vehicle and route fields visible/required.
    await fillIdentity();
    await page.locator("#serviceType").selectOption("Viagem");
    check(await page.locator("#origin").isVisible(), "Origem aparece em Viagem");
    check(await page.locator("#plate").isVisible(), "Placa aparece em Viagem");
    await fillDates("2026-11-15", "07:00", "16:00");
    await page.locator("#interval").fill("01:00");
    await submit();
    check((await page.locator("#formFeedback").textContent()).includes("ordem do veículo"), "Viagem valida ordem do veículo");
    await page.locator("#vehicleOrder").fill("V-001");
    await page.locator("#plate").fill("abc1d23");
    await page.locator("#origin").fill("Origem");
    await page.locator("#destination").fill("Destino");
    await submit();
    records = await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]"));
    check(records.length === 5 && records[4].plate === "ABC1D23", "Viagem salva e placa normalizada");

    // Daily dashboard and individual monthly statement use the same custom schedule.
    check((await page.locator("#totalOvertime").textContent()).includes("1h"), "Indicador de horas extras reflete jornada personalizada");
    await page.locator("#individualMonth").selectOption("2026-11");
    await page.locator("#individualEmployee").selectOption("TESTE-001");
    await page.locator("#generateIndividualReport").click();
    const reportText = await page.locator("#individualReportOutput").innerText();
    check(reportText.includes("Espelho mensal de ponto"), "Espelho mensal gerado");
    check(reportText.includes("FOLGA") && reportText.includes("INTERVALO"), "Espelho detalha folga e intervalo");
    check(reportText.includes("Pessoa de Teste"), "Espelho identifica a pessoa");
    check(reportText.includes("17h 00min") && reportText.includes("1h 00min"), "Espelho consolida horas trabalhadas e extras");
    check(reportText.includes("4"), "Espelho inclui quatro dias com registros");
    
    // CSV export should contain all service types and headings.
    const csvDownloadPromise = page.waitForEvent("download");
    await page.locator("#exportCsvButton").click();
    const csvDownload = await csvDownloadPromise;
    const csvPath = await csvDownload.path();
    const csvText = fs.readFileSync(csvPath, "utf8");
    check(csvText.includes("Competência") && csvText.includes("Folga") && csvText.includes("Intervalo") && csvText.includes("Viagem"), "CSV exporta todos os tipos de serviço");

    // Excel export is tested when the external SheetJS dependency is reachable.
    await page.waitForFunction(() => !!(window.XLSX && window.XLSX.writeFile), undefined, { timeout: 30000 });
    const excelDownloadPromise = page.waitForEvent("download");
    await page.locator("#exportButton").click();
    const excelDownload = await excelDownloadPromise;
    check((await excelDownload.suggestedFilename()).endsWith(".xlsx"), "Exportação Excel gera arquivo XLSX");
    const excelPath = await excelDownload.path();
    check(excelPath !== null, "Arquivo Excel foi produzido");
    const excelBase64 = fs.readFileSync(excelPath).toString("base64");
    const excelCheck = await page.evaluate((payload) => {
      const workbook = window.XLSX.read(payload, { type: "base64" });
      return {
        sheetNames: workbook.SheetNames,
        launchRows: window.XLSX.utils.sheet_to_json(workbook.Sheets["Lançamentos"]).length
      };
    }, excelBase64);
    check(excelCheck.sheetNames.includes("Resumo mensal") && excelCheck.sheetNames.includes("Resumo por colaborador") && excelCheck.sheetNames.includes("Instruções"), "Excel contém as quatro abas esperadas");
    check(excelCheck.launchRows === 5, "Excel contém todos os lançamentos");

    // Backup round-trip includes records and personalized schedules.
    const backupDownloadPromise = page.waitForEvent("download");
    await page.locator("#exportBackupButton").click();
    const backupDownload = await backupDownloadPromise;
    const backupPath = await backupDownload.path();
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    check(backup.records.length === 5 && backup.schedules["TESTE-001"] === 480, "Backup contém registros e jornada personalizada");
    check(backup.backupVersion === 2 && backup.shiftSchedules["PLAN-001"].type === "6x1" && backup.shiftSchedules["PLAN-12"].type === "12x36", "Backup inclui escalas salvas");

    await page.evaluate(() => {
      localStorage.removeItem("controleDePonto.registros.v1");
      localStorage.removeItem("controleDePonto.jornadas.v1");
      localStorage.removeItem("controleDePonto.escalas.v1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#backupFileInput").setInputFiles(backupPath);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("controleDePonto.registros.v1") || "[]").length === 5);
    check(await page.locator("#recordsBody tr").count() === 5, "Restauração reconstitui histórico");
    check(await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.jornadas.v1") || "{}")["TESTE-001"]) === 480, "Restauração reconstitui jornada");
    check(await page.evaluate(() => JSON.parse(localStorage.getItem("controleDePonto.escalas.v1") || "{}")["PLAN-12"].type) === "12x36", "Restauração reconstitui escala 12x36");

    // Mobile layout should not create page-level horizontal scrolling.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const mobileWidths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    check(mobileWidths.document <= mobileWidths.viewport + 1, "Layout móvel sem rolagem horizontal na página: " + JSON.stringify(mobileWidths));
    const mobileNavPosition = await page.evaluate(() => getComputedStyle(document.querySelector(".side-nav")).position);
    check(mobileNavPosition === "sticky", "Navegação móvel permanece acessível abaixo do cabeçalho");

    // Verify that the service worker controls the app and can serve the shell offline.
    await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) throw new Error("Service Worker indisponível");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 10000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
    check(await page.locator("h1").innerText() === "Meu controle de jornada", "Página inicial abre offline após primeiro carregamento");
    await context.setOffline(false);

    check(pageErrors.length === 0, "Sem erros JavaScript no navegador: " + pageErrors.join(" | "));
    await context.close();
    console.log("Browser tests passed: " + assertions + " checks.");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
