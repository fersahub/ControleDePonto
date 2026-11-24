"use strict";

(() => {
  const ENDPOINT_KEY = "controleDePonto.sheets.endpoint.v1";
  const ACCESS_KEY = "controleDePonto.sheets.accessCode.session";
  const CLIENT_KEY = "controleDePonto.sheets.clientId.v1";
  const CHANNEL = "CONTROLE_PONTO_SHEETS";
  const MAX_WAIT_MS = 45000;

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "cp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function getClientId() {
    let value = localStorage.getItem(CLIENT_KEY);
    if (!value) {
      value = makeId();
      localStorage.setItem(CLIENT_KEY, value);
    }
    return value;
  }

  function getEndpoint() {
    return localStorage.getItem(ENDPOINT_KEY) || "";
  }

  function getAccessCode() {
    return sessionStorage.getItem(ACCESS_KEY) || "";
  }

  function normalizeEndpoint(value) {
    const endpoint = String(value || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
      throw new Error("Informe a URL implantada do Apps Script, terminada em /exec.");
    }
    return endpoint;
  }

  function configure(endpointValue, accessCodeValue) {
    const endpoint = normalizeEndpoint(endpointValue);
    const accessCode = String(accessCodeValue || "").trim();
    if (accessCode.length < 32) throw new Error("O código de acesso parece incompleto. Copie a chave gerada na configuração do Apps Script.");
    localStorage.setItem(ENDPOINT_KEY, endpoint);
    sessionStorage.setItem(ACCESS_KEY, accessCode);
    return { endpoint };
  }

  function isConfigured() {
    return Boolean(getEndpoint() && getAccessCode());
  }

  function clearAccessCode() {
    sessionStorage.removeItem(ACCESS_KEY);
  }

  function request(action, data) {
    const endpoint = normalizeEndpoint(getEndpoint());
    const accessCode = getAccessCode();
    if (!accessCode) return Promise.reject(new Error("Informe o código de acesso compartilhado do banco central."));

    const requestId = makeId();
    const iframe = document.createElement("iframe");
    iframe.name = "cp-sheets-" + requestId;
    iframe.title = "Comunicação com o banco central";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = endpoint;
    form.target = iframe.name;
    form.enctype = "application/x-www-form-urlencoded";
    form.acceptCharset = "UTF-8";
    form.style.display = "none";

    const payload = {
      requestId,
      action,
      apiKey: accessCode,
      origin: window.location.origin,
      clientId: getClientId(),
      data: data || {}
    };
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(payload);
    form.append(input);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timeout);
        form.remove();
        iframe.remove();
      };
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };
      const onMessage = (event) => {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (!message || message.channel !== CHANNEL || message.requestId !== requestId) return;
        const response = message.response || {};
        if (!response.ok) {
          const error = new Error(response.error && response.error.message || "O banco central recusou a solicitação.");
          error.code = response.error && response.error.code || "BACKEND_ERROR";
          finish(error);
          return;
        }
        finish(null, response.data);
      };
      const timeout = window.setTimeout(() => {
        finish(new Error("O Apps Script não respondeu. Confira se a implantação está ativa e se o acesso está configurado como 'Qualquer pessoa'."));
      }, MAX_WAIT_MS);

      window.addEventListener("message", onMessage);
      document.body.append(iframe, form);
      try {
        form.submit();
      } catch (error) {
        finish(new Error("Não foi possível enviar a solicitação ao Google Apps Script: " + error.message));
      }
    });
  }

  window.SheetsBackend = Object.freeze({
    configure,
    getEndpoint,
    getClientId,
    isConfigured,
    clearAccessCode,
    request
  });
})();