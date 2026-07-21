/* ************************************************************************
 *   File: bleed.c                                      Part of Wardome   *
 *  Usage: "Zone Bleed" event subsystem -- see bleed.h for design notes.  *
 *                                                                         *
 *  v1 pilot: a single hardcoded pairing, Asgard (zone 122) bleeding into *
 *  the Shire (zone 27). All bleed mob/item prototypes live in zone 999   *
 *  (vnums 99900-99999), which is never reset by the normal zone cycle -- *
 *  instances only ever come from this file explicitly spawning them.     *
 * ************************************************************************ */

#include "conf.h"
#include "sysdep.h"
#include "structs.h"
#include "utils.h"
#include "comm.h"
#include "handler.h"
#include "db.h"
#include "interpreter.h"
#include "bleed.h"

#define PULSE_BLEED (30 RL_SEC)

#define BLEED_MAX_ROOMS   8
#define BLEED_NUM_MOBS    3   /* roaming invaders, not counting the anchor */

extern struct char_data *character_list;
extern struct room_data *world;
extern int top_of_world;
extern struct zone_data *zone_table;
extern int top_of_zone_table;
extern struct index_data *mob_index;
extern struct descriptor_data *descriptor_list;

struct bleed_pairing {
  /* --- static config --- */
  const char *label;
  int source_zone_vnum;             /* heat accrues from kills here */
  int target_zone_vnum;             /* zone the shout below reaches */
  int target_room_vnums[BLEED_MAX_ROOMS];
  int num_rooms;
  int mob_vnums[BLEED_NUM_MOBS];
  int anchor_vnum;
  int item_vnums[BLEED_NUM_MOBS + 1]; /* one per roaming mob, +1 for anchor */
  int base_threshold;
  int default_duration_minutes;
  int cooldown_days;
  const char *activate_msg;
  const char *shout_speaker;        /* who the one-time activation shout is from */
  const char *shout_msg;            /* fired once, zone-wide, on activation */
  const char *resolve_anchor_msg;
  const char *resolve_timeout_msg;
  const char *room_flavor;
  const char *ambient_echo[3];

  /* --- runtime state (resolved/reset by bleed_init) --- */
  int source_zone_index;            /* index into zone_table, or -1 */
  int target_zone_index;            /* index into zone_table, or -1 */
  int target_zone_bottom_vnum;      /* world[].zone is never populated in  */
  int target_zone_top_vnum;         /* this codebase -- compare vnum ranges instead */
  int room_rnums[BLEED_MAX_ROOMS];
  int mob_rnums[BLEED_NUM_MOBS];
  int anchor_rnum;
  int item_rnums[BLEED_NUM_MOBS + 1];
  long heat;
  long threshold;                   /* current rolled threshold */
  int active;
  time_t activated_at;
  int duration_minutes;             /* duration of the *current/last* activation */
  time_t cooldown_until;
  time_t last_heat_decay;
};

static struct bleed_pairing pairings[] = {
  {
    .label = "Asgard->Shire (The Wild Hunt Spills Over)",
    .source_zone_vnum = 122,
    .target_zone_vnum = 27,
    .target_room_vnums = { 2714, 2715, 2716, 2718, 2720, 2721, 2724, 2728 },
    .num_rooms = 8,
    .mob_vnums = { 99901, 99902, 99903 },
    .anchor_vnum = 99904,
    .item_vnums = { 99910, 99911, 99912, 99913 },
    .base_threshold = 200,
    .default_duration_minutes = 1080,  /* 18 real hours */
    .cooldown_days = 5,
    .activate_msg =
      "\r\n&CA distant horn sounds, impossibly loud, from somewhere that isn't the Shire...&n\r\n",
    .shout_speaker = "Fenrisulfr's Whelp, off its leash",
    .shout_msg = "howls, 'THE HUNT RIDES THROUGH HERE NOW!'",
    .resolve_anchor_msg =
      "\r\n&CThe golden flicker in the sky snaps shut like a closing eye. The Wild Hunt withdraws.&n\r\n",
    .resolve_timeout_msg =
      "\r\n&CThe frost recedes from the hedgerows. Whatever came through has moved on.&n\r\n",
    .room_flavor =
      "\r\nThe grass here is rimed with unnatural frost, and the sky above flickers\r\nfaintly gold, as if a second sun struggles to rise where it shouldn't.",
    .ambient_echo = {
      "A distant horn sounds, impossibly loud, from somewhere that isn't the Shire.",
      "Wisps of golden light coil and vanish into the hedgerow.",
      "&C(the air here tastes faintly of copper)&n",
    },
  },
};

