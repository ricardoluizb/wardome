/* ************************************************************************
 *   File: bleed.h                                      Part of Wardome   *
 *  Usage: header for the "Zone Bleed" event subsystem                    *
 * ************************************************************************
 * Design notes (v1 pilot -- Asgard -> Shire only):
 *   - Heat accrues from player kills of NPCs in a "source" zone.
 *   - Once heat crosses a hidden, randomized threshold, a temporary
 *     invasion ("bleed") activates in a hand-picked set of rooms in a
 *     "target" zone: room flavor text changes, invader mobs spawn, and
 *     one of them (the "anchor") ends the bleed early if killed.
 *   - All mob/item prototypes for bleeds live in zone 999 (vnums
 *     99900-99999), which owns no live rooms of its own and is never
 *     reset by the normal zone-reset cycle -- nothing in it spawns
 *     except when this subsystem explicitly calls read_mobile()/
 *     read_object() and places the result manually.
 *   - v1 simplification: heat does not persist across a reboot, and
 *     personal per-player reward diminishing-returns are not tracked.
 *     Documented, not forgotten.
 */

#ifndef _BLEED_H_
#define _BLEED_H_

/* call once at boot, after the world/mob/obj tables are loaded */
void bleed_init(void);

/* call whenever ch (a player) kills victim (an NPC), from fight.c */
void bleed_register_kill(struct char_data *ch, struct char_data *victim);

/* call periodically (see PULSE_BLEED) from comm.c's heartbeat() */
void bleed_heartbeat(void);

/* call from fight.c's raw_kill(), before the victim is extracted --
   resolves the active bleed early if victim is its anchor mob */
void bleed_check_anchor_kill(struct char_data *victim);

/* returns flavor text to append in look_at_room() if the room (by rnum)
   has ROOM_BLEED set, or NULL if there's nothing to append */
const char *bleed_room_flavor(int room_rnum);

/* immortal-only debug commands (see interpreter.c cmd_info table) */
ACMD(do_bleedtrigger);
ACMD(do_bleedstatus);

#endif /* _BLEED_H_ */
