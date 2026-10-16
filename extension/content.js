// SafeSight Lab content script: the "exam session active" banner (top frame)
// and copy / paste counts (every frame). Only the number of characters is
// sent, never the text itself.
(() => {
  const STATE_KEY = "labState";
  let active = false;
  let banner = null;

  function send(type, chars) {
    if (!active) return;
    try {
      chrome.runtime.sendMessage({ kind: "clip", type, chars });
    } catch {
      // The extension was reloaded; this page's script is orphaned.
    }
  }

  function selectedChars() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && typeof el.selectionStart === "number"))) {
      return Math.abs((el.selectionEnd ?? 0) - (el.selectionStart ?? 0));
    }
    return String(document.getSelection() ?? "").length;
  }

  document.addEventListener("copy", () => send("copy", selectedChars()), true);
  document.addEventListener("cut", () => send("copy", selectedChars()), true);
  document.addEventListener("paste", (e) => send("paste", e.clipboardData?.getData("text/plain")?.length ?? 0), true);

  function showBanner(session) {
    if (window.top !== window) return;
    if (!banner) {
      const host = document.createElement("safesight-lab-banner");
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `
        <style>
          :host { all: initial; }
          .bar {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
            display: flex; align-items: center; gap: 8px; justify-content: center;
            padding: 6px 16px; pointer-events: none;
            font: 500 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
            color: #ffffff; background: #1f6f5c; border-top: 1px solid #15302a;
          }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #ffffff; flex: none; }
          .meta { opacity: .85; font-weight: 400; }
          @media (prefers-color-scheme: dark) { .bar { color: #0e1015; background: #4fb59a; } .dot { background: #0e1015; } }
        </style>
        <div class="bar" role="status"><span class="dot"></span><span class="text"></span><span class="meta"></span></div>`;
      banner = { host, text: root.querySelector(".text"), meta: root.querySelector(".meta") };
    }
    banner.text.textContent = "Exam session active: SafeSight is recording activity.";
    const ends = new Date(session.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    banner.meta.textContent = `${session.title} · ends ${ends}`;
    if (!banner.host.isConnected) (document.body ?? document.documentElement).appendChild(banner.host);
  }

  function hideBanner() {
    banner?.host.remove();
  }

  function apply(state) {
    active = Boolean(state);
    if (active) showBanner(state.session);
    else hideBanner();
  }

  chrome.storage.local.get(STATE_KEY).then((v) => {
    const state = v[STATE_KEY];
    if (document.readyState === "loading" && state) {
      document.addEventListener("DOMContentLoaded", () => apply(state), { once: true });
      active = true;
    } else apply(state);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STATE_KEY in changes) apply(changes[STATE_KEY].newValue);
  });
})();
