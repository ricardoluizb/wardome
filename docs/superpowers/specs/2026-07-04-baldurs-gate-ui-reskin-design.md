# Baldur's Gate-style UI Reskin — Design

## Goal

Reskin the existing browser client (`web/play.html`, `web/style.css`) to look like a Baldur's Gate-era CRPG panel: dark stone-and-leather side panel and terminal frame, ornamented gold borders with carved corners on the room-art portrait, a fantasy serif typeface for headings/labels, and a gilded treatment on the HP/mana/move stat bars. No gameplay, protocol, or `client.js` logic changes — this is CSS plus two new background texture images.

## Current State

- `web/play.html`: flat two-panel layout (`#side-panel` fixed 300px + `#terminal-panel` flex). Side panel holds room art, room id, and the HUD (3 stat bars + stat line). Terminal panel holds `#output` (ANSI-rendered game text) and `#command-input`.
- `web/style.css` (129 lines): flat colors (`#161616` panel bg, `#0d0d0d` body bg), 1px `#333` borders, `Courier New` monospace everywhere, stat bar fills already color-coded (HP `#e05252`, mana `#4a90d9`, move `#d4af37` — set inline via `client.js`'s `setBar()`, not in CSS).
- No existing texture/background images in `web/assets/` beyond room/mob art (`web/assets/rooms/*.jpg`, `web/assets/mobs/*.jpg`).
- `client.js` already renders ANSI SGR codes as inline `<span style="color:...">` — untouched by this work.

## Scope

**In scope:**
1. Two new AI-generated texture images (dark stone+leather, tileable-enough for panel backgrounds) via the existing `gpt-image-1` pipeline (same key sourcing as `tools/gen-world-art.js`).
2. CSS-only ornamentation: double gold border + carved-corner treatment on `#room-art`, matching corner/border treatment on `#side-panel` and `#terminal-panel` outer frames, beveled/gilded treatment on `.stat-bar` track and `.stat-bar-fill`.
3. A fantasy serif Google Font (Cinzel) applied to headings (`#side-panel h2`), `#room-id`, and `#stat-line` only.
4. Minor structural additions to `play.html`/`style.css` needed to hang the new ornamentation (e.g. corner pseudo-elements need a positioned container) — no id/class renames of anything `client.js` already references.

**Out of scope:**
- Any change to `client.js` (event listeners, WS protocol, ANSI parsing) — this is a pure presentational reskin.
- Any change to stat bar *colors* (HP/mana/move colors are a locked prior decision) — only their framing/bevel changes.
- A character-portrait image (no such asset/concept exists in this project — "portrait frame" here refers only to the existing room/mob art image, reused with a fancier border).
- Landing page (`web/index.html`, `web/landing.css`) — separate page, not requested.
- Any new UI panel, inventory screen, or spellbook-style widget — out of scope, this is a border/texture/font pass on the existing layout only.

## Assets

Two new images, generated via `tools/gen-world-art.js`'s existing OpenAI `gpt-image-1` call pattern (or a small new one-off script following the same key-sourcing/prompt convention — implementer's choice, no new pipeline concept):

1. `web/assets/ui/panel-texture.jpg` — dark carved stone wall with aged dark leather panel insert, subtle, low-contrast, dark-fantasy palette matching the room/mob art style already shipped. Used as a `background-image` (with `background-size: cover` or a moderate repeat tile) on `#side-panel` and `#terminal-panel`.
2. `web/assets/ui/frame-texture.jpg` (optional second variant, only if the implementer's single texture doesn't read well repeated at both panel sizes — otherwise reuse texture 1 for both). Default to reusing texture 1 for both surfaces unless it visibly tiles/stretches badly at implementation time.

Both images must stay dark enough that existing light-colored text (`#e0e0e0` body text, ANSI colors) remains readable on top — apply a semi-transparent dark overlay (`linear-gradient` over the background-image) if the raw texture is too light/busy for text legibility.

## Visual Treatment Detail

**Panel frames (`#side-panel`, `#terminal-panel`):**
- Background: the stone/leather texture image, dark overlay gradient for text contrast.
- Border: double border effect — an outer thin dark border, an inner gold/brass line (`box-shadow: inset 0 0 0 1px <gold>, 0 0 0 1px <dark>` or equivalent layered `border` + `outline` combo), consistent with the existing gold accent color already used for `#room-id` (`#d4af37`).
- Corners: small carved-corner accent (CSS-only — e.g. a diagonal gradient clip or a small ornamental corner glyph via `::before`/`::after`), reusing the same gold tone.

**Room-art portrait (`#room-art`):**
- Same double-border + corner treatment as the panels, but heavier/more ornamented (this is the focal "portrait" element) — thicker gold border, more pronounced carved-corner accents, subtle inner shadow to give the image a "set into the frame" look.

**Stat bars (`.stat-bar`, `.stat-bar-fill`):**
- Track (`.stat-bar`): thin gold border replacing the current `#333`, subtle inset shadow for a carved-groove look.
- Fill (`.stat-bar-fill`): keep existing per-stat colors exactly as-is (set inline by `client.js`); add a subtle gradient/gloss overlay via a CSS `background-image: linear-gradient(...)` layered on top of the inline `background-color` (achievable since `background-color` and `background-image` are independent CSS properties — no `client.js` change needed) for a gem/gilded look.

**Typography:**
- Add Cinzel via Google Fonts `<link>` in `play.html`'s `<head>`.
- Apply `font-family: 'Cinzel', serif` to `#side-panel h2`, `#room-id`, `#stat-line` only.
- `#output`, `#command-input`, `.stat-label`, `.stat-value` remain monospace (ANSI alignment + numeric readability).

## Files Touched

- `web/play.html` — add Google Fonts `<link>`, minor markup additions if corner-ornament pseudo-elements need an extra wrapping element (implementer's call, keep existing ids intact).
- `web/style.css` — all the visual changes above.
- `web/assets/ui/panel-texture.jpg` (+ optional `frame-texture.jpg`) — new generated images.
- One new small script (or reuse of `tools/gen-world-art.js`'s pattern) to generate the texture image(s) — not part of the runtime app, a one-off dev tool like the existing art-gen scripts.

## Testing

Per this project's established testing rigor (locked decision — manual/observational only, no automated suite): rebuild/reload the static client, visually confirm via browser (screenshot or live check) that panels render the new texture/border/corner treatment, headings use the serif font, stat bars keep their correct colors with the new bevel, and `#output`/`#command-input` remain fully readable/functional (type a command, confirm ANSI-colored game text still renders correctly, confirm the up/down-arrow command history feature shipped in the previous session still works).
