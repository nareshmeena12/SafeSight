import { LAST_KEY, STATE_KEY, clock, getSettings } from "./shared.js";

const $ = (id) => document.getElementById(id);

const lastMessages = {
  ended: "The session has ended and recording has stopped.",
  left: "You left the session. Recording has stopped.",
  replaced: "This seat was opened again on another PC, so recording stopped here.",
};

async function render() {
  const { serverUrl } = await getSettings();
  const store = await chrome.storage.local.get([STATE_KEY, LAST_KEY]);
  const state = store[STATE_KEY];
  $("setup").hidden = Boolean(serverUrl) || Boolean(state);
  $("join").hidden = !serverUrl || Boolean(state);
  $("active").hidden = !state;

  if (state) {
    $("s-title").textContent = state.session.title;
    $("s-course").textContent = state.session.course || "—";
    $("s-seat").textContent = `${state.seat.label} · ${state.seat.rollNumber}`;
    $("s-ends").textContent = clock(state.session.endsAt);
    $("s-unmatched").hidden = state.seat.matched;
  } else {
    const last = store[LAST_KEY];
    $("last").textContent = last ? lastMessages[last.reason] ?? "" : "Enter your roll number and the 6-digit code your teacher shows.";
  }
}

$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rollNumber = $("roll").value.replace(/\s/g, "").toUpperCase();
  const code = $("code").value.replace(/\s/g, "");
  const error = $("error");
  error.hidden = true;
  if (!rollNumber) return showError("Enter your roll number.");
  if (!/^\d{6}$/.test(code)) return showError("The session code is 6 digits.");
  $("start").disabled = true;
  $("start").textContent = "Starting…";
  const result = await chrome.runtime.sendMessage({ kind: "join", code, rollNumber });
  $("start").disabled = false;
  $("start").textContent = "Start session";
  if (!result?.ok) return showError(result?.message ?? "That didn't work. Please try again.");
  await render();

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }
});

let confirmLeave = false;
$("leave").addEventListener("click", async () => {
  if (!confirmLeave) {
    confirmLeave = true;
    $("leave-confirm").hidden = false;
    $("leave").textContent = "Stop and leave";
    return;
  }
  $("leave").disabled = true;
  await chrome.runtime.sendMessage({ kind: "leave" });
  await render();
});

chrome.storage.onChanged.addListener(() => void render());
void render();
