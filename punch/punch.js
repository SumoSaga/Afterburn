/* Punch: a layered sound engine for shooters (v0.5, 2026-11-19).
   Started fresh for Machine-Fall FPS. It does not use or need gk-audio.js.

   How a sound is built: every sound in the BANK is a stack of layers that play together.
   A gunshot is a crack (the sharp top), a body (the bark), a sub (the low weight), a short
   sine thump under it, and a mechanical click after. Each layer has its own volume, pitch
   and filters, and gets a little random pitch and volume every shot so no two are the same.
   The stack then goes to a bus, to an echo send (the yard's slapback), and to a master
   compressor and limiter that glue it together. Firing your own gun briefly turns the rest
   of the world down, which is most of what makes a gun feel loud.

   PUNCH.start(base)                 call from a click; makes the audio context and loads the samples. Returns a promise.
   PUNCH.play(name, opts)            opts: { pos:[x,y,z] metres, gain, pitch, delay, layerGain:{id:n}, solo:id }. Returns { stop(fade) }.
   PUNCH.listener(x,y,z, fx,fy,fz)   where the ears are and which way they face. Call once a frame.
   PUNCH.SET                         the mix: master, weapons, impacts, world, ui, tail, duck, sub. PUNCH.saveMix() keeps it.
   PUNCH.BANK / PUNCH.DEFAULTS       the sounds and their shipped values. PUNCH.saveBank() keeps edits on this browser.
   PUNCH.enable(false)               mute everything.
   PUNCH.loop(name, opts)            a looping bed or engine (bank entries marked loop). Returns { set({ pos, gain, pitch }), stop(fade) }.
   PUNCH.cmd(id) / PUNCH.titan(id)   speak a line from the command voice pack in use (PUNCH.voicePack: "mil" or "mac") or from the Titan's voice.
                                     Lines wait their turn, one at a time per voice, and a line that has waited too long is dropped.
   punch-director.js watches the game's own state every frame and calls these, so the game's files need no voice or ambience hooks. */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = Math.random;
  const SET = { on: 1, master: .8, weapons: 1, impacts: 1, world: 1, ui: 1, voice: 1, ambience: 1, tail: 1, duck: 1, sub: 1 };
  const BUSES = ["weapons", "impacts", "world", "ui", "voice", "ambience"];

  /* ---------- the bank ---------- */
  const T = (f0, f1, dur, gain) => ({ id: "thump", synth: 1, f0, f1, dur, gain });
  const BANK = {
    carbine: { group: "Carbine", label: "Carbine shot", bus: "weapons", tail: .5, duck: .4, rate: .095, layers: [
      { id: "crack", s: "carbine_crack", gain: .8, hp: 500, pv: .04, gv: .08, decay: .05, hold: .02 },
      { id: "body", s: "carbine_body", gain: .42, pv: .03, gv: .06, decay: .045, hold: .02, cut: .4, choke: 1 },
      { id: "sub", s: "carbine_sub", gain: .3, lp: 170, pv: .02, decay: .06, hold: .02, cut: .4, choke: 1 },
      T(95, 42, .11, .22),
      { id: "mech", s: "mech", gain: .1, hp: 1200, delay: .035, pv: .05 },
      { id: "tail", s: "tail_small", gain: .1, delay: .05, pv: .05, choke: 1 },
      { id: "brass", s: "shells", gain: .035, hp: 2500, delay: .28, pv: .15, chance: .3 }] },
    reload: { group: "Carbine", label: "Carbine reload", bus: "weapons", tail: .08, layers: [
      { id: "mag", s: "reload_mag", gain: .22, delay: .15, pv: .03 }, { id: "bolt", s: "reload_bolt", gain: .26, delay: 1.02, pv: .03 }] },
    dry: { group: "Carbine", label: "Empty click", bus: "weapons", tail: .05, layers: [{ id: "click", s: "dry", gain: .2, pv: .04 }] },
    swap: { group: "Carbine", label: "Weapon swap", bus: "weapons", tail: .05, layers: [{ id: "clack", s: "mech", gain: .14, pitch: .8, pv: .05 }, { id: "bolt", s: "reload_bolt", gain: .12, delay: .12, pitch: 1.1 }] },
    charge_up: { group: "Charge rifle", label: "Charge rifle winding up", bus: "weapons", tail: .15, layers: [{ id: "whine", s: "charge_up", gain: .14, pitch: 1.5 }] },
    charge_fire: { group: "Charge rifle", label: "Charge rifle shot", bus: "weapons", tail: .8, duck: .7, rate: .9, layers: [
      { id: "snap", s: "carbine_crack", gain: .7, hp: 1200, pitch: .75, pv: .03, decay: .06, hold: .02 },
      { id: "discharge", s: "charge_fire_a", gain: .6, hp: 60, pv: .03, decay: .16, hold: .05 },
      { id: "roar", s: "charge_fire_b", gain: .22, hp: 200, lp: 5000, pv: .03, decay: .3, hold: .05, cut: 1.3 },
      T(70, 30, .26, .4)] },
    charge_cool: { group: "Charge rifle", label: "Charge rifle cooling", bus: "weapons", tail: .1, layers: [{ id: "vent", s: "charge_cool", gain: .07, delay: .3, pv: .06 }] },
    cannon: { group: "Titan", label: "40 mm cannon shot", bus: "weapons", tail: .7, duck: .6, rate: .24, ref: 14, layers: [
      { id: "crack", s: "carbine_crack", gain: .7, hp: 300, pitch: .55, pv: .04, decay: .07, hold: .03 },
      { id: "bark", s: "cannon_bark", gain: .55, pv: .04, gv: .06, decay: .09, hold: .03, cut: .7, choke: 1 },
      { id: "boom", s: "cannon_boom", gain: .32, pv: .03, decay: .1, hold: .03, cut: .8, choke: 1 },
      T(60, 28, .24, .3),
      { id: "action", s: "mech", gain: .12, pitch: .5, delay: .08, pv: .05 },
      { id: "tail", s: "tail_big", gain: .07, delay: .06, pv: .05, choke: 1 }] },
    rocket: { group: "Titan", label: "Rocket leaving the pod", bus: "weapons", tail: .5, duck: .25, ref: 10, layers: [
      { id: "launch", s: "pod_launch", gain: .36, pv: .06, gv: .08, decay: .12, hold: .04 }, { id: "motor", s: "rocket_fly", gain: .08, pitch: 1.2, delay: .04, pv: .08, cut: .6 }, T(110, 50, .1, .12)] },
    titan_autocannon: { group: "Titan", label: "20 mm autocannon shot", bus: "weapons", tail: .6, duck: .5, rate: .12, ref: 14, layers: [
      { id: "crack", s: "carbine_crack", gain: .5, hp: 300, pitch: .6, pv: .04, decay: .06, hold: .025 },
      { id: "body", s: ["chain_a", "chain_b"], gain: .8, pv: .04, gv: .06, decay: .06, hold: .025, choke: 1 },
      { id: "boom", s: "cannon_boom", gain: .3, pv: .03, decay: .1, hold: .03, cut: .7, choke: 1 },
      T(65, 30, .2, .35),
      { id: "action", s: "mech", gain: .12, pitch: .5, delay: .05, pv: .05 },
      { id: "tail", s: "tail_big", gain: .1, delay: .06, pv: .05, choke: 1 }] },
    titan_spinup: { group: "Titan", label: "Autocannon barrels spinning up", bus: "weapons", tail: .1, layers: [{ id: "whir", s: "chain_spin", gain: .22 }] },
    explosion: { group: "Titan", label: "Shell blast", bus: "impacts", tail: .45, duck: .25, ref: 12, cool: .12, layers: [
      { id: "crack", s: "carbine_crack", gain: .5, pitch: .5, hp: 250, pv: .06, decay: .08, hold: .03 },
      { id: "blast", s: ["explosion_a", "explosion_b"], gain: .34, hp: 45, pv: .08, gv: .1, decay: .3, hold: .06 }, T(55, 25, .3, .25),
      { id: "tail", s: "tail_big", gain: .08, delay: .08, pv: .06 }] },
    titanfall: { group: "Titan", label: "Titanfall landing (stand-in)", bus: "impacts", tail: 1, duck: .8, ref: 25, layers: [
      { id: "blast", s: "explosion_b", gain: .34, pitch: .6, decay: .5, hold: .08 }, { id: "slam", s: "cannon_boom", gain: .28, pitch: .5, decay: .22, hold: .04 }, { id: "clang", s: "titan_hit", gain: .32, pitch: .5, delay: .02 }, T(48, 20, .6, .3)] },
    titan_hit: { group: "Titan", label: "Round on Titan armor", bus: "impacts", tail: .3, ref: 15, cool: .22, layers: [
      { id: "clang", s: "titan_hit", gain: .3, pv: .1, gv: .1, decay: .18, hold: .05 }, { id: "thud", s: "body_a", gain: .14, pitch: .6, lp: 900 }] },
    shield_hit: { group: "Titan", label: "Round on Titan shield", bus: "impacts", tail: .25, ref: 15, cool: .22, layers: [
      { id: "zap", s: "shield_hit", gain: .22, hp: 70, pv: .1, decay: .12, hold: .03, cut: .6 }, { id: "crackle", s: "charge_cool", gain: .09, pitch: 1.6, hp: 3000, cut: .2 }] },
    grunt_shot: { group: "Grunts", label: "Grunt rifle shot", bus: "world", tail: .9, ref: 10, layers: [
      { id: "crack", s: "carbine_crack", gain: .25, hp: 1500, pitch: .85, pv: .06, decay: .04, hold: .015, near: 1 },
      { id: "pop", s: "grunt_pop", gain: .3, pv: .06, gv: .1, decay: .12, hold: .04, near: 1 },
      { id: "thump", s: "grunt_thump", gain: .16, lp: 200, pv: .04, decay: .06, hold: .02, cut: .4, near: 1 },
      { id: "distant", s: ["distant_a", "distant_b"], gain: .9, pv: .06, gv: .1, far: 1 }] },
    flyby: { group: "Grunts", label: "Round passing your head", bus: "world", tail: .3, ref: 2, layers: [   // a near miss is a short dry supersonic crack, not a whoosh
      { id: "crack", s: ["flyby_b", "snap_a", "snap_b", "snap_c"], gain: .5, hp: 900, pv: .1, gv: .2, decay: .018, hold: .008 },
      { id: "air", s: "snap_air", gain: .05, hp: 3000, pv: .15, decay: .04, hold: .02, cut: .15, chance: .5 }] },
    pilot_hurt: { group: "Grunts", label: "You are hit", bus: "ui", tail: .05, layers: [{ id: "smack", s: "pilot_hurt", gain: .4, pv: .08 }, { id: "thud", s: "body_a", gain: .18, lp: 900, pv: .08 }] },
    impact_metal: { group: "Impacts", label: "Round on metal", bus: "impacts", tail: .35, ref: 5, layers: [
      { id: "clang", s: ["metal_a", "metal_b"], gain: .5, pv: .12, gv: .15 }, { id: "ricochet", s: "ricochet", gain: .12, pv: .2, chance: .08 }] },
    impact_concrete: { group: "Impacts", label: "Round on concrete", bus: "impacts", tail: .3, ref: 5, layers: [{ id: "smack", s: ["concrete_a", "concrete_b"], gain: .5, hp: 120, pv: .12, gv: .15 }] },
    impact_dirt: { group: "Impacts", label: "Round in the dirt", bus: "impacts", tail: .15, ref: 5, layers: [{ id: "thump", s: "dirt", gain: .5, hp: 100, pv: .15, gv: .15 }] },
    impact_body: { group: "Impacts", label: "Round on a grunt", bus: "impacts", tail: .15, ref: 4, layers: [{ id: "thud", s: ["body_a", "body_b"], gain: .45, hp: 90, pv: .1, gv: .1 }] },
    hitmarker: { group: "Feedback", label: "Hit marker", bus: "ui", tail: 0, layers: [{ id: "tick", s: "hitmarker", gain: .2, pv: .03 }] },
    kill: { group: "Feedback", label: "Grunt down", bus: "ui", tail: .1, layers: [{ id: "thunk", s: "kill", gain: .12, hp: 150, decay: .12, hold: .03, cut: .6, pv: .03 }, { id: "tick", s: "hitmarker", gain: .18, pitch: .8 }] },

    /* ---------- the armory: weapons the game does not have yet ---------- */
    pistol: { group: "Sidearm", label: "9 mm pistol shot", bus: "weapons", tail: .4, duck: .3, rate: .18, ref: 8, layers: [
      { id: "crack", s: "pistol_crack", gain: .75, hp: 300, pv: .04, gv: .08, decay: .045, hold: .018 },
      { id: "pop", s: "pistol_pop", gain: .3, hp: 200, pv: .04, decay: .08, hold: .02 },
      { id: "sub", s: "pistol_sub", gain: .22, lp: 160, pv: .02, decay: .05, hold: .02 },
      T(110, 50, .08, .15),
      { id: "slide", s: "mech", gain: .1, pitch: 1.3, hp: 1500, delay: .03, pv: .05 },
      { id: "tail", s: "tail_small", gain: .08, pitch: 1.1, delay: .05, pv: .05, choke: 1 }] },
    pistol_reload: { group: "Sidearm", label: "Pistol reload", bus: "weapons", tail: .08, layers: [{ id: "mag", s: "pistol_mag", gain: .22, delay: .2, pv: .03 }, { id: "rack", s: "pistol_rack", gain: .26, delay: .85, pv: .03 }] },
    smg: { group: "Submachine gun", label: "9 mm SMG shot", bus: "weapons", tail: .4, duck: .3, rate: .07, ref: 8, layers: [
      { id: "crack", s: "carbine_crack", gain: .35, hp: 1500, pitch: 1.2, pv: .05, decay: .03, hold: .012 },
      { id: "body", s: ["smg_a", "smg_b"], gain: .7, pv: .04, gv: .08, decay: .035, hold: .015, choke: 1 },
      { id: "sub", s: "carbine_sub", gain: .15, lp: 150, pv: .02, decay: .04, hold: .015, cut: .3, choke: 1 },
      T(110, 55, .07, .12),
      { id: "bolt", s: "mech", gain: .1, pitch: 1.2, hp: 1200, delay: .025, pv: .05 },
      { id: "tail", s: "tail_small", gain: .07, pitch: 1.1, delay: .05, pv: .05, choke: 1 }] },
    smg_reload: { group: "Submachine gun", label: "SMG reload", bus: "weapons", tail: .08, layers: [{ id: "mag", s: "smg_mag", gain: .22, delay: .15, pv: .03 }, { id: "handle", s: "smg_handle", gain: .26, delay: .95, pv: .03 }] },
    shotgun: { group: "Shotgun", label: "12 gauge blast", bus: "weapons", tail: .6, duck: .55, rate: .9, ref: 10, layers: [
      { id: "blast", s: ["shotgun_a", "shotgun_b"], gain: .8, pv: .04, gv: .08, decay: .07, hold: .03 },
      { id: "boom", s: "shotgun_boom", gain: .38, lp: 220, pv: .03, decay: .09, hold: .03 },
      T(80, 35, .18, .35),
      { id: "tail", s: "tail_small", gain: .14, pitch: .85, delay: .05, pv: .05 }] },
    shotgun_pump: { group: "Shotgun", label: "Pump the action", bus: "weapons", tail: .08, layers: [{ id: "pump", s: "shotgun_pump", gain: .3, pv: .03 }, { id: "hull", s: "hull_drop", gain: .1, delay: .35, pv: .1 }] },
    shotgun_shell: { group: "Shotgun", label: "Load one shell", bus: "weapons", tail: .06, layers: [{ id: "shell", s: "shotgun_shell", gain: .25, pv: .06 }] },
    lmg: { group: "Machine gun", label: "7.62 machine gun shot", bus: "weapons", tail: .55, duck: .45, rate: .1, ref: 12, layers: [
      { id: "crack", s: "dmr_crack", gain: .35, hp: 800, pv: .04, decay: .03, hold: .015 },
      { id: "body", s: ["lmg_a", "lmg_b"], gain: .75, pv: .03, gv: .06, decay: .045, hold: .02, choke: 1 },
      { id: "sub", s: "carbine_sub", gain: .3, lp: 170, pv: .02, decay: .06, hold: .02, cut: .4, choke: 1 },
      T(85, 40, .12, .25),
      { id: "action", s: "mech", gain: .14, pitch: .85, hp: 900, delay: .03, pv: .05 },
      { id: "tail", s: "tail_small", gain: .11, pitch: .95, delay: .05, pv: .05, choke: 1 },
      { id: "link", s: "shells", gain: .035, hp: 2500, delay: .22, pv: .15, chance: .4 }] },
    lmg_reload: { group: "Machine gun", label: "Machine gun reload", bus: "weapons", tail: .08, layers: [{ id: "belt", s: "lmg_reload", gain: .3, delay: .3, pv: .03 }] },
    dmr: { group: "Marksman rifle", label: "7.62 marksman rifle shot", bus: "weapons", tail: .6, duck: .5, rate: .35, ref: 12, layers: [
      { id: "crack", s: "dmr_crack", gain: .8, pv: .04, gv: .06, decay: .05, hold: .02 },
      { id: "body", s: "dmr_body", gain: .5, hp: 60, pv: .03, decay: .07, hold: .025 },
      T(90, 40, .14, .3),
      { id: "action", s: "mech", gain: .12, hp: 1000, delay: .05, pv: .05 },
      { id: "tail", s: "tail_small", gain: .14, delay: .05, pv: .05 }] },
    sniper: { group: ".50 rifle", label: ".50 cal rifle shot", bus: "weapons", tail: .8, duck: .75, rate: 1.4, ref: 16, layers: [
      { id: "snap", s: "carbine_crack", gain: .4, hp: 400, pitch: .6, pv: .03, decay: .05, hold: .02 },
      { id: "crack", s: "sniper_crack", gain: .85, pv: .03, decay: .08, hold: .03 },
      { id: "boom", s: "sniper_boom", gain: .5, pv: .03, decay: .09, hold: .035 },
      T(60, 26, .32, .45),
      { id: "tail", s: "tail_big", gain: .14, delay: .07, pv: .05 }, { id: "slap", s: "tail_small", gain: .14, pitch: .8, delay: .05, pv: .05 }] },
    sniper_bolt: { group: ".50 rifle", label: "Work the bolt", bus: "weapons", tail: .08, layers: [{ id: "bolt", s: "sniper_bolt", gain: .3, pv: .03 }, { id: "brass", s: "brass_big", gain: .12, delay: .5, pv: .08 }] },
    suppressed: { group: "Suppressed rifle", label: "Suppressed rifle shot", bus: "weapons", tail: .15, duck: .1, rate: .095, ref: 3, layers: [
      { id: "snap", s: ["supp_a", "supp_b"], gain: .5, pv: .05, gv: .08, decay: .04, hold: .015 },
      { id: "action", s: "mech", gain: .2, hp: 1000, delay: .02, pv: .05 },
      T(120, 60, .05, .1),
      { id: "brass", s: "shells", gain: .04, hp: 2500, delay: .28, pv: .15, chance: .3 }] },
    gl_launch: { group: "Launchers", label: "40 mm grenade launcher", bus: "weapons", tail: .5, duck: .4, ref: 10, layers: [
      { id: "pop", s: "gl_launch", gain: .7, pv: .04, decay: .08, hold: .03 }, T(100, 45, .12, .3), { id: "tail", s: "tail_small", gain: .1, pitch: .8, delay: .05 }] },
    gl_reload: { group: "Launchers", label: "Grenade launcher reload", bus: "weapons", tail: .08, layers: [{ id: "breech", s: "gl_reload", gain: .3, delay: .25, pv: .03 }] },
    rocket_launcher: { group: "Launchers", label: "Shoulder rocket launch", bus: "weapons", tail: .8, duck: .7, ref: 16, layers: [
      { id: "bang", s: "rl_bang", gain: .7, pv: .04, decay: .12, hold: .04 },
      { id: "backblast", s: "rl_blast", gain: .3, hp: 40, pv: .04, decay: .22, hold: .06 },
      T(70, 30, .25, .3),
      { id: "tail", s: "tail_big", gain: .14, delay: .08, pv: .05 }] },
    rocket_pass: { group: "Launchers", label: "Rocket flying past", bus: "world", tail: .3, ref: 8, layers: [{ id: "motor", s: "rocket_fly", gain: .5, pv: .08 }] },
    frag_pin: { group: "Grenade", label: "Pull the pin", bus: "weapons", tail: .05, layers: [{ id: "pin", s: "frag_pin", gain: .25, pv: .05 }] },
    frag_bounce: { group: "Grenade", label: "Grenade bouncing", bus: "impacts", tail: .2, ref: 4, layers: [{ id: "clunk", s: "frag_bounce", gain: .4, pv: .1, gv: .1 }] },
    frag_blast: { group: "Grenade", label: "Frag grenade blast", bus: "impacts", tail: .6, duck: .4, ref: 12, layers: [
      { id: "crack", s: "carbine_crack", gain: .5, pitch: .55, hp: 250, pv: .06, decay: .08, hold: .03 },
      { id: "blast", s: "frag_boom", gain: .4, hp: 40, pv: .08, gv: .1, decay: .28, hold: .07 },
      T(55, 25, .35, .3),
      { id: "tail", s: "tail_big", gain: .16, delay: .08, pv: .06 }] },
    melee_hit: { group: "Melee", label: "Rifle butt strike", bus: "impacts", tail: .1, ref: 4, layers: [{ id: "thud", s: "melee_hit", gain: .5, pv: .08, gv: .1 }] },
    melee_knife: { group: "Melee", label: "Knife", bus: "impacts", tail: .05, ref: 4, layers: [{ id: "stab", s: "melee_knife", gain: .4, pv: .08, gv: .1 }] },
    selector: { group: "Handling", label: "Fire selector click", bus: "weapons", tail: .04, layers: [{ id: "click", s: "selector", gain: .25, pv: .05 }] },
    raise: { group: "Handling", label: "Weapon raised, gear rattle", bus: "weapons", tail: .05, layers: [{ id: "rattle", s: "gear_rattle", gain: .16, pv: .08 }] },

    /* ---------- machines, Titan systems and ambience ---------- */
    titan_step: { group: "Titan machine", label: "Titan footstep", bus: "world", tail: .25, ref: 14, cool: .3, layers: [{ id: "stomp", s: ["titan_step_a", "titan_step_b"], gain: .24, pv: .08, gv: .12, decay: .1, hold: .04 }, { id: "clank", s: "mstep", gain: .08, pitch: .5, pv: .1 }, T(55, 28, .18, .2)] },
    titan_servo: { group: "Titan machine", label: "Titan servo", bus: "world", tail: .1, ref: 10, cool: 1.5, layers: [{ id: "servo", s: ["servo_a", "servo_b"], gain: .08, pv: .1, gv: .15, decay: .22, hold: .15, cut: .9 }] },
    titan_hatch: { group: "Titan machine", label: "Hatch opening or closing", bus: "world", tail: .2, ref: 8, layers: [{ id: "hatch", s: "hatch", gain: .18, pv: .05 }] },
    titan_boot: { group: "Titan machine", label: "Cockpit powering up", bus: "ui", tail: .05, layers: [{ id: "boot", s: "boot", gain: .3 }] },
    titan_dash: { group: "Titan machine", label: "Titan dash", bus: "world", tail: .4, ref: 12, layers: [{ id: "thrust", s: "dash", gain: .3, pv: .06, decay: .25, hold: .12 }, T(70, 35, .2, .2)] },
    titan_punch: { group: "Titan machine", label: "Titan fist swing", bus: "world", tail: .3, ref: 12, layers: [{ id: "swing", s: "punch_swing", gain: .25, pv: .06 }] },
    titan_punch_hit: { group: "Titan machine", label: "Titan fist landing", bus: "impacts", tail: .6, duck: .4, ref: 14, layers: [{ id: "slam", s: "punch_hit", gain: .6, pv: .06 }, { id: "clang", s: "titan_hit", gain: .3, pitch: .7 }, T(55, 25, .3, .45)] },
    titan_alarm: { group: "Titan machine", label: "Reactor alarm", bus: "ui", tail: .1, layers: [{ id: "alarm", s: "alarm", gain: .14, cut: 1.2 }] },
    shield_break: { group: "Titan machine", label: "Shield breaking", bus: "impacts", tail: .4, ref: 12, layers: [{ id: "pop", s: "shield_break", gain: .25, pv: .06, decay: .14, hold: .05 }] },
    shield_charge: { group: "Titan machine", label: "Shield recharging", bus: "world", tail: .2, ref: 10, layers: [{ id: "hum", s: "shield_charge", gain: .12 }] },
    cannon_reload: { group: "Titan machine", label: "40 mm cannon reload", bus: "weapons", tail: .1, layers: [{ id: "clunk", s: "cannon_reload", gain: .35, pv: .03 }] },
    pod_reload: { group: "Titan machine", label: "Rocket pod reloading", bus: "weapons", tail: .1, layers: [{ id: "load", s: "pod_reload", gain: .16, pv: .03 }] },
    titanfall_incoming: { group: "Titan machine", label: "Titan coming down", bus: "world", tail: .6, ref: 40, layers: [{ id: "descent", s: "titanfall_in", gain: .3 }] },
    reactor_hum: { group: "Titan machine", label: "Cockpit reactor hum (loop, only aboard a Titan)", bus: "ambience", loop: 1, wide: 1, layers: [{ id: "hum", s: "loop_reactor", gain: .04 }] },
    machine_step: { group: "Machines", label: "Machine trooper step", bus: "world", tail: .2, ref: 5, cool: .1, layers: [{ id: "step", s: "mstep", gain: .25, pv: .12, gv: .2 }] },
    machine_chirp: { group: "Machines", label: "Machine trooper chatter", bus: "world", tail: .3, ref: 7, layers: [{ id: "chirp", s: ["chirp_a", "chirp_b"], gain: .25, pv: .12, gv: .15 }] },
    walker_step: { group: "Machines", label: "Walker step", bus: "world", tail: .4, ref: 10, cool: .15, layers: [{ id: "step", s: "wstep", gain: .4, pv: .08, gv: .12 }, T(60, 30, .2, .3)] },
    drone_hum: { group: "Machines", label: "Hound drone hum (loop)", bus: "world", loop: 1, ref: 8, layers: [{ id: "hum", s: "loop_drone", gain: .3 }] },
    truck_engine: { group: "Machines", label: "Truck engine (loop)", bus: "world", loop: 1, ref: 8, layers: [{ id: "engine", s: "loop_truck", gain: .3 }] },
    amb_refinery: { group: "Ambience", label: "Refinery hum (loop, only near the refinery)", bus: "ambience", loop: 1, wide: 1, ref: 14, layers: [{ id: "bed", s: "loop_refinery", gain: .14 }] },
    amb_wind: { group: "Ambience", label: "Wind (loop)", bus: "ambience", loop: 1, wide: 1, layers: [{ id: "bed", s: "loop_wind", gain: .16 }] },
    amb_battle: { group: "Ambience", label: "Fighting in the distance", bus: "ambience", tail: .5, layers: [{ id: "burst", s: ["battle_a", "battle_b"], gain: .13, lp: 3500, pv: .15, gv: .3 }] },
    amb_rain: { group: "Ambience", label: "Rain (loop)", bus: "ambience", loop: 1, wide: 1, layers: [{ id: "bed", s: "loop_rain", gain: .13 }] },
    thunder: { group: "Ambience", label: "Thunder", bus: "ambience", tail: .5, layers: [{ id: "roll", s: "thunder", gain: .3, pv: .1, gv: .2 }] },
  };
  /* ---------- the voices: what each line says. The same ids are spoken by both command packs. ---------- */
  const VOICE = {
    mil: { group: "Command voice: Militia", ch: "cmd", lines: {
      start: "All call signs, the field is live. Get on those points. Move!",
      taken_a: "Alpha is ours! Good work.", taken_b: "Bravo secured! Keep pushing.", taken_c: "Charlie's ours! Well done.", taken_d: "Delta is ours! Nicely done.", taken_e: "Echo secured! Push on.",
      lost_a: "We've lost Alpha! Get it back!", lost_b: "Bravo's gone! Retake it!", lost_c: "They've taken Charlie! Move on it!", lost_d: "Delta's fallen! Take it back!", lost_e: "We've lost Echo! Get on it!",
      contested: "Enemy on our point! Push them off, now!", all_points: "Every point is ours! Hold the line!",
      titan_ready: "Commander, your Titan's on station! Call it in!", titan_inbound: "Titan inbound! Clear the drop zone!",
      enemy_titan: "Heads up! Enemy Titan dropping in!", enemy_titan_down: "Enemy Titan destroyed! Outstanding!", titan_lost: "We've lost your Titan! Stay in the fight!",
      squad_lost: "We've lost a squad! Watch your flanks!", vehicle_lost: "Vehicle down! One of ours is burning!", reinforce: "Reinforcements moving up!",
      lead: "We've got the lead! Keep the pressure on!", behind: "They've pulled ahead! Take a point back!",
      near_win: "Nearly there! Hold what we've got!", near_loss: "We're running out of time! Retake those points!",
      win: "That's it! The field is ours! Bloody good work, all of you.", loss: "Fall back! Fall back! We've lost the field.", pilot_down: "Commander's down! Getting you back in the fight!" } },
    mac: { group: "Command voice: The Machine", ch: "cmd", lines: {
      start: "Operation begins. Seize all control points.",
      taken_a: "Point Alpha acquired.", taken_b: "Point Bravo acquired.", taken_c: "Point Charlie acquired.", taken_d: "Point Delta acquired.", taken_e: "Point Echo acquired.",
      lost_a: "Point Alpha lost.", lost_b: "Point Bravo lost.", lost_c: "Point Charlie lost.", lost_d: "Point Delta lost.", lost_e: "Point Echo lost.",
      contested: "Intrusion at a held point. Remove it.", all_points: "All points held. Maintain control.",
      titan_ready: "Titan unit available. Awaiting your signal.", titan_inbound: "Titan unit descending. Clear the area.",
      enemy_titan: "Warning. Enemy Titan entering the field.", enemy_titan_down: "Enemy Titan eliminated.", titan_lost: "Titan unit lost.",
      squad_lost: "Squad destroyed.", vehicle_lost: "Vehicle destroyed.", reinforce: "Additional units deployed.",
      lead: "Advantage is ours. Continue.", behind: "Enemy leads. Recover a point.",
      near_win: "Victory is near. Hold.", near_loss: "Defeat is near. Recover the points.",
      win: "Operation complete. The field is secured.", loss: "Operation failed. Withdraw.", pilot_down: "Commander disabled. Restoring." } },
    ti: { group: "Titan voice", ch: "titan", lines: {
      boot: "Pilot link established! All systems online.", standing_by: "On the ground and standing by, Pilot!", pilot_away: "Pilot away! Holding position.",
      shield_down: "Shield down!", shield_up: "Shield restored!", hull_half: "Hull at fifty percent!", hull_critical: "Warning! Hull critical!", eject: "Reactor breach! Eject! Eject!",
      hostile_titan: "Hostile Titan detected!", hostile_close: "Hostile Titan, close range!", titanfall_detected: "Enemy Titanfall detected!",
      missile_lock: "Warning! Missile lock!", incoming: "Incoming rockets!", heavy_fire: "Taking heavy fire!",
      cannon_low: "Cannon ammunition low!", rockets_ready: "Rocket pod ready!", titan_kill: "Hostile Titan destroyed!", armor: "Enemy armor ahead!", infantry: "Infantry, close range!" } },
  };
  const VPRI = { win: 9, loss: 9, eject: 9, missile_lock: 6, incoming: 5, hull_critical: 6, enemy_titan: 5, titan_ready: 4, shield_down: 4, titan_lost: 5, pilot_down: 5 };
  for (const pk in VOICE) for (const id in VOICE[pk].lines) BANK["vo_" + pk + "_" + id] = { group: VOICE[pk].group, label: VOICE[pk].lines[id], bus: "voice", voice: VOICE[pk].ch, pri: VPRI[id] || 1, tail: 0, layers: [{ id: "voice", s: "vo_" + pk + "_" + id, gain: .55 }] };
  const DEFAULTS = JSON.parse(JSON.stringify(BANK));
  const SAMPLES = [...new Set(Object.values(BANK).flatMap((d) => d.layers).flatMap((l) => l.synth ? [] : [].concat(l.s)))];
  const CREDITS = "Sound effects and voices generated with ElevenLabs (free plan). Not cleared for sale.";

  /* ---------- saved mix and edits ---------- */
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  Object.assign(SET, store.get("punch.mix") || {});
  const NUM = ["gain", "pitch", "hp", "lp", "delay", "cut", "decay", "hold", "pv", "gv", "chance", "f0", "f1", "dur"], DNUM = ["tail", "duck", "ref"];
  function edits() { const out = {}; for (const k in BANK) { const d = BANK[k], o = DEFAULTS[k], e = {};
      for (const p of DNUM) if ((d[p] ?? null) !== (o[p] ?? null)) e[p] = d[p];
      d.layers.forEach((l, i) => { for (const p of NUM) if ((l[p] ?? null) !== (o.layers[i][p] ?? null)) (e.layers ??= {})[l.id] = Object.assign(e.layers?.[l.id] || {}, { [p]: l[p] }); if (l.mute) (e.layers ??= {})[l.id] = Object.assign(e.layers?.[l.id] || {}, { mute: 1 }); });
      if (Object.keys(e).length) out[k] = e; } return out; }
  function applyEdits(ed) { for (const k in ed || {}) { const d = BANK[k]; if (!d) continue; for (const p of DNUM) if (p in ed[k]) d[p] = ed[k][p];
      for (const id in ed[k].layers || {}) { const l = d.layers.find((x) => x.id === id); if (l) Object.assign(l, ed[k].layers[id]); } } }
  applyEdits(store.get("punch.bank"));

  /* ---------- the audio graph ---------- */
  let ctx = null, mix, pre, comp, shaper, meter, tailIn, tailOut, loading = null, ready = false, voiceReady = false, voices = 0;
  const bus = {}, buffers = {}, lastRR = {}, lastAt = {}, chokes = {};
  const L = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };

  // The yard's echo: a handful of slapbacks off the buildings, then a long soft wash that loses its top as it fades.
  function yardIR() { const sr = ctx.sampleRate, n = Math.floor(sr * 2.4), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0;
      for (const [t, a] of c ? [[.062, .5], [.118, .42], [.197, .34], [.33, .22], [.51, .13], [.78, .07]] : [[.071, .5], [.109, .4], [.214, .36], [.305, .2], [.55, .14], [.83, .06]]) {
        const s = Math.floor(t * sr), len = Math.floor(sr * .012); let f = 0; for (let i = 0; i < len; i++) { f += ((rnd() * 2 - 1) - f) * .35; d[s + i] += f * a * 2.2 * (1 - i / len); } }
      for (let i = Math.floor(sr * .04); i < n; i++) { const t = i / sr, k = clamp(.5 - t * .19, .05, .5); lp += ((rnd() * 2 - 1) - lp) * k; d[i] += lp * Math.exp(-t * 3.1) * .55; } }
    return b; }
  function softClip() { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.25) / Math.tanh(1.25); } return c; }
  function build(AC) {
    ctx = AC; mix = ctx.createGain(); pre = ctx.createGain(); comp = ctx.createDynamicsCompressor(); shaper = ctx.createWaveShaper(); meter = ctx.createAnalyser(); meter.fftSize = 2048;
    comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 3.5; comp.attack.value = .012; comp.release.value = .14;
    shaper.curve = softClip(); shaper.oversample = "2x";
    mix.connect(pre); pre.connect(comp); comp.connect(shaper); shaper.connect(meter); shaper.connect(ctx.destination);
    tailIn = ctx.createGain(); tailOut = ctx.createGain(); const conv = ctx.createConvolver(); conv.buffer = yardIR(); tailIn.connect(conv); conv.connect(tailOut); tailOut.connect(mix);
    for (const k of BUSES) { const duck = ctx.createGain(), vol = ctx.createGain(); duck.connect(vol); vol.connect(mix); bus[k] = { duck, vol }; }
    applyMix();
  }
  function applyMix() { if (!ctx) return; pre.gain.value = SET.on ? SET.master : 0; tailOut.gain.value = SET.tail * .5; for (const k of BUSES) bus[k].vol.gain.value = SET[k]; }
  function duckWorld(amt) { const t = ctx.currentTime, to = 1 - clamp(amt * SET.duck, 0, .9); for (const k of ["world", "impacts"]) { const g = bus[k].duck.gain; g.cancelScheduledValues(t); g.setTargetAtTime(to, t, .006); g.setTargetAtTime(1, t + .09, .16); } }

  function start(base = "punch/samples/", AC) {
    if (!ctx) { const C = root.AudioContext || root.webkitAudioContext; if (!C && !AC) return Promise.resolve(false); build(AC || new C({ latencyHint: "interactive" })); }
    if (!AC && ctx.state === "suspended" && ctx.resume) ctx.resume();
    const get = (n) => fetch(base + n + ".wav").then((r) => { if (!r.ok) throw new Error(n + " " + r.status); return r.arrayBuffer(); }).then((a) => ctx.decodeAudioData(a)).then((b) => { buffers[n] = b; })
      .catch((e) => { console.warn("[punch] missing sample", n, e.message || e); });
    // the guns and impacts load first so the game can start; the voices follow in the background
    loading ??= Promise.all(SAMPLES.filter((n) => !/^vo_/.test(n)).map(get)).then(() => { ready = true; Promise.all(SAMPLES.filter((n) => /^vo_/.test(n)).map(get)).then(() => { voiceReady = true; }); return true; });
    return loading;
  }

  /* ---------- where a sound is ---------- */
  function place(pos, ref) { const dx = pos[0] - L.x, dy = pos[1] - L.y, dz = pos[2] - L.z, dist = Math.hypot(dx, dy, dz), inv = 1 / Math.max(dist, .001);
    const rx = -L.fz, rz = L.fx, rl = Math.hypot(rx, rz) || 1, front = (dx * L.fx + dy * L.fy + dz * L.fz) * inv;
    return { dist, g: Math.pow(ref / Math.max(dist, ref), .85), pan: clamp((dx * rx + dz * rz) / rl * inv, -1, 1) * .85, cut: clamp(20000 * Math.exp(-dist / 60), 1500, 20000) * (front < 0 ? .7 : 1) }; }

  /* ---------- playing a sound ---------- */
  function pick(l, key) { if (!Array.isArray(l.s)) return l.s; let i = Math.floor(rnd() * l.s.length); if (l.s.length > 1 && i === lastRR[key]) i = (i + 1) % l.s.length; lastRR[key] = i; return l.s[i]; }
  function play(name, o = {}) {
    const d = BANK[name]; if (!ctx || !ready || !d || !SET.on) return NONE;
    const now = ctx.currentTime; if (d.cool && now - (lastAt[name] || -9) < d.cool) return NONE; lastAt[name] = now;
    if (voices > 48 && d.bus !== "weapons" && d.bus !== "ui") return NONE;
    // where it is: distance sets the volume, the dullness, how much echo it carries, and how late it arrives
    let g = o.gain ?? 1, pan = 0, cutoff = 0, wet = d.tail ?? 0, delay = o.delay || 0, dist = 0, farK = 0;
    if (o.pos) { const pl = place(o.pos, d.ref || 4); dist = pl.dist; g *= pl.g; if (g < .004) return NONE; pan = pl.pan; cutoff = pl.cut;
      wet *= clamp(1 + dist / 35, 1, 3.5); delay += dist / 343; farK = clamp((dist - 15) / 45, 0, 1); }
    const t0 = now + delay, out = ctx.createGain(); out.gain.value = g; let last = out;
    if (cutoff && cutoff < 16000) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = .4; last.connect(f); last = f; }
    if (o.pos && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; last.connect(p); last = p; }
    last.connect(bus[d.bus].duck);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; last.connect(s); s.connect(tailIn); }
    const mine = [], choke = []; let end = t0;
    for (const l of d.layers) {
      if (o.solo ? o.solo !== l.id : l.mute) continue; if (l.chance != null && rnd() > l.chance) continue;
      if (l.far && farK <= 0) continue;   // a far layer is the report you only hear from a distance
      const lg = l.gain * (1 + (rnd() * 2 - 1) * (l.gv || 0)) * (o.layerGain?.[l.id] ?? 1) * (l.far ? farK : l.near ? 1 - farK * .8 : 1), at = t0 + (l.delay || 0), v = ctx.createGain(); let src, dur;
      if (l.synth) { if (SET.sub <= 0) continue; src = ctx.createOscillator(); src.type = "sine"; src.frequency.setValueAtTime(l.f0, at); src.frequency.exponentialRampToValueAtTime(l.f1, at + l.dur); dur = l.dur;
        v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(lg * SET.sub, at + .003); v.gain.exponentialRampToValueAtTime(.001, at + l.dur); src.connect(v); }
      else { const buf = buffers[pick(l, name + l.id)]; if (!buf) continue; src = ctx.createBufferSource(); src.buffer = buf;
        const rate = (l.pitch || 1) * (o.pitch || 1) * (1 + (rnd() * 2 - 1) * (l.pv || 0)); src.playbackRate.value = rate; dur = buf.duration / rate; let node = src;
        if (l.hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = l.hp; f.Q.value = .5; node.connect(f); node = f; }
        if (l.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = l.lp; f.Q.value = .5; node.connect(f); node = f; }
        v.gain.setValueAtTime(lg, at);
        if (l.decay) { v.gain.setTargetAtTime(0, at + (l.hold ?? .012), l.decay); if (l.cut && l.cut < dur) dur = l.cut; }   // a hit: full for a moment, then it falls away fast
        else if (l.cut && l.cut < dur) { v.gain.setValueAtTime(lg, at + l.cut * .6); v.gain.linearRampToValueAtTime(0, at + l.cut); dur = l.cut; }
        node.connect(v); }
      v.connect(out); src.start(at); src.stop(at + dur + .02); voices++; src.onended = () => { voices--; try { v.disconnect(); } catch (e) {} };
      mine.push(v); if (l.choke) choke.push(v); end = Math.max(end, at + dur);
    }
    // an automatic weapon cuts the last shot's weight short so every shot stays sharp
    if (choke.length) { for (const v of chokes[name] || []) { try { v.gain.cancelScheduledValues(t0); v.gain.setTargetAtTime(0, t0, .02); } catch (e) {} } chokes[name] = choke; }
    if (d.duck && !o.pos) duckWorld(d.duck); else if (d.duck && dist < 20) duckWorld(d.duck * (1 - dist / 20));
    setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (end - now + 3) * 1000);
    return { stop(fade = .03) { const t = ctx.currentTime; for (const v of mine) { try { v.gain.cancelScheduledValues(t); v.gain.setTargetAtTime(0, t, fade / 3); } catch (e) {} } } };
  }
  const NONE = { stop() {}, set() {}, live: false };

  /* ---------- loops: beds and engines that run until stopped ---------- */
  function loop(name, o = {}) { const d = BANK[name]; if (!ctx || !ready || !d) return NONE; const l = d.layers[0], buf = buffers[[].concat(l.s)[0]]; if (!buf) return NONE;
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.buffer = buf; src.loop = true; src.playbackRate.value = (l.pitch || 1) * (o.pitch || 1); f.type = "lowpass"; f.frequency.value = 20000; g.gain.value = 0;
    src.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(bus[d.bus].duck); } else g.connect(bus[d.bus].duck); src.start(ctx.currentTime, rnd() * buf.duration);
    let src2 = null; if (d.wide) { const half = ctx.createGain(); half.gain.value = .75; src.disconnect(); src.connect(half); half.connect(f);   // a second copy, slower and starting elsewhere, so the loop point is never heard twice the same way
      src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = src.playbackRate.value * .83; const h2 = ctx.createGain(); h2.gain.value = .75; src2.connect(h2); h2.connect(f); src2.start(ctx.currentTime, rnd() * buf.duration); }
    const h = { live: true, name,
      set(q = {}) { if (!h.live) return; const t = ctx.currentTime; let gain = l.gain * (q.gain ?? 1), pan = 0, cut = l.lp || 20000; if (q.pos) { const pl = place(q.pos, d.ref || 6); gain *= pl.g; pan = pl.pan; cut = Math.min(cut, pl.cut); }
        g.gain.setTargetAtTime(SET.on ? gain : 0, t, .12); f.frequency.setTargetAtTime(cut, t, .12); if (p) p.pan.setTargetAtTime(pan, t, .12); if (q.pitch) src.playbackRate.setTargetAtTime((l.pitch || 1) * q.pitch, t, .15); },
      stop(fade = .4) { if (!h.live) return; h.live = false; const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, fade / 3); try { src.stop(t + fade + .1); if (src2) src2.stop(t + fade + .1); } catch (e) {} } };
    h.set(o); return h; }

  /* ---------- voices: one line at a time per voice, most urgent first ---------- */
  const VQ = { cmd: { q: [], until: 0 }, titan: { q: [], until: 0 } }, said = {};
  function say(name, o = {}) { const d = BANK[name]; if (!ctx || !ready || !d || !d.voice || !SET.on) return false; const now = ctx.currentTime, cool = o.cool ?? d.vcool ?? 8;
    if (now - (said[name] ?? -99) < cool) return false; said[name] = now; const ch = VQ[d.voice]; ch.q.push({ name, pri: o.pri ?? d.pri ?? 1, t: now });
    ch.q.sort((a, b) => b.pri - a.pri || a.t - b.t); if (ch.q.length > 3) ch.q.length = 3; pump(); return true; }
  function pump() { if (!ctx) return; const now = ctx.currentTime; if (now < Math.max(VQ.cmd.until, VQ.titan.until)) return;   // the two voices never talk over each other
    for (const k in VQ) VQ[k].q = VQ[k].q.filter((it) => now - it.t <= 5 && buffers[BANK[it.name].layers[0].s]);
    const a = VQ.titan.q[0], b = VQ.cmd.q[0], ch = a && (!b || a.pri >= b.pri) ? VQ.titan : b ? VQ.cmd : null; if (!ch) return;
    const it = ch.q.shift(); play(it.name); ch.until = now + buffers[BANK[it.name].layers[0].s].duration + .4; }

  const PUNCH = { version: "0.5", ears: L, SET, BANK, DEFAULTS, SAMPLES, BUSES, CREDITS, start, play, loop, say, pump, edits, buffers, voicePack: "mil", VOICE,
    cmd(id, o) { return say("vo_" + PUNCH.voicePack + "_" + id, o); }, titan(id, o) { return say("vo_ti_" + id, o); }, get voiceReady() { return voiceReady; },
    get ctx() { return ctx; }, get ready() { return ready; }, get voices() { return voices; }, get meter() { return meter; }, get reduction() { return comp ? comp.reduction : 0; },
    listener(x, y, z, fx, fy, fz) { L.x = x; L.y = y; L.z = z; const l = Math.hypot(fx, fy, fz) || 1; L.fx = fx / l; L.fy = fy / l; L.fz = fz / l; pump(); },
    enable(on) { SET.on = on ? 1 : 0; applyMix(); PUNCH.saveMix(); }, applyMix, saveMix() { store.set("punch.mix", SET); }, saveBank() { store.set("punch.bank", edits()); },
    resetSound(name) { BANK[name] = JSON.parse(JSON.stringify(DEFAULTS[name])); PUNCH.saveBank(); }, resetAll() { for (const k in DEFAULTS) BANK[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); PUNCH.saveBank(); } };
  root.PUNCH = PUNCH;
  if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) { const sc = document.createElement("script"); sc.src = document.currentScript.src.replace(/punch\.js(\?.*)?$/, "punch-director.js"); document.head.appendChild(sc); }
})(typeof window !== "undefined" ? window : globalThis);
