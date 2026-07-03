# Room & mob art regeneration via GPT-Image, with real visual continuity — design

## Problem

The 9 room images and 5 mob images were generated independently via Pollinations.ai (locked decision), each a standalone text-to-image call. Continuity between adjacent rooms was faked with a shared random seed number — a weak signal, since Pollinations never actually sees the neighboring image, just reuses a seed integer. The user wants genuine visual continuity ("elas precisam conversar entre si") across all 14 images, and has explicitly authorized switching this batch to OpenAI's `gpt-image-1` (paid), which supports something Pollinations doesn't: the `/v1/images/edits` endpoint accepts up to 16 real reference images per call, so the model can actually see a prior image and continue from it.

This is a one-off, user-approved exception to the locked Pollinations-only art decision — scoped to regenerating these 14 existing images. It does not change the pipeline for any future art unless the user says so again.

## Mechanism

**`images/generations`** (`POST /v1/images/generations`, JSON body) — used only for the very first image in the whole chain.

**`images/edits`** (`POST /v1/images/edits`, multipart/form-data: `model`, one or more `image[]` files, `prompt`, `size`, `quality`) — used for every subsequent image, passing the immediately-preceding image in the chain as the single reference. No mask is sent (an unmasked edit call treats the whole reference image as a style/composition anchor for the new prompt, not a masked inpaint region) — this is a full-image continuation/variation, exactly what "continuing the same environment" needs.

**One single linear chain across all 14 images**, not two separate room/mob chains: `3001 → 3054 → 3059 → 3060 → 3061 → 18600 → 18601 → 18602 → 18603 → [mob] 18601 → 18602 → 18604 → 18611 → 18615`. Room `3001` is the only `generations` call (nothing to reference yet); every other image is an `edits` call referencing the one immediately before it in this sequence. The last room (`18603`) feeds into the first mob (`18601`), tying the whole 14-image set into one continuous visual lineage — literally one long "conversation" between images, matching the user's request as directly as possible.

**Why a single chain, not per-segment or per-category:** simpler than the old Pollinations segment/seed-grouping logic (no longer needed — real reference-image chaining replaces it entirely), and ties rooms and mobs into one cohesive world rather than two disconnected style islands.

## Prompts

**Rooms:** same real-data-grounded prompt as before (name, zone, real CircleMUD sector type, description), plus a continuity instruction that now makes literal sense given a real reference image is attached: *"Continuing directly from the attached reference image — keep the same architecture, materials, palette, and lighting where the space doesn't change"* for a same-sector step, or *"Transitioning from the attached reference image's `<prev sector>` environment to a `<new sector>` environment"* when the sector changes between consecutive rooms.

**Mobs:** real short/long description text (same fields as before), a creature-portrait style suffix, plus for every mob after the first: *"Keep a consistent painterly style, palette, and lighting with the attached reference image, while depicting this different creature."* The first mob's prompt additionally references the hand-off from room art: *"Style continuation from a dark fantasy dungeon environment (attached reference) into a creature portrait."*

## Files

- New: `tools/gen-world-art.js` — replaces `tools/gen-room-art.js` and `tools/gen-mob-art.js` as the single script driving the whole 14-image chain (both room and mob output paths, since they now share one pipeline/chain instead of two independent ones). The old two scripts are removed.
- Regenerated: `web/assets/rooms/{3001,3054,3059,3060,3061,18600,18601,18602,18603}.jpg`.
- Regenerated: `web/assets/mobs/{18601,18602,18604,18611,18615}.jpg`.
- NOT touched: `web/assets/rooms/placeholder.jpg` and `web/assets/mobs/placeholder.jpg` — out of scope. The user's request was about the room/mob art, not the generic fallback images; leave both exactly as they are (existing Pollinations-generated files, untouched).
- No changes to `bridge/server.js`, `web/client.js`, `wdii/src` — this only touches the art-generation tool and its output images, same as every prior art-generation plan.

## Cost / risk

14 paid OpenAI API calls (1 `generations` + 13 `edits`), `edits` calls cost more per-call than plain `generations` since they also consume input-image tokens (confirmed via OpenAI docs). User explicitly confirmed proceeding. `OPENAI_API_KEY` is read from `~/Documents/WHCreative/apps/web/.env.local` at run time only (same as the landing-page script) — never printed, never committed, never hardcoded.

## Testing

Manual/observational, per project convention: run the script, view each generated image directly (already an established verification technique in this project — Read tool renders JPEGs), specifically check adjacent pairs in the chain for genuine visual continuity (same architecture/palette carried forward, believable transitions at sector changes, and the room→mob hand-off reads as "same world" rather than a jarring style break). Confirm the browser client (`web/client.js`'s existing `MVP_ROOM_ART`/`MVP_MOB_ART` Sets, unchanged) still displays the regenerated images correctly — no code change needed there since filenames are identical.

## Out of scope

- Any change to the landing-page hero image or script (`tools/gen-landing-art.js`, `web/assets/landing-hero.jpg`) — already done, unrelated chain.
- Any change to the locked Pollinations-only decision for future art beyond this one regeneration — if more room/mob art is needed later, ask the user which pipeline to use again, don't assume GPT-Image is now the default.
- Any change to `MVP_ROOM_ART`/`MVP_MOB_ART` Sets or which rooms/mobs are in scope (still the same locked 9 rooms + 5 mobs).
