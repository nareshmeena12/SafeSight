# Design reference

Everything here is **reference for building**, not code to ship.

| Path | What it is |
| --- | --- |
| `brand.md` | Brand book: voice, colour rules, type, layout, motion, icons, logo, accessibility |
| `tokens.json` | Design tokens (colour light/dark, type scale, spacing, radius, shadow) with usage notes |
| `logo/safesight-mark.svg` | The lens/aperture mark with a spark. Pair with the wordmark "SafeSight" in Geist semibold |
| `landing/` | The finished landing-page prototype from Claude Design (source of truth for S10) |

## The landing prototype (`landing/`)

Artboards (`canvas.json` lists them with titles and sizes):

| File | Screen |
| --- | --- |
| `Main.dc.html` | Full landing page, all 13 sections, with every animation and interaction. Desktop and mobile layouts both live here (container queries at 1180 / 1040 / 820px in `site.css`) |
| `PilotPanel.dc.html` | Final call-to-action panel with the pilot form, validation and success state |
| `Auth.dc.html` | Log in and sign up (role picker Student / Teacher, inline validation, "check your inbox" state) |
| Other `*.dc.html` | Thin wrappers that render the above in dark mode, at 390px, or in a fixed state (errors, success, menu open) |
| `site.css` | All styles. The `.ss` block at the top maps 1:1 to the tokens |

How to read the `.dc.html` files: markup sits inside `<x-dc>`, `{{name}}` holes are filled by `renderVals()` in the `class Component extends DCLogic` script at the bottom, `<sc-if>` / `<sc-for>` are conditionals and loops, `<dc-import name="X">` mounts `X.dc.html`. Port the structure, copy and behaviour into React components; port the CSS into Tailwind + CSS variables.

Things to carry over exactly:

- **Copy.** All headings, body text, FAQ answers and form messages are final unless PLAN.md changes.
- **Animations.** Hero words fade up 60ms apart; Sage chat types and streams, then loops; sections fade up on enter; problem stats count up; How-it-works line draws on scroll; dashboard flattens from a 16° tilt as it scrolls in, then three callouts pop in; Trace replay auto-plays once with a draggable scrubber; Lab seat 14 turns amber with an alert. All disabled under `prefers-reduced-motion`.
- **Mobile.** Before/after becomes a Generic AI / Sage toggle; How-it-works line goes vertical; dashboard callouts become numbered pins with a list below; lab grid is 5 columns.
- **Survey stats** stay `[XX]%` / `[N]` placeholders. Make them config values so real numbers can drop in later.

Things to change when building:

- The paper grain in `site.css` points at a Claude Design upload (`/_blob/...`). Replace it with an inline SVG noise background at ~4–6% opacity.
- Use Motion (`motion/react`) instead of the hand-rolled timers and IntersectionObserver.
- The pilot form must POST to an API route that validates with zod and inserts into `pilot_requests`.
- Log in / sign up must use Supabase Auth (email + password, plus magic link) and redirect by role.

Live prototype (private to the owner): the "SafeSight Website" canvas in Claude Design.