#define NUM_PAIRINGS (sizeof(pairings) / sizeof(pairings[0]))

static int find_zone_index_by_vnum(int zone_vnum)
{
  int i;

  for (i = 0; i <= top_of_zone_table; i++)
    if (zone_table[i].number == zone_vnum)
      return i;

  return -1;
}

void bleed_init(void)
{
  int p, r, m;
  struct bleed_pairing *bp;

  for (p = 0; p < (int)NUM_PAIRINGS; p++) {
    bp = &pairings[p];

    bp->source_zone_index = find_zone_index_by_vnum(bp->source_zone_vnum);
    if (bp->source_zone_index < 0)
      log("SYSERR: bleed_init: source zone vnum %d not found for pairing '%s'",
          bp->source_zone_vnum, bp->label);

    bp->target_zone_index = find_zone_index_by_vnum(bp->target_zone_vnum);
    if (bp->target_zone_index < 0) {
      log("SYSERR: bleed_init: target zone vnum %d not found for pairing '%s'",
          bp->target_zone_vnum, bp->label);
      bp->target_zone_bottom_vnum = -1;
      bp->target_zone_top_vnum = -1;
    } else {
      bp->target_zone_bottom_vnum = bp->target_zone_index ?
        zone_table[bp->target_zone_index - 1].top + 1 : 0;
      bp->target_zone_top_vnum = zone_table[bp->target_zone_index].top;
    }

    for (r = 0; r < bp->num_rooms; r++) {
      bp->room_rnums[r] = real_room(bp->target_room_vnums[r]);
      if (bp->room_rnums[r] < 0)
        log("SYSERR: bleed_init: room vnum %d not found for pairing '%s'",
            bp->target_room_vnums[r], bp->label);
    }

    for (m = 0; m < BLEED_NUM_MOBS; m++) {
      bp->mob_rnums[m] = real_mobile(bp->mob_vnums[m]);
      if (bp->mob_rnums[m] < 0)
        log("SYSERR: bleed_init: mob vnum %d not found for pairing '%s'",
            bp->mob_vnums[m], bp->label);
    }
    bp->anchor_rnum = real_mobile(bp->anchor_vnum);
    if (bp->anchor_rnum < 0)
      log("SYSERR: bleed_init: anchor mob vnum %d not found for pairing '%s'",
          bp->anchor_vnum, bp->label);

    for (m = 0; m < BLEED_NUM_MOBS + 1; m++) {
      bp->item_rnums[m] = real_object(bp->item_vnums[m]);
      if (bp->item_rnums[m] < 0)
        log("SYSERR: bleed_init: item vnum %d not found for pairing '%s'",
            bp->item_vnums[m], bp->label);
    }

    bp->heat = 0;
    bp->active = 0;
    bp->activated_at = 0;
    bp->duration_minutes = 0;
    bp->cooldown_until = 0;
    bp->last_heat_decay = time(0);
    /* random threshold within 0.7x-1.4x of base, re-rolled each cycle */
    bp->threshold = bp->base_threshold * 7 / 10 +
                     (number(0, (bp->base_threshold * 7 / 10)));

    log("Zone Bleed: pairing '%s' initialized (threshold=%ld).",
        bp->label, bp->threshold);
  }
}

