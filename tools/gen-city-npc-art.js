// tools/gen-city-npc-art.js
// Generates GPT-Image-1 portraits for every NPC actually spawned in zone 5
// "Wardome - The WarDome City" (via zone-reset M commands, cross-referenced
// against whichever .mob file actually backs each vnum -- several city
// shopkeepers/animals live in zone 30's mob file, one cameo mage in zone
// 11's). Replaces the older, low-res Pollinations placeholders for these
// vnums with the premium chained-continuity GPT-Image pipeline already
// used for room/mob art and the Hobgoblin King.
//
// Usage: OPENAI_API_KEY=... node tools/gen-city-npc-art.js
const fs = require('fs');
const path = require('path');

const MOBS_OUT = path.join(__dirname, '..', 'web', 'assets', 'mobs');
const IMAGE_SIZE = '1536x1024';
const IMAGE_QUALITY = 'high';

const STYLE_SUFFIX =
  "dark fantasy RPG character portrait, digital painting in the style of " +
  "Baldur's Gate 3 and Disco Elysium, dramatic atmospheric lighting, painterly " +
  "detail, single figure centered, set against the backdrop of a gritty " +
  "medieval-fantasy city street or interior, no text, no UI, no game overlay";

// Ordered for a sensible continuity chain: start with a strongly-defined
// archetype (Gandalf) and move through related roles so the style stays
// coherent (city guards together, shopkeepers together, animals together,
// oddities/faceless mobs last).
//
// NOTE: vnums 581, 500-514, 559-564 (22 total) already succeeded in an
// earlier run (committed) before the OpenAI account hit its billing hard
// limit -- trimmed from this array so a re-run only spends money on the
// remaining vnums. The first entry below chains continuity from 564.jpg
// (the last successful portrait), same as any other reference-chained
// entry.
const MOBS = [
  { vnum: 565, prompt: "the beggar, a gaunt, hunched figure in tattered rags, a worn cup extended for coins, sitting on the cobblestones outside a grand building." },
  { vnum: 566, prompt: "the Cyber Man, a second sighting -- part-flesh part-machine figure with exposed brass gears and glowing wires beneath tattered clothing, standing in a different city district." },
  { vnum: 567, prompt: "the Wardome Gateguard, a heavily armored sentinel standing at the towering city gates, halberd in hand, city crest emblazoned on the chestplate." },
  { vnum: 569, prompt: "the wardome gateguard, a second gate sentinel, heavily armored with a halberd, stationed at the opposite side of the great city gates." },
  { vnum: 575, prompt: "the Training Master, a muscular veteran instructor in simple practical armor, wooden training weapons racked behind them, demonstrating a stance to unseen students." },
  { vnum: 576, prompt: "the Scientist, an eccentric figure in a stained lab coat over fantasy-era clothing, surrounded by bubbling alchemical apparatus and strange glowing vials." },
  { vnum: 577, prompt: "a Head-Hunter mercenary, a grim bounty hunter clad in dark leather and trophies of past kills, a crossbow slung over one shoulder, cold calculating gaze." },
  { vnum: 578, prompt: "the barman of the tavern, a burly, mustached man behind a worn wooden bar, polishing a tankard, warm but weary tavern-keeper expression, shelves of bottles behind him." },
  { vnum: 579, prompt: "a janitor, a second city janitor in simple worn clothes, broom in hand, sweeping outside a different city building." },
  { vnum: 580, prompt: "a faceless mob, an anonymous hooded figure wrapped in a plain dark cloak, features entirely obscured in shadow beneath the hood, an unremarkable presence blending into the city crowd." },
  { vnum: 590, prompt: "the thief jaele, a lithe, hooded rogue in dark fitted leathers, a dagger concealed in hand, lurking in the shadow of a city archway, sly and watchful." },
  { vnum: 598, prompt: "a faceless mob, a second anonymous hooded figure in a plain dark cloak, features obscured in shadow, standing quietly at the edge of a city square." },
  { vnum: 599, prompt: "the God of the Giths, an alien, otherworldly humanoid figure radiating psionic energy, elongated features and glowing eyes, an aura of ancient inhuman power." },
  { vnum: 1129, prompt: "Maltzabor, the recharger mage, a scholarly spellcaster in deep blue robes lined with arcane sigils, holding a glowing crystal focus, calm and studious expression." },
  { vnum: 3000, prompt: "the wizard, an elderly spellcaster in dark starry robes, a tall pointed hat, holding a carved wooden staff topped with a crystal, standing in a cluttered magic shop." },
  { vnum: 3001, prompt: "the baker, a plump, flour-dusted woman in an apron, fresh loaves of bread on the counter behind her, warm and welcoming expression, inside a cozy bakery." },
  { vnum: 3002, prompt: "the grocer, a stout middle-aged man in a simple apron, surrounded by baskets of fresh produce and sacks of grain, friendly shopkeeper demeanor." },
  { vnum: 3003, prompt: "the weaponsmith, a burly, soot-streaked craftsman in a leather apron, hammer in hand beside an anvil, walls lined with swords, axes, and polearms." },
  { vnum: 3004, prompt: "the armourer, a stocky craftsman in a thick leather apron, surrounded by suits of plate armor and shields on display, calloused hands and a keen professional eye." },
  { vnum: 3006, prompt: "Captain Stolar, a stern, battle-hardened city officer in polished ceremonial armor bearing rank insignia, standing at attention with a commanding presence." },
  { vnum: 3009, prompt: "Wally the Watermaster, a cheerful older man in simple robes, standing beside a well or water trough, ladle in hand, humble and good-natured." },
  { vnum: 3010, prompt: "the postmaster, a bespectacled, meticulous clerk behind a counter stacked with letters and parcels, quill and ledger in hand, orderly and precise." },
  { vnum: 3030, prompt: "the Blacksmith, a broad-shouldered craftsman with soot-blackened arms, hammering a glowing piece of metal on an anvil beside a roaring forge, sparks flying." },
  { vnum: 3040, prompt: "the bartender, a friendly, mustached tavern keeper wiping down a wooden bar counter, shelves of bottles and mugs behind him, warm tavern lighting." },
  { vnum: 3069, prompt: "a raven, a large glossy black raven perched on a wooden signpost or rooftop, sharp intelligent eyes, feathers gleaming, an omen-like presence over the city." },
  { vnum: 3080, prompt: "the priest apprentice, a young acolyte in simple pale robes, hands clasped in quiet prayer, standing before a small city shrine or altar." },
  { vnum: 3090, prompt: "a kitten, a small fluffy kitten playing with a loose thread on a cobblestone street, wide curious eyes, tail raised." },
  { vnum: 3091, prompt: "a puppy, a small scruffy puppy sitting eagerly on a city street corner, tongue out, wagging tail, floppy ears." },
  { vnum: 3092, prompt: "a beagle, a floppy-eared beagle dog sniffing along a cobblestone city street, alert nose down, tail up." },
  { vnum: 3093, prompt: "a rottweiler, a powerfully built black-and-tan rottweiler standing guard outside a building, muscular and alert, collar with a city tag." },
  { vnum: 3094, prompt: "a wolf, a lean grey wolf prowling at the edge of the city, wary yellow eyes, fur bristling, an out-of-place wild presence in the urban streets." },
];

