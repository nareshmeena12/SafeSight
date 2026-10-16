// SafeSight Lab service worker (Manifest V3).
//
// Records only while a lab session is running, after the student has joined
// with the session code and their roll number:
//   tab switches (host name only), moving to another app, copy and paste
//   (character counts only, never the text), attempts to open blocked sites,
//   and idle time. A heartbeat every 10 s sends the queued events; the server
// answers whether to keep going, and the extension stops by itself when the
// session ends (or at the end time, even if the network is down).

import { LAST_KEY, QUEUE_KEY, STATE_KEY, getSettings } from "./shared.js";

const BEAT_ALARM = "lab-beat";
const END_ALARM = "lab-end";
const MAX_QUEUE = 2000;
const RULE_REDIRECT = 1;
const RULE_BLOCK = 2;

const MARKS_KEY = "labMarks";

let beatTimer = null;
let beating = false;
const lastBlocked = new Map();

// Queue writes run one at a time so events recorded together aren't lost.
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** When the student moved away from Chrome / went idle (kept across worker restarts). */
async function getMarks() {
  return (await chrome.storage.local.get(MARKS_KEY))[MARKS_KEY] ?? { awaySince: null, idleSince: null };
}
async function setMarks(patch) {
  await chrome.storage.local.set({ [MARKS_KEY]: { ...(await getMarks()), ...patch } });
}

// ---------------------------------------------------------------- state

async function getState() {
  return (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] ?? null;
}

function record(type, detail = {}) {
  const at = Date.now();
  return serial(async () => {
    if (!(await getState())) return;
    const queue = (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] ?? [];
    queue.push({ type, detail, at });
    await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE) });
  });
}

// ---------------------------------------------------------------- joining

async function join(code, rollNumber) {
  const { serverUrl, seatLabel } = await getSettings();
  if (!serverUrl) {
    return { ok: false, message: "This PC isn't set up yet. Ask the lab admin to add the SafeSight address in the extension options." };
  }
  let res;
  try {
    res = await fetch(`${serverUrl}/api/lab/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, rollNumber, seatLabel: seatLabel || undefined, version: chrome.runtime.getManifest().version }),
    });
  } catch {
    return { ok: false, message: "We couldn't reach SafeSight. Check the network and try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: body.message || "That didn't work. Please try again." };

  const state = { serverUrl, token: body.token, seat: body.seat, session: body.session, joinedAt: Date.now() };
  await chrome.storage.local.set({ [STATE_KEY]: state, [QUEUE_KEY]: [], [MARKS_KEY]: { awaySince: null, idleSince: null } });
  await chrome.storage.local.remove(LAST_KEY);
  await start(state);
  return { ok: true };
}

// ---------------------------------------------------------------- running

async function start(state) {
  await applyBlocklist(state.session.blocklist);
  chrome.idle.setDetectionInterval(Math.max(15, state.session.idleAfterSeconds || 60));
  // The alarm is a backup that wakes the worker if Chrome suspended it;
  // the 10 s timer does the real work (and its API calls keep the worker alive).
  await chrome.alarms.create(BEAT_ALARM, { periodInMinutes: 0.5 });
  await chrome.alarms.create(END_ALARM, { when: Date.parse(state.session.endsAt) });
  startTimer(state.session.heartbeatMs || 10_000);
}

function startTimer(ms) {
  if (beatTimer) return;
  beatTimer = setInterval(() => void beat(), ms);
}

async function stop(reason) {
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = null;
  await chrome.alarms.clear(BEAT_ALARM);
  await chrome.alarms.clear(END_ALARM);
  await applyBlocklist([]);
  const state = await getState();
  await serial(() => chrome.storage.local.remove([STATE_KEY, QUEUE_KEY, MARKS_KEY]));
  await chrome.storage.local.set({
    [LAST_KEY]: { reason, at: Date.now(), title: state?.session?.title ?? "" },
  });
}

async function beat(leave = false) {
  if (beating && !leave) return;
  beating = true;
  try {
    const state = await getState();
    if (!state) {
      if (beatTimer) clearInterval(beatTimer);
      beatTimer = null;
      return;
    }
    const queue = (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] ?? [];
    const events = queue.slice(0, 500);
    let res;
    try {
      res = await fetch(`${state.serverUrl}/api/lab/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ events, leave: leave || undefined }),
      });
    } catch {
      // Offline: keep the queue and stop on time anyway.
      if (Date.now() >= Date.parse(state.session.endsAt)) await stop("ended");
      return;
    }

    if (res.status === 401) {
      await stop("replaced");
      return;
    }
    if (res.ok || res.status === 400) {
      // Sent (or unreadable, so retrying wouldn't help): drop those events.
      await serial(async () => {
        const now = (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] ?? [];
        await chrome.storage.local.set({ [QUEUE_KEY]: now.slice(events.length) });
      });
    }
    if (!res.ok) return;

    const { session } = await res.json();
    if (!session.active) {
      await stop(leave ? "left" : "ended");
      return;
    }
    if (session.endsAt !== state.session.endsAt) {
      await chrome.alarms.create(END_ALARM, { when: Date.parse(session.endsAt) });
    }
    if (session.blocklist.join() !== state.session.blocklist.join()) await applyBlocklist(session.blocklist);
    await chrome.storage.local.set({ [STATE_KEY]: { ...state, session } });
  } finally {
    beating = false;
  }
}