/* NPCs above this level are worth heat; keeps starter-zone trash killed
   in passing from padding an unrelated pairing's threshold. */
#define BLEED_MIN_HEAT_LEVEL 5

void bleed_register_kill(struct char_data *ch, struct char_data *victim)
{
  int p, zidx;
  struct bleed_pairing *bp;

  if (!ch || !victim || IS_NPC(ch) || !IS_NPC(victim))
    return;
  if (GET_LEVEL(victim) < BLEED_MIN_HEAT_LEVEL)
    return;
  if (IN_ROOM(victim) < 0 || IN_ROOM(victim) > top_of_world)
    return;

  zidx = world[IN_ROOM(victim)].zone;

  for (p = 0; p < (int)NUM_PAIRINGS; p++) {
    bp = &pairings[p];
    if (bp->active || zidx != bp->source_zone_index)
      continue;
    bp->heat += 1;
  }
}

static void bleed_set_room_flag(struct bleed_pairing *bp, bool on)
{
  int r;

  for (r = 0; r < bp->num_rooms; r++) {
    if (bp->room_rnums[r] < 0)
      continue;
    if (on)
      SET_BIT(world[bp->room_rnums[r]].room_flags, ROOM_BLEED);
    else
      REMOVE_BIT(world[bp->room_rnums[r]].room_flags, ROOM_BLEED);
  }
}

/* One-time, zone-wide "something's happening" signal on activation --
   not a system announcement, just a very loud mob making noise. Mirrors
   the same audience filter do_gen_comm() uses for SCMD_SHOUT (same zone,
   awake, not soundproofed, not mid-edit), since NPCs can't call
   do_gen_comm() directly (it requires ch->desc). */
static void bleed_zone_shout(struct bleed_pairing *bp)
{
  struct descriptor_data *d;
  char shout_buf[MAX_STRING_LENGTH];

  if (bp->target_zone_index < 0)
    return;

  snprintf(shout_buf, sizeof(shout_buf), "\r\n&Y%s %s&n\r\n",
           bp->shout_speaker, bp->shout_msg);

  for (d = descriptor_list; d; d = d->next) {
    int room_vnum, in_zone;

    if (STATE(d) != CON_PLAYING || !d->character || IS_NPC(d->character))
      continue;
    if (PLR_FLAGGED(d->character, PLR_WRITING))
      continue;

    /* immortals hear it regardless of location -- a GM should always know
       an event fired without having to travel there first. Regular
       players only hear it if they're actually in the target zone. */
    if (GET_LEVEL(d->character) < LVL_IMMORT) {
      room_vnum = GET_ROOM_VNUM(d->character->in_room);
      in_zone = (room_vnum >= bp->target_zone_bottom_vnum &&
                 room_vnum <= bp->target_zone_top_vnum);
      if (!in_zone)
        continue;
      if (GET_POS(d->character) < POS_RESTING)
        continue;
      if (ROOM_FLAGGED(d->character->in_room, ROOM_SOUNDPROOF))
        continue;
    }
    send_to_char(shout_buf, d->character);
  }
}

