import { STATE_KEY, clock } from "./shared.js";

const state = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
if (state) document.getElementById("session").textContent = `${state.session.title} · ends ${clock(state.session.endsAt)}`;
document.getElementById("back").addEventListener("click", () => history.back());
