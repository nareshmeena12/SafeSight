# SafeSight — design system

SafeSight is an AI tutor for colleges that coaches students instead of doing their work, and shows teachers how their class actually uses AI. The idea in four words: **Guide, don't guard.**

The brand should feel like a beautiful modern library — calm, warm, intelligent, academic. Trustworthy and human, optimistic about learning. Never a security product.

## Voice

- Speak like a good teacher: patient, specific, encouraging. Short sentences. Plain English.
- Lead with learning ("builds real understanding"), not with control.
- Describe evidence neutrally: "One paste at 14:32 made up 78% of the final text." Teachers decide; SafeSight never accuses.
- Never invent numbers. Survey figures stay as `[XX]%` placeholders until real data exists.
- Words we never use: *cheating, catch, spy*. Avoid *monitor* outside announced exam sessions.
- Product names: **Sage** (student tutor), **Lens** (teacher assistant), **Trace** (writing replay), **Live Lab Mode**. Modes: Learn, Assist, Exam.

## Colour

Tokens are semantic, with a light and a dark theme (light is the fallback).

- `background` is warm paper; `surface` (white / deep slate) holds cards and product UI.
- `primary` (Sage green) carries the brand: primary buttons, links, active states, the logo. Text on it is `on-primary`.
- `accent` (Insight amber) is used **once per screen** for the single most important highlight — a hint counter, a paste event, a seat that needs attention. It is a fill; text on it is `on-accent`. Never amber text on paper.
- `good`, `warning`, `critical` are states only, always paired with a label or icon. `warning` fails as text on paper — use it as a fill or icon.
- `primary-soft` and `accent-soft` are derived tints for bubbles, glows and highlighted rows.
- Glows: a very soft radial of `primary` (≈12–18% alpha) behind key visuals. No loud gradients, no purple-blue "AI" gradients, no neon.

## Type

- **Instrument Serif** for large headlines only (`display`, `headline`, `headline-sm`). One italic word for emphasis at most.
- **Geist** for all interface and body text — body is 16px / 1.6.
- **Geist Mono** for numbers, counters, timestamps and code in product UI.
- All three are hosted on Google Fonts: `family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1`.

## Layout

8px grid (`space-*`), 12 columns, `content-max` 1200px. Very generous space between sections: `space-15`–`space-20` on desktop, `space-8` on mobile. 16px side gutter on phones.

Cards: `radius-lg`, 1px `border`, no shadow at rest. On hover they rise 2–4px and take `shadow-lift`. Controls use `radius-md`; status pills `radius-full`.

A subtle paper-grain texture (SVG noise, ≈3–4% opacity) sits on the page ground.

## Motion

Smooth, purposeful, never flashy. 150–600ms, ease-out (`cubic-bezier(.2,.7,.2,1)`). Animate only opacity, position and scale. Sections fade up 8–16px as they enter. Buttons press to `scale(.98)`. Chats type and stream like real conversations. Under `prefers-reduced-motion`, show final states without animation.

## Iconography

Lucide-style line icons, 1.5px stroke, round caps and joins, drawn with `currentColor`. Never eyes, padlocks, robots, glowing brains, cameras-as-surveillance or any watching imagery.

## Logo

The wordmark "SafeSight" in Geist semibold beside a small lens/aperture mark with a spark at its centre (`assets/Logos/safesight-mark.svg`). The mark is drawn in `primary`; minimum size 20px. Never replace it with an eye.

## Accessibility

WCAG AA in both themes: text 4.5:1, large text and icons 3:1. Every interactive element shows `focus-ring`. Touch targets at least 44px. Form fields always have visible labels and inline, helpful error messages.