static void bleed_activate(int p, int duration_minutes)
{
  struct bleed_pairing *bp = &pairings[p];
  int r, m, target_room;
  struct char_data *mob;
  struct obj_data *item;

  if (bp->active)
    return;

  bleed_set_room_flag(bp, TRUE);

  /* the 3 roaming mobs, one item each, scattered across the eligible rooms */
  for (m = 0; m < BLEED_NUM_MOBS; m++) {
    if (bp->mob_rnums[m] < 0 || bp->num_rooms == 0)
      continue;
    mob = read_mobile(bp->mob_rnums[m], REAL);
    if (!mob)
      continue;
    target_room = bp->room_rnums[number(0, bp->num_rooms - 1)];
    if (target_room < 0)
      target_room = bp->room_rnums[0];
    char_to_room(mob, target_room);

    if (bp->item_rnums[m] >= 0 && (item = read_object(bp->item_rnums[m], REAL)))
      obj_to_char(item, mob);
  }

  /* the anchor, in the first eligible room */
  if (bp->anchor_rnum >= 0 && bp->num_rooms > 0 && bp->room_rnums[0] >= 0) {
    mob = read_mobile(bp->anchor_rnum, REAL);
    if (mob) {
      char_to_room(mob, bp->room_rnums[0]);
      if (bp->item_rnums[BLEED_NUM_MOBS] >= 0 &&
          (item = read_object(bp->item_rnums[BLEED_NUM_MOBS], REAL)))
        obj_to_char(item, mob);
    }
  }

  for (r = 0; r < bp->num_rooms; r++)
    if (bp->room_rnums[r] >= 0)
      send_to_room(bp->activate_msg, bp->room_rnums[r]);

  bleed_zone_shout(bp);

  bp->active = 1;
  bp->activated_at = time(0);
  bp->duration_minutes = duration_minutes;
  bp->heat = 0;

  log("Zone Bleed: pairing '%s' ACTIVATED (duration=%d min).",
      bp->label, duration_minutes);
}

/* exclude: a character already being extracted by the caller (e.g. the
   anchor mob mid-raw_kill()) -- must NOT be extracted again here, or the
   caller's own extract_char() on it afterward is a double-free. */
static void bleed_purge_mobs(struct bleed_pairing *bp, struct char_data *exclude)
{
  struct char_data *ch, *next_ch;
  int m;
  bool is_bleed_mob;

  for (ch = character_list; ch; ch = next_ch) {
    next_ch = ch->next;
    if (!IS_NPC(ch) || ch == exclude)
      continue;
    is_bleed_mob = (GET_MOB_VNUM(ch) == bp->anchor_vnum);
    for (m = 0; !is_bleed_mob && m < BLEED_NUM_MOBS; m++)
      if (GET_MOB_VNUM(ch) == bp->mob_vnums[m])
        is_bleed_mob = TRUE;
    if (is_bleed_mob)
      extract_char(ch);
  }
}

static void bleed_resolve(int p, const char *msg, struct char_data *exclude)
{
  struct bleed_pairing *bp = &pairings[p];
  int r;

  if (!bp->active)
    return;

  for (r = 0; r < bp->num_rooms; r++)
    if (bp->room_rnums[r] >= 0)
      send_to_room(msg, bp->room_rnums[r]);

  bleed_purge_mobs(bp, exclude);
  bleed_set_room_flag(bp, FALSE);

  bp->active = 0;
  bp->activated_at = 0;
  bp->duration_minutes = 0;
  bp->cooldown_until = time(0) + ((long)bp->cooldown_days * 24 * 60 * 60);
  bp->threshold = bp->base_threshold * 7 / 10 +
                   (number(0, (bp->base_threshold * 7 / 10)));

  log("Zone Bleed: pairing '%s' RESOLVED, next threshold=%ld, cooldown until %ld.",
      bp->label, bp->threshold, (long)bp->cooldown_until);
}

void bleed_check_anchor_kill(struct char_data *victim)
{
  int p;
  struct bleed_pairing *bp;

  if (!victim || !IS_NPC(victim))
    return;

  for (p = 0; p < (int)NUM_PAIRINGS; p++) {
    bp = &pairings[p];
    if (bp->active && GET_MOB_VNUM(victim) == bp->anchor_vnum)
      bleed_resolve(p, bp->resolve_anchor_msg, victim);
  }
}