/** Resume after Chrome restarts or the worker wakes up. */
async function resume() {
  const state = await getState();
  if (!state) return;
  if (Date.now() >= Date.parse(state.session.endsAt)) {
    await beat();
    if (await getState()) await stop("ended");
    return;
  }
  startTimer(state.session.heartbeatMs || 10_000);
}

// ---------------------------------------------------------------- blocking

async function applyBlocklist(domains) {
  const removeRuleIds = [RULE_REDIRECT, RULE_BLOCK];
  if (!domains.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: [
      {
        id: RULE_REDIRECT,
        priority: 1,
        action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
        condition: { requestDomains: domains, resourceTypes: ["main_frame"] },
      },
      {
        id: RULE_BLOCK,
        priority: 1,
        action: { type: "block" },
        condition: {
          requestDomains: domains,
          resourceTypes: ["sub_frame", "xmlhttprequest", "websocket", "script", "other"],
        },
      },
    ],
  });
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function blockedHost(host, list) {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

// ---------------------------------------------------------------- listeners

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const state = await getState();
  if (!state) return;
  const host = hostOf(details.url);
  if (!host || !blockedHost(host, state.session.blocklist)) return;
  // One attempt per site per tab every few seconds (redirects fire twice).
  const key = `${details.tabId}|${host}`;
  const last = lastBlocked.get(key) ?? 0;
  if (Date.now() - last < 3000) return;
  lastBlocked.set(key, Date.now());
  await record("blocked_site", { host });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!(await getState())) return;
  let host = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    host = hostOf(tab.url || tab.pendingUrl || "");
  } catch {
    host = "";
  }
  await record("tab_switch", host ? { host } : {});
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  void (async () => {
    if (!(await getState())) return;
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Moving between Chrome windows briefly reports "none"; check again.
      await new Promise((r) => setTimeout(r, 800));
      const windows = await chrome.windows.getAll();
      if (windows.some((w) => w.focused) || (await getMarks()).awaySince !== null) return;
      await setMarks({ awaySince: Date.now() });
      await record("left_browser");
    } else {
      const { awaySince } = await getMarks();
      if (awaySince === null) return;
      await setMarks({ awaySince: null });
      await record("returned", { seconds: Math.round((Date.now() - awaySince) / 1000) });
    }
  })();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (!(await getState())) return;
  const { idleSince } = await getMarks();
  if (state === "idle" || state === "locked") {
    if (idleSince !== null) return;
    await setMarks({ idleSince: Date.now() });
    await record("idle");
  } else if (idleSince !== null) {
    await setMarks({ idleSince: null });
    await record("active", { seconds: Math.round((Date.now() - idleSince) / 1000) });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === BEAT_ALARM) {
    await resume();
    await beat();
  } else if (alarm.name === END_ALARM) {
    await beat();
    const state = await getState();
    if (state && Date.now() >= Date.parse(state.session.endsAt)) await stop("ended");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own pages and content scripts talk to the worker.
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.kind === "clip" && (message.type === "copy" || message.type === "paste")) {
    const chars = Math.max(0, Math.min(10_000_000, Math.round(Number(message.chars) || 0)));
    void record(message.type, { chars });
    return false;
  }
  if (message?.kind === "join") {
    join(String(message.code ?? ""), String(message.rollNumber ?? "")).then(sendResponse);
    return true;
  }
  if (message?.kind === "leave") {
    beat(true).then(async () => {
      // If the network is down, stop anyway; the teacher sees the seat go quiet.
      if (await getState()) await stop("left");
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});

chrome.runtime.onStartup.addListener(() => void resume());
chrome.runtime.onInstalled.addListener(() => void resume());
void resume();
