"use strict";

(() => {
  const SESSION_KEY = "controleDePonto.auth.session.v2";
  const CHANNEL = "CONTROLE_PONTO_SHEETS";
  const MAX_WAIT_MS = 45000;

  function endpoint() {
    const value = window.CONTROLE_PONTO_CONFIG && window.CONTROLE_PONTO_CONFIG.apiUrl;
    const url = String(value || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
      throw new Error("O endereço central ainda não foi configurado pelo administrador.");
    }
    return url;
  }
  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function getCachedUser() { const value = session(); return value && value.user ? value.user : null; }
  function hasSession() {
    const value = session();
    return Boolean(value && value.token && value.expiresAt && new Date(value.expiresAt).getTime() > Date.now());
  }
  function saveSession(data) {
    if (!data || !data.token || !data.user) throw new Error("O servidor não retornou uma sessão válida.");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, expiresAt: data.expiresAt, user: data.user }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function request(action, data, options) {
    const url = endpoint();
    const current = session();
    const requestId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : "cp-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    iframe.name = "cp-auth-" + requestId;
    iframe.title = "Comunicação segura com o banco central";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.target = iframe.name;
    form.enctype = "application/x-www-form-urlencoded";
    form.acceptCharset = "UTF-8";
    form.style.display = "none";
    const payload = {
      requestId, action,
      sessionToken: options && options.public ? "" : (current && current.token || ""),
      origin: window.location.origin,
      data: data || {}
    };
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(payload);
    form.append(input);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => { window.removeEventListener("message", onMessage); clearTimeout(timeout); form.remove(); iframe.remove(); };
      const finish = (error, result) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve(result); };
      const onMessage = (event) => {
        if (event.origin !== "https://script.google.com" && !event.origin.endsWith(".googleusercontent.com")) return;
        const message = event.data;
        if (!message || message.channel !== CHANNEL || message.requestId !== requestId) return;
        const response = message.response || {};
        if (!response.ok) {
          const error = new Error(response.error && response.error.message || "O banco central recusou a solicitação.");
          error.code = response.error && response.error.code || "BACKEND_ERROR";
          finish(error);
        } else finish(null, response.data);
      };
      const timeout = window.setTimeout(() => finish(new Error("O banco central não respondeu. Verifique a implantação do Apps Script.")), MAX_WAIT_MS);
      window.addEventListener("message", onMessage);
      document.body.append(iframe, form);
      try { form.submit(); } catch (error) { finish(new Error("Não foi possível chamar o banco central: " + error.message)); }
    });
  }

  async function login(username, password) {
    const result = await request("login", { username, password }, { public: true });
    saveSession(result);
    return result.user;
  }
  async function logout() {
    try { if (hasSession()) await request("logout", {}); }
    finally { clearSession(); }
  }
  async function resume() {
    if (!hasSession()) { clearSession(); throw new Error("Sua sessão terminou. Entre com seu usuário e senha."); }
    try {
      const user = await request("me", {});
      const current = session();
      saveSession({ token: current.token, expiresAt: current.expiresAt, user });
      return user;
    } catch (error) { clearSession(); throw error; }
  }

  window.SheetsBackend = Object.freeze({
    request, login, logout, resume, hasSession, getCachedUser, clearSession,
    getEndpoint: () => { try { return endpoint(); } catch (_) { return ""; } }
  });
})();