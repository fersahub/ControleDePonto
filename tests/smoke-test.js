const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const js = read("assets/js/app.js");
const engine = read("assets/js/time-engine.js");
const scheduleEngine = read("assets/js/schedule-engine.js");
const sheetsClient = read("assets/js/sheets-client.js");
const sheetsBackend = read("backend/apps-script/Code.gs");
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
const backendConfigScriptIndex = scriptRefs.indexOf("assets/js/backend-config.js");
const sheetsClientScriptIndex = scriptRefs.indexOf("assets/js/sheets-client.js");
const appScriptIndex = scriptRefs.indexOf("assets/js/app.js");
if (engineScriptIndex < 0 || scheduleEngineScriptIndex < 0 || backendConfigScriptIndex < 0 || sheetsClientScriptIndex < 0 || appScriptIndex < 0 || engineScriptIndex > scheduleEngineScriptIndex || scheduleEngineScriptIndex > backendConfigScriptIndex || backendConfigScriptIndex > sheetsClientScriptIndex || sheetsClientScriptIndex > appScriptIndex) throw new Error("Os motores e o cliente Google Sheets devem carregar antes do aplicativo.");
if (!engine.includes("calculateDailyMetrics") || !engine.includes("parseIntervalMinutes")) throw new Error("Motor de cálculo incompleto.");
if (!scheduleEngine.includes("buildForecast") || !scheduleEngine.includes("normalizeConfig")) throw new Error("Motor de escalas incompleto.");
if (!manifest.icons.some((icon) => icon.sizes === "192x192") || !manifest.icons.some((icon) => icon.sizes === "512x512")) throw new Error("O manifesto precisa declarar ícones de 192px e 512px.");
if (manifest.start_url !== "./" || manifest.scope !== "./") throw new Error("Manifesto PWA com escopo inesperado.");
if (!sw.includes("addAll(APP_SHELL)") || !sw.includes("caches.match(request)") || !sw.includes("schedule-engine.js")) throw new Error("Service Worker sem cache essencial/offline.");
for (const required of ["exportBackup", "importBackup", "calculateDailyMetrics", "generateIndividualReport", "renderShiftCalendar", "loadShiftPlans", "renderDashboardExtras", "renderActivityCalendar", "renderActivityTimeline", "connectCloudDatabase", "refreshCloudDatabase", "importCloudBackup", "sendLocalDataToCloud"]) {
  if (!js.includes("function " + required)) throw new Error("Função essencial ausente: " + required);
}

console.log("Smoke test aprovado: IDs, arquivos locais, manifesto PWA, cache offline e funções essenciais.");

for (const required of ["setupControleDePonto", "doPost", "login_", "getSession_", "getAll_", "saveRecord_", "deleteRecord_", "createEmployee_", "changePassword_", "canReadItem_", "requireAdmin_", "importRecords_", "importSchedules_", "importShiftPlans_", "withWriteLock_"]) {
  if (!sheetsBackend.includes("function " + required)) throw new Error("Função essencial do backend ausente: " + required);
}
for (const required of ["function request", "function configure", "addEventListener(\"message\"", "googleusercontent.com", "sessionStorage"]) {
  if (!sheetsClient.includes(required)) throw new Error("Cliente Google Sheets incompleto: " + required);
}
if (!sheetsBackend.includes("window.top.postMessage")) throw new Error("Backend não envia a resposta pelo canal de comunicação esperado.");
if (!sheetsBackend.includes("ownerId") || !sheetsBackend.includes("PASSWORD_CHANGE_REQUIRED")) throw new Error("Backend sem isolamento de dados por usuário ou troca obrigatória de senha.");
for (const required of ["authScreen", "loginForm", "loginUsername", "loginPassword", "accountPanel", "logoutButton", "changePasswordForm", "adminUsersPanel", "createUserForm", "adminUsersList", "cloudBackupFileInput", "importCloudBackupButton", "syncLocalDataButton"]) {
  if (!ids.includes(required)) throw new Error("Controle da integração Google Sheets ausente: " + required);
}
