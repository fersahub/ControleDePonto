const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const js = read("assets/js/app.js");
const engine = read("assets/js/time-engine.js");
const scheduleEngine = read("assets/js/schedule-engine.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const sw = read("sw.js");

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error("IDs HTML duplicados: " + [...new Set(duplicateIds)].join(", "));

const referencedIds = [...js.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds)].filter((id) => !ids.includes(id));
if (missingIds.length) throw new Error("IDs usados no JavaScript e ausentes no HTML: " + missingIds.join(", "));

const assetRefs = [
  ...[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]),
  ...manifest.icons.map((icon) => icon.src)
].filter((ref) => !/^(https?:|#|mailto:|data:)/i.test(ref));
const missingAssets = [...new Set(assetRefs)].filter((ref) => {
  const localPath = ref.split(/[?#]/)[0].replace(/^\.\//, "");
  return !fs.existsSync(path.join(root, localPath));
});
if (missingAssets.length) throw new Error("Arquivos locais referenciados e ausentes: " + missingAssets.join(", "));

const scriptRefs = [...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map((match) => match[1].split(/[?#]/)[0]);
const engineScriptIndex = scriptRefs.indexOf("assets/js/time-engine.js");
const scheduleEngineScriptIndex = scriptRefs.indexOf("assets/js/schedule-engine.js");
const appScriptIndex = scriptRefs.indexOf("assets/js/app.js");
if (engineScriptIndex < 0 || scheduleEngineScriptIndex < 0 || appScriptIndex < 0 || engineScriptIndex > scheduleEngineScriptIndex || scheduleEngineScriptIndex > appScriptIndex) throw new Error("Os motores de cálculo devem carregar antes do aplicativo.");
if (!engine.includes("calculateDailyMetrics") || !engine.includes("parseIntervalMinutes")) throw new Error("Motor de cálculo incompleto.");
if (!scheduleEngine.includes("buildForecast") || !scheduleEngine.includes("normalizeConfig")) throw new Error("Motor de escalas incompleto.");
if (!manifest.icons.some((icon) => icon.sizes === "192x192") || !manifest.icons.some((icon) => icon.sizes === "512x512")) throw new Error("O manifesto precisa declarar ícones de 192px e 512px.");
if (manifest.start_url !== "./" || manifest.scope !== "./") throw new Error("Manifesto PWA com escopo inesperado.");
if (!sw.includes("addAll(APP_SHELL)") || !sw.includes("caches.match(request)") || !sw.includes("schedule-engine.js")) throw new Error("Service Worker sem cache essencial/offline.");
for (const required of ["exportBackup", "importBackup", "calculateDailyMetrics", "generateIndividualReport", "renderShiftCalendar", "loadShiftPlans", "renderDashboardExtras", "renderActivityCalendar", "renderActivityTimeline"]) {
  if (!js.includes("function " + required)) throw new Error("Função essencial ausente: " + required);
}

console.log("Smoke test aprovado: IDs, arquivos locais, manifesto PWA, cache offline e funções essenciais.");
