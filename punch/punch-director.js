/* Punch director: watches the game's own state every frame and decides which voice lines, machine sounds and ambience to play.
   It reads window.__mf (the handle the game already exposes) and changes nothing in it, so the game's files need no extra
   hooks and another session can rewrite them freely. If a piece of state it expects is missing, that part stays quiet.
   PUNCH.director.on = false turns it off. PUNCH.director.log holds the last lines it asked for, newest last. */
(function (root) {
  "use strict";
  const PUNCH = root.PUNCH; if (!PUNCH || PUNCH.director) return;
  const D = PUNCH.director = { on: true, log: [], errors: 0 };
  const rnd = Math.random, STEP = 3.1;
  let M = null, clock = 0, last = 0, F = null, beds = {}, reactor = null, bootT = 0, boardT = -99, gust = 1, gustT = 0;
  const cool = {}, every = (k, sec) => { if (clock - (cool[k] ?? -1e9) < sec) return false; cool[k] = clock; return true; };
  const note = (kind, id) => { D.log.push(kind + ":" + id); if (D.log.length > 300) D.log.splice(0, 100); };
  const cmd = (id, o) => { note("cmd", id); return PUNCH.cmd(id, o); }, ti = (id, o) => { note("titan", id); return PUNCH.titan(id, o); };
  const sfx = (name, o) => { note("sfx", name); return PUNCH.play(name, o); };
  const tS = new WeakMap(), seenDrop = new WeakSet(), seenRocket = new WeakSet(), seenSquad = new WeakSet(), uS = new WeakMap(), vS = new WeakMap();
  const at = (t) => [t.pos.x, t.pos.y + (t.h || 2) * .5, t.pos.z];
  const fresh = () => ({ start: false, lead: 0, nearWin: false, nearLoss: false, over: null, owners: null, meter: 0, dead: 0, ride: null, vehAlive: new WeakMap(), sqDead: new WeakMap(), chat: 4 + rnd() * 4, thunder: 10 + rnd() * 15, far: 8 + rnd() * 10 });

  /* ---------- ambience: beds that run the whole time ---------- */
  function ambience(dt) { const want = { amb_wind: 1 }, w = M.CFG && M.CFG.weather, pos = {};   // outdoors is wind and weather only: no hum unless you are standing at the refinery
    if (w === "rain" || w === "storm") want.amb_rain = w === "storm" ? 1.2 : 1; if (w === "storm" || w === "overcast") want.amb_wind = 1.5;
    if ((gustT -= dt) <= 0) { gustT = 2.5 + rnd() * 5; gust = .55 + rnd() * .9; } want.amb_wind *= gust;   // the wind comes and goes
    const ref = (M.POINTS || []).find((p) => /refiner/i.test(p.label || "")); if (ref && M.started) { want.amb_refinery = 1; pos.amb_refinery = [ref.x, 3, ref.z]; }
    for (const k in want) { if (!beds[k] || !beds[k].live) beds[k] = PUNCH.loop(k, { gain: 0 }); beds[k].set({ gain: want[k] * (M.started ? 1 : .6), pos: pos[k] }); }
    for (const k in beds) if (!(k in want) && beds[k].live) { beds[k].stop(1.5); }
    if (!M.started) return;
    if (w === "storm" && (F.thunder -= dt) <= 0) { F.thunder = 14 + rnd() * 22; sfx("thunder", { gain: .6 + rnd() * .6 }); }
    if (!M.B.over && M.B.time > 8 && (F.far -= dt) <= 0) { F.far = 9 + rnd() * 16; sfx("amb_battle", { gain: .6 + rnd() * .8, pitch: .85 + rnd() * .3 }); } }

  /* ---------- the match: what the command voice says ---------- */
  function match() { const B = M.B, P = M.P; PUNCH.voicePack = B.fac && B.fac.you === "machine" ? "mac" : "mil";
    if (!F.start && PUNCH.voiceReady && B.time > 1.5 && B.time < 20) { F.start = true; cmd("start", { pri: 3 }); }
    const owners = M.POINTS.map((p) => p.owner);
    if (F.owners) owners.forEach((o, i) => { const was = F.owners[i], L = String(M.POINTS[i].name || "").toLowerCase(); if (o === was || !"abcde".includes(L) || L.length !== 1) return;
      if (o === "you") { cmd("taken_" + L, { pri: 3 }); if (owners.every((x) => x === "you") && every("all", 40)) cmd("all_points", { pri: 2 }); } else if (was === "you") cmd("lost_" + L, { pri: 3 }); });
    F.owners = owners;
    if (M.POINTS.some((p) => p.owner === "you" && p.n && p.n.foe > 0) && every("contested", 28)) cmd("contested");
    if (P.meter >= 100 && F.meter < 100 && !P.mine) cmd("titan_ready", { pri: 4 }); F.meter = P.meter;
    if (P.dead > 0 && F.dead <= 0) cmd("pilot_down", { pri: 5 }); F.dead = P.dead;
    const sy = B.score.you, sf = B.score.foe, GOAL = M.GOAL || 400;   // the game does not expose its goal yet; 400 is Prototype 5's
    if (B.time > 30 && !B.over) { const lead = sy - sf > 8 ? 1 : sf - sy > 8 ? -1 : F.lead; if (lead !== F.lead) { F.lead = lead; if (every("lead", 40)) cmd(lead > 0 ? "lead" : "behind"); }
      if (!F.nearWin && sy >= GOAL * .8) { F.nearWin = true; cmd("near_win", { pri: 3 }); } if (!F.nearLoss && sf >= GOAL * .8) { F.nearLoss = true; cmd("near_loss", { pri: 3 }); } }
    if (B.over && !F.over) { F.over = B.over; cmd(B.over === "you" ? "win" : "loss", { pri: 9, cool: 0 }); }
    for (const sq of M.SQUADS || []) { if (sq.side !== "you") continue;
      if (!seenSquad.has(sq)) { seenSquad.add(sq); if (B.time > 6 && every("reinforce", 30)) cmd("reinforce"); }
      if (sq.dead && !F.sqDead.get(sq)) { F.sqDead.set(sq, 1); if (sq.veh) cmd("vehicle_lost", { pri: 2 }); else if (every("squad", 20)) cmd("squad_lost", { pri: 2 }); } } }

  /* ---------- Titans: their machine sounds, and what the Titan's own voice says ---------- */
  function titans(dt) { const P = M.P, T = M.TITANS || [], ride = P.titan || null; if (ride && !F.ride) boardT = clock;
    for (const D2 of M.DROPS || []) if (!seenDrop.has(D2)) { seenDrop.add(D2); sfx("titanfall_incoming", { pos: [D2.x, 30, D2.z] });
      if (D2.team === "you") cmd("titan_inbound", { pri: 4 }); else if (ride) ti("titanfall_detected", { pri: 4 }); else cmd("enemy_titan", { pri: 5 }); }
    const foe = T.find((t) => t.team === "foe" && t.alive && !(t.doom > 0));
    for (const t of T) { let s = tS.get(t); const mine = t.team === "you", inside = t === ride, where = inside ? undefined : at(t);
      if (!s) { s = { x: t.pos.x, z: t.pos.z, walk: 0, yaw: t.yaw, turn: 0, shield: t.shield, hull: t.hull, doom: 0, dashing: 0, punch: 0, kneelTo: t.kneelTo, hatchTo: t.hatchTo, ammo: t.ammo, rk: t.rk, down: false, half: false, crit: false, hurt: 0 }; tS.set(t, s);
        if (mine && !inside) setTimeout(() => { if (t.alive && P.titan !== t) ti("standing_by"); }, 1200); else if (!mine && ride) ti("hostile_titan", { pri: 4 }); }
      // steps, servos, hatch, dash, fist
      const moved = Math.hypot(t.pos.x - s.x, t.pos.z - s.z); s.x = t.pos.x; s.z = t.pos.z; if (moved < 3 && !(t.dashing > 0)) s.walk += moved;
      if (s.walk >= STEP) { s.walk -= STEP; sfx("titan_step", { pos: where, gain: inside ? .7 : 1 }); s.quiet = clock + .3; }
      let dy = (t.yaw - s.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; s.yaw = t.yaw; s.turn += Math.abs(dy);
      // one mechanical sound at a time per Titan: a servo waits until the step or hatch before it has passed
      if ((s.turn > 2.2 || t.kneelTo !== s.kneelTo) && clock >= (s.quiet || 0)) { s.turn = 0; s.kneelTo = t.kneelTo; sfx("titan_servo", { pos: where, gain: inside ? .7 : 1 }); s.quiet = clock + .8; }
      if (t.hatchTo !== s.hatchTo) { s.hatchTo = t.hatchTo; sfx("titan_hatch", { pos: where }); s.quiet = clock + .9; }
      if (t.dashing > 0 && s.dashing <= 0) sfx("titan_dash", { pos: where }); s.dashing = t.dashing;
      if (t.punch > 0 && s.punch <= 0) sfx("titan_punch", { pos: where }); s.punch = t.punch;
      // shield and hull
      if (t.shield <= 0 && s.shield > 0) { s.down = true; sfx("shield_break", { pos: where }); if (inside) ti("shield_down", { pri: 4 }); }
      if (t.shield > 0 && s.shield <= 0) sfx("shield_charge", { pos: where });
      if (s.down && t.shield >= 149) { s.down = false; if (inside && every("shup", 30)) ti("shield_up"); }
      const lost = (s.shield + s.hull) - (t.shield + t.hull); s.hurt = Math.max(0, s.hurt - 40 * dt) + Math.max(0, lost); s.shield = t.shield; s.hull = t.hull;
      const max = t.hullMax || 350;
      if (inside) { if (!s.half && t.hull < max * .5) { s.half = true; ti("hull_half", { pri: 3 }); } if (!s.crit && t.hull < max * .35) { s.crit = true; ti("hull_critical", { pri: 6 }); }
        if (s.hurt > 130 && every("fire", 45)) ti("heavy_fire", { pri: 2 });
        if (t.ammo <= 4 && t.ammo > 0 && s.ammo > 4 && every("ammo", 45)) ti("cannon_low"); if (t.rk <= 0 && s.rk > 0 && clock - boardT > 3 && every("rk", 45)) ti("rockets_ready");
        if (foe && Math.hypot(foe.pos.x - t.pos.x, foe.pos.z - t.pos.z) < 35 && every("close", 50)) ti("hostile_close", { pri: 3 });
        for (const r of M.ROCKETS || []) if (!seenRocket.has(r)) { seenRocket.add(r); if (r.team === "foe" && r.tgt && Math.hypot(r.tgt.x - t.pos.x, r.tgt.z - t.pos.z) < 9) { if (every("lock", 12)) ti("missile_lock", { pri: 6 }); else if (every("incoming", 5)) ti("incoming", { pri: 5 }); } }
        if (every("scan", 1)) { const U = M.U || 1; let near = 0; for (const g of M.GRUNTS || []) if (g.s && g.s.dead < 0) { const q = g.s.root.position; if (Math.hypot(q.x / U - t.pos.x, q.z / U - t.pos.z) < 10) near++; }
          if (near >= 2 && every("inf", 70)) ti("infantry"); if ((M.VEH || []).some((v) => v.side === "foe" && v.alive && Math.hypot(v.pos.x - t.pos.x, v.pos.z - t.pos.z) < 40) && every("armor", 70)) ti("armor"); } }
      if (s.rk > 1.5 && t.rk <= 1.5 && t.rk > 0 && clock - boardT > 3) sfx("pod_reload", { pos: where, gain: inside ? 1 : .6 });
      s.ammo = t.ammo; s.rk = t.rk;
      // doomed
      if (t.doom > 0 && !(s.doom > 0)) { if (mine) { sfx("titan_alarm"); if (F.ride === t || inside) ti("eject", { pri: 9, cool: 0 }); else cmd("titan_lost", { pri: 5 }); } }
      s.doom = t.doom; s.seen = clock; }
    // a hostile Titan that was here and is not any more has been destroyed
    if (F.foeT && !T.includes(F.foeT)) { if (ride) ti("titan_kill", { pri: 4 }); else cmd("enemy_titan_down", { pri: 4 }); } F.foeT = T.find((t) => t.team === "foe") || null;
    // climbing in and out
    if (ride && !F.ride) { boardT = clock; sfx("titan_boot"); bootT = clock + 2; reactor = PUNCH.loop("reactor_hum", { gain: 1 }); }
    if (bootT && clock >= bootT) { bootT = 0; if (P.titan) ti("boot", { pri: 3 }); }
    if (reactor && ride) reactor.set({ gain: 1, pitch: .92 + Math.min(.25, Math.hypot(ride.vel.x, ride.vel.z) * .03) });
    if (!ride && F.ride) { if (reactor) { reactor.stop(.8); reactor = null; } if (F.ride.alive && !(F.ride.doom > 0)) ti("pilot_away"); }
    F.ride = ride; }

  /* ---------- machines and vehicles round the listener ---------- */
  function units(dt) { const U = M.U || 1, E = PUNCH.ears, fac = M.B.fac || {}, lists = [[M.ALLIES || [], fac.you], [M.GRUNTS || [], fac.foe]], nearMech = [];
    for (const [list, f] of lists) { if (f !== "machine") continue; for (const g of list) { if (!g.s || g.s.dead >= 0) continue; const q = g.s.root.position, x = q.x / U, z = q.z / U, d = Math.hypot(x - E.x, z - E.z); if (d > 22) continue;
        let s = uS.get(g); if (!s) { s = { x, z, walk: 0 }; uS.set(g, s); } const m = Math.hypot(x - s.x, z - s.z); s.x = x; s.z = z; if (m < 1) s.walk += m; if (s.walk > 1.3) { s.walk = 0; if (every("mstep", .22)) sfx("machine_step", { pos: [x, q.y / U + .2, z] }); } nearMech.push([x, q.y / U + 1.5, z]); } }
    if (nearMech.length && (F.chat -= dt) <= 0) { F.chat = 3.5 + rnd() * 6; sfx("machine_chirp", { pos: nearMech[Math.floor(rnd() * nearMech.length)] }); }
    for (const v of M.VEH || []) { let s = vS.get(v); const model = (v.def && v.def.veh && v.def.veh.model) || "", kind = /hound/.test(model) ? "drone_hum" : /mantis/.test(model) ? "walker" : "truck_engine";
      if (!s) { s = { x: v.pos.x, z: v.pos.z, walk: 0, loop: null }; vS.set(v, s); } const d = Math.hypot(v.pos.x - E.x, v.pos.z - E.z), m = Math.hypot(v.pos.x - s.x, v.pos.z - s.z); s.x = v.pos.x; s.z = v.pos.z;
      if (kind === "walker") { if (v.alive && m < 2) s.walk += m; if (s.walk > 1.6) { s.walk = 0; if (d < 60) sfx("walker_step", { pos: [v.pos.x, 1, v.pos.z] }); } continue; }
      if (v.alive && d < 55) { if (!s.loop || !s.loop.live) s.loop = PUNCH.loop(kind, { pos: [v.pos.x, 1.2, v.pos.z], gain: 0 }); s.loop.set({ pos: [v.pos.x, 1.2, v.pos.z], gain: 1, pitch: 1 + Math.min(.35, m / Math.max(dt, .001) * .04) }); }
      else if (s.loop && s.loop.live) { s.loop.stop(.6); s.loop = null; } } }

  function step(dt) { if (!D.on || !PUNCH.ready) return; M = root.__mf; if (!M || !M.B || !M.P) return; clock += dt;
    try { if (!F || (M.B.time < (F.time ?? 0) - .5)) { F = fresh(); for (const k in cool) delete cool[k]; if (reactor) { reactor.stop(.3); reactor = null; } bootT = 0; } F.time = M.B.time;
      ambience(dt); if (!M.started) return; match(); titans(dt); units(dt); PUNCH.pump(); }
    catch (e) { if (D.errors++ < 3) console.warn("[punch director]", e); } }
  function tick(now) { root.requestAnimationFrame(tick); const dt = Math.min(.1, (now - last) / 1000 || 0); last = now; if (!D.manual) step(dt); }
  D.step = step; root.requestAnimationFrame(tick);
})(typeof window !== "undefined" ? window : globalThis);
