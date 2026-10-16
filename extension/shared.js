// Shared by the service worker, popup, options and blocked pages.

export const STATE_KEY = "labState";
export const QUEUE_KEY = "labQueue";
export const LAST_KEY = "labLast";
export const SETTINGS_KEY = "labSettings";

/** Lab admin settings: policy (chrome.storage.managed) wins over the options page. */
export async function getSettings() {
  const local = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {};
  let managed = {};
  try {
    // Managed storage can be slow to answer when no policy is set; don't wait long.
    managed = await Promise.race([
      chrome.storage.managed.get(null),
      new Promise((resolve) => setTimeout(() => resolve({}), 1000)),
    ]);
  } catch {
    managed = {};
  }
  const serverUrl = cleanUrl(managed.serverUrl || local.serverUrl || "");
  const seatLabel = String(managed.seatLabel || local.seatLabel || "").trim().slice(0, 32);
  return { serverUrl, seatLabel, managed: { serverUrl: Boolean(managed.serverUrl), seatLabel: Boolean(managed.seatLabel) } };
}

export function cleanUrl(value) {
  const v = String(value || "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return "";
    return u.origin;
  } catch {
    return "";
  }
}

export function clock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
