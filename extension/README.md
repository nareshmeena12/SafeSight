# SafeSight Lab (Chrome extension)

Live Lab Mode for lab exams on college PCs (PLAN.md §4). Plain Manifest V3, no build step.

> Before installing anything on real lab PCs, get written permission from the course instructor and the lab administrator.

## What it does

- Does nothing until a student enters their **roll number** and the teacher's **6-digit session code** in the toolbar popup.
- While the session runs:
  - shows a banner on every page: "Exam session active: SafeSight is recording activity."
  - blocks AI sites (ChatGPT, Gemini, Claude, Copilot, DeepSeek, Perplexity and more, see `src/lib/lab/domains.ts`) plus the teacher's own list, and redirects to a friendly page
  - records tab switches (host name only), moving to another app, copy and paste (**character counts only, never the text**), attempts to open blocked sites, and idle time
  - sends a heartbeat with the queued events every 10 seconds (`POST /api/lab/heartbeat`)
- Stops by itself when the session ends (the server says so, or the end time passes even if the network is down), when the teacher ends it early, when the student presses "I've finished", or when the same roll number joins on another PC.

The teacher watches the seats live at `/teacher/lab/<session>`; a seat with no heartbeat for 30 seconds turns red.

## Install on a lab PC (lab admin, once)

1. Copy this `extension/` folder to the PC (or zip it: `cd extension && zip -r ../safesight-lab.zip .`).
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the folder.
3. Open the extension's **Options** and set:
   - **SafeSight address**: the site, e.g. `https://safesight.example.in` (https only; `http://localhost` works for testing)
   - **Seat or PC number**: e.g. `14` (shown on the teacher's grid; empty = the student's roll number)

### Recommended Chrome policies for a managed lab

- Force-install the extension (`ExtensionInstallForcelist`) so students can't turn it off; a disabled extension shows up as a red seat, but prevention is better.
- Set the address and seat once for every PC through policy instead of the options page. The extension reads `chrome.storage.managed` (`managed_schema.json`): `serverUrl`, `seatLabel`.
- Turn off guest mode and incognito (`IncognitoModeAvailability = 1`), and make Chrome the only browser on the lab image.

## Limits (say them openly)

- Chrome only. Other browsers and desktop apps aren't covered (a desktop agent is a v2 option).
- It can't see phones, so an invigilator is still needed.
- Timestamps come from the lab PC; the server clamps them to the session.

## Rehearse without a lab

`pnpm lab:simulate --create` simulates 30 seats through the same API (see `scripts/lab-simulate.mts`).