void bleed_heartbeat(void)
{
  int p, r;
  struct bleed_pairing *bp;
  time_t now = time(0);

  for (p = 0; p < (int)NUM_PAIRINGS; p++) {
    bp = &pairings[p];

    if (bp->active) {
      if (bp->duration_minutes > 0 &&
          now >= bp->activated_at + ((long)bp->duration_minutes * 60)) {
        bleed_resolve(p, bp->resolve_timeout_msg, NULL);
        continue;
      }
      /* ambient echo, low chance per tick so it reads as occasional */
      if (!number(0, 5)) {
        const char *echo = bp->ambient_echo[number(0, 2)];
        for (r = 0; r < bp->num_rooms; r++)
          if (bp->room_rnums[r] >= 0)
            send_to_room(echo, bp->room_rnums[r]);
      }
      continue;
    }

    /* heat decay, ~10-15% per real day of inactivity */
    if (now - bp->last_heat_decay >= 24 * 60 * 60) {
      bp->heat -= bp->heat * 12 / 100;
      if (bp->heat < 0)
        bp->heat = 0;
      bp->last_heat_decay = now;
    }

    if (bp->cooldown_until && now < bp->cooldown_until)
      continue;

    if (bp->heat >= bp->threshold)
      bleed_activate(p, bp->default_duration_minutes);
  }
}

const char *bleed_room_flavor(int room_rnum)
{
  int p;

  if (room_rnum < 0 || room_rnum > top_of_world)
    return NULL;
  if (!ROOM_FLAGGED(room_rnum, ROOM_BLEED))
    return NULL;

  for (p = 0; p < (int)NUM_PAIRINGS; p++)
    if (pairings[p].active)
      return pairings[p].room_flavor;

  return NULL;
}

ACMD(do_bleedtrigger)
{
  char arg[MAX_INPUT_LENGTH];
  int p, duration;

  if (GET_LEVEL(ch) < LVL_IMMORT) {
    send_to_char("Huh?!?\r\n", ch);
    return;
  }

  one_argument(argument, arg);

  if (!*arg) {
    send_to_char("Usage: bleedtrigger <pairing#> [duration in minutes]\r\n", ch);
    return;
  }

  p = atoi(arg) - 1;
  if (p < 0 || p >= (int)NUM_PAIRINGS) {
    send_to_char("No such pairing. Use 'bleedstatus' to list them.\r\n", ch);
    return;
  }

  if (pairings[p].active) {
    send_to_char("That pairing is already active.\r\n", ch);
    return;
  }

  half_chop(argument, arg, buf);
  duration = *buf ? atoi(buf) : pairings[p].default_duration_minutes;
  if (duration <= 0)
    duration = pairings[p].default_duration_minutes;

  bleed_activate(p, duration);
  send_to_char("Bleed force-triggered.\r\n", ch);
}

ACMD(do_bleedstatus)
{
  char outbuf[MAX_STRING_LENGTH];
  int p;
  struct bleed_pairing *bp;
  time_t now = time(0);

  if (GET_LEVEL(ch) < LVL_IMMORT) {
    send_to_char("Huh?!?\r\n", ch);
    return;
  }

  strcpy(outbuf, "&YZone Bleed status:&n\r\n");
  send_to_char(outbuf, ch);

  for (p = 0; p < (int)NUM_PAIRINGS; p++) {
    bp = &pairings[p];
    if (bp->active) {
      long remain = (bp->activated_at + (long)bp->duration_minutes * 60) - now;
      sprintf(outbuf, "%d. %s: &RACTIVE&n, %ld sec remaining\r\n",
              p + 1, bp->label, remain > 0 ? remain : 0);
    } else if (bp->cooldown_until && now < bp->cooldown_until) {
      sprintf(outbuf, "%d. %s: cooldown, %ld sec remaining, heat %ld/%ld\r\n",
              p + 1, bp->label, (long)(bp->cooldown_until - now), bp->heat, bp->threshold);
    } else {
      sprintf(outbuf, "%d. %s: idle, heat %ld/%ld\r\n",
              p + 1, bp->label, bp->heat, bp->threshold);
    }
    send_to_char(outbuf, ch);
  }
}
