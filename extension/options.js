import { SETTINGS_KEY, cleanUrl, getSettings } from "./shared.js";

const $ = (id) => document.getElementById(id);

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const serverUrl = cleanUrl($("serverUrl").value);
  $("error").hidden = true;
  if (!serverUrl) {
    $("error").textContent = "Enter the full SafeSight address, starting with https://";
    $("error").hidden = false;
    return;
  }
  const seatLabel = $("seatLabel").value.trim().slice(0, 32);
  await chrome.storage.local.set({ [SETTINGS_KEY]: { serverUrl, seatLabel } });
  $("saved").textContent = "Saved.";
});

getSettings().then((settings) => {
  if (!$("serverUrl").value) $("serverUrl").value = settings.serverUrl;
  if (!$("seatLabel").value) $("seatLabel").value = settings.seatLabel;
  $("serverUrl").disabled = settings.managed.serverUrl;
  $("seatLabel").disabled = settings.managed.seatLabel;
});
