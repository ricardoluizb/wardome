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
const MOBS = [
  { vnum: 581, prompt: "Gandalf the Grey, an aged wizard with a long grey beard, wide-brimmed pointed hat, and a grey robe, leaning on a gnarled wooden staff, standing in a plaza teaching would-be adventurers, wise and slightly weary expression." },
  { vnum: 500, prompt: "the Spirit of WarDome, a translucent glowing ghostly humanoid figure hovering just above the ground, faint ethereal blue-white light radiating from within, ancient and watchful, guarding the city's heart." },
  { vnum: 501, prompt: "the Chaos Guardian, a hulking armored sentinel wreathed in crackling chaotic energy, cracked and scorched heavy plate armor, glowing unstable runes etched into the metal, an imposing city defender." },
  { vnum: 502, prompt: "a city archer, lightly armored in leather and a hooded cloak, quiver of arrows on the back, longbow in hand, alert stance atop a city wall or rooftop." },
  { vnum: 503, prompt: "the mayor of Wardome City, a portly middle-aged man in fine velvet robes trimmed with fur, a gold chain of office around his neck, standing with self-important posture inside a city hall." },
  { vnum: 504, prompt: "the Wardome Sheriff, a grizzled lawman in worn leather armor with a tin star badge, a hand resting on the hilt of a sword, stern and watchful expression, patrolling the city streets." },
  { vnum: 505, prompt: "the Questmaster Ashlandar, a mysterious robed figure with an ornate ledger and quill, standing before a great notice board covered in quest parchments, an air of ancient authority." },
  { vnum: 506, prompt: "Hazaard, a roguish, sharp-featured man with a knowing smirk, dressed in dark practical traveling clothes, leaning against a city wall." },
  { vnum: 507, prompt: "Hazaard, a second incarnation -- similar roguish sharp-featured man in dark practical traveling clothes, standing watchfully in a different part of the city." },
  { vnum: 508, prompt: "the Powerful General, a battle-scarred military commander in ornate plate armor with a flowing cape, a ceremonial sword at the hip, commanding presence, standing before city troops." },
  { vnum: 509, prompt: "Wardome House Maker, a craftsman in a leather apron surrounded by tools and half-built wooden structures, measuring tape and hammer in hand, practical and industrious." },
  { vnum: 510, prompt: "an alley cat, a scrawny street cat with matted fur, perched on a crate in a dim city alley, wary yellow eyes, tail flicking." },
  { vnum: 511, prompt: "a female prostitute, a world-weary woman in worn, faded finery, leaning in a shadowed doorway of the city at dusk, painted in a tasteful, non-explicit dark-fantasy noir style." },
  { vnum: 512, prompt: "the Cyber Man, a strange anachronistic figure part-flesh part-machine, exposed brass gears and glowing wires beneath tattered clothing, an unsettling fusion of technology and dark fantasy." },
  { vnum: 513, prompt: "an oracle, a serene blindfolded seer in flowing pale robes, faint golden light emanating from around them, standing before a reflecting pool or brazier of incense smoke." },
  { vnum: 514, prompt: "the casino master, a slick, sharply-dressed figure in a fine dark suit and slicked-back hair, a deck of cards fanned in one hand, standing in a dim, richly decorated casino interior." },
  { vnum: 559, prompt: "the Peacekeeper, a stern city guard in polished ceremonial armor bearing a city crest, a long spear held upright, standing sentinel at a gate." },
  { vnum: 560, prompt: "the Wardome Guard, an armored city soldier in practical plate and chainmail, sword and shield ready, standing watch at a city checkpoint." },
  { vnum: 561, prompt: "a janitor, a tired middle-aged man in simple worn clothes, mop and bucket in hand, sweeping the steps of a grand city building." },
  { vnum: 562, prompt: "the beastly fido, a mangy, oversized feral dog with matted fur and bared teeth, prowling a dark city alley, unsettling and dangerous." },
  { vnum: 563, prompt: "the mercenary, a hardened sellsword in mismatched scavenged armor, an assortment of weapons strapped to the back, scarred face, leaning against a tavern wall." },
  { vnum: 564, prompt: "the drunk, a disheveled man slumped against a barrel outside a tavern, bottle loosely in hand, unfocused eyes, tattered clothes." },
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

  let prevPath = null;
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
