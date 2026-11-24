(function () {
  "use strict";

  const pages = Array.from(document.querySelectorAll("[data-tab-page]"));
  const tabLinks = Array.from(document.querySelectorAll("[data-tab-target]"));
  if (!pages.length || !tabLinks.length) return;

  function pageFromHash(hash) {
    if (!hash || hash === "#") return null;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (_) { id = hash.slice(1); }
    const target = document.getElementById(id);
    if (!target) return null;
    return target.matches("[data-tab-page]") ? target : target.closest("[data-tab-page]");
  }

  function open(pageOrId, options) {
    const settings = options || {};
    const page = typeof pageOrId === "string" ? document.getElementById(pageOrId) : pageOrId;
    if (!page || !page.matches("[data-tab-page]")) return false;
    if (page.classList.contains("admin-only") && page.classList.contains("is-hidden")) return false;

    pages.forEach((candidate) => {
      const active = candidate === page;
      candidate.hidden = !active;
      candidate.classList.toggle("is-active", active);
    });

    tabLinks.forEach((link) => {
      const active = link.dataset.tabTarget === page.id;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    document.body.dataset.activeTab = page.id;
    if (settings.hash && settings.updateHistory !== false && window.location.hash !== settings.hash) {
      window.history.pushState({ tab: page.id }, "", settings.hash);
    } else if (settings.updateHistory !== false && !settings.hash && window.location.hash !== "#" + page.id) {
      window.history.pushState({ tab: page.id }, "", "#" + page.id);
    }
    if (settings.scroll !== false) window.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  tabLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(link.dataset.tabTarget, { hash: link.getAttribute("href") });
    });
  });

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]:not([data-tab-target])');
    if (!anchor) return;
    const targetPage = pageFromHash(anchor.getAttribute("href"));
    if (!targetPage) return;
    event.preventDefault();
    open(targetPage, { hash: anchor.getAttribute("href"), scroll: false });
    const target = pageFromHash(anchor.getAttribute("href")) === targetPage
      ? document.getElementById(decodeURIComponent(anchor.getAttribute("href").slice(1)))
      : null;
    if (target && target !== targetPage) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  window.addEventListener("popstate", () => {
    const target = pageFromHash(window.location.hash) || document.getElementById("tab-overview");
    open(target, { updateHistory: false, scroll: true });
  });

  const initial = pageFromHash(window.location.hash) || pages.find((page) => page.classList.contains("is-active")) || document.getElementById("tab-overview");
  open(initial, { updateHistory: false, scroll: false });

  window.ControlPointNavigation = Object.freeze({ open, getActive: () => document.body.dataset.activeTab || "tab-overview" });
})();