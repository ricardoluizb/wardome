# Pre-login landing page — design

## Problem

Visiting the site currently drops the player straight into the live terminal client (`web/index.html`), with the game's own ASCII welcome banner as the only "front door." No standalone landing/splash experience exists.

## Solution

`web/index.html` becomes a static landing page; the current terminal client moves to `web/play.html` unchanged. A large "Entrar no WarDome" button on the landing page links to `play.html`.

**Visual style:** ornate dark-fantasy RPG HUD framing — Baldur's Gate 3 style gilded/stone-carved panel borders, parchment-toned text panels, dramatic low lighting — matching the aesthetic already established for room/mob art and reusing the existing dark background + gold/amber accent palette from `web/style.css`'s HUD.

**Content:** "WARDOME" title (matching the in-game ASCII banner's own branding, "Beta Version 2.0" subtitle), a short evocative tagline, full-bleed hero background image, the entry button.

**Hero art:** generated via OpenAI's image API (`gpt-image-1`), not Pollinations — a one-off exception for this single image, at the user's explicit request. The project's locked Pollinations pipeline for room/mob art is unchanged and not reopened by this. API key is read at generation time from `~/Documents/WHCreative/apps/web/.env.local` (`OPENAI_API_KEY`) — never printed, never committed, never hardcoded into any script; passed via environment variable only. New one-off script: `tools/gen-landing-art.js`, output: `web/assets/landing-hero.jpg`.

## Scope

- New/renamed files: `web/index.html` (new landing content), `web/play.html` (moved terminal, byte-identical to today's `index.html`), `web/assets/landing-hero.jpg` (generated), possibly new landing-specific CSS (either appended to `web/style.css` or a new `web/landing.css` — decide during implementation based on how much overlap there is with existing HUD styles).
- No change to `bridge/server.js`, `wdii/src`, or any gameplay logic.
- No change to the existing MVP room/mob art pipeline (`tools/gen-room-art.js`/`tools/gen-mob-art.js` stay on Pollinations).

## Out of scope

- Any broader re-evaluation of switching room/mob art generation to GPT-Image — this is a landing-page-only, user-approved one-off.
- Multiplayer/account features, actual login form on the landing page (the "login" still happens inside `play.html`'s terminal, same as today).

## Testing

Manual/observational, per project convention: build the page, view live in a browser, confirm the hero image loads, the button navigates to `play.html`, and `play.html` still works exactly as before (unchanged terminal client, HUD, room/mob art, ANSI color, password masking — all untouched).