function outPath(vnum) {
  return path.join(MOBS_OUT, `${vnum}.jpg`);
}

async function generateFromScratch(prompt, apiKey) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: IMAGE_SIZE, quality: IMAGE_QUALITY }),
  });
  if (!res.ok) throw new Error(`generations HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function generateFromReference(refImagePath, prompt, apiKey) {
  const refBuf = fs.readFileSync(refImagePath);
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new Blob([refBuf], { type: 'image/jpeg' }), 'reference.jpg');
  form.append('prompt', prompt);
  form.append('size', IMAGE_SIZE);
  form.append('quality', IMAGE_QUALITY);
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`edits HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment');
  fs.mkdirSync(MOBS_OUT, { recursive: true });

  const carryOverRef = outPath(564);
  let prevPath = fs.existsSync(carryOverRef) ? carryOverRef : null;
  for (let i = 0; i < MOBS.length; i++) {
    const { vnum, prompt } = MOBS[i];
    const out = outPath(vnum);
    const fullPrompt = `Wardome City. ${prompt}${prevPath ? ' Keep a consistent painterly style, palette, and lighting with the attached reference image, while depicting this different character.' : ''} ${STYLE_SUFFIX}`;

    let buf;
    try {
      if (prevPath) {
        buf = await generateFromReference(prevPath, fullPrompt, apiKey);
      } else {
        buf = await generateFromScratch(fullPrompt, apiKey);
      }
    } catch (err) {
      console.error(`[gen-city-npc-art] FAILED vnum ${vnum}: ${err.message}`);
      continue;
    }
    fs.writeFileSync(out, buf);
    console.log(`[gen-city-npc-art] wrote ${out} (${buf.length} bytes)`);
    prevPath = out;
  }
  console.log('[gen-city-npc-art] done');
}

main().catch((err) => {
  console.error('[gen-city-npc-art] fatal:', err.message);
  process.exit(1);
});
