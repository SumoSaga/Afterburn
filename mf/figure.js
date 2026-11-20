/* Afterburn: another player's pilot, as you see them.
   The figure is one of the Table's soldiers (cb/soldiers.js), built once in its standing hold with both hands on the
   rifle and then taken out of the kit's hands, so that this file can move its joints itself: a run that keeps pace with
   the pilot's speed, a tucked jump, a second jump on the jumpkit's thrusters, a wall run leaning off the wall with one
   hand on it, a slide, a crouch, and going down. The kit's own walk is made for soldiers and is far too slow for a pilot. */
import { THREE, U, V3, SOL, charMat, fxLayer, clamp } from "./engine.js";
import { build, box as B, hull as H, drum as C, loft as Lf, ball as Bl } from "./parts.js";

// a pilot's own kit, worn over the soldier: helmet with a lit visor, chest plate and pouches, shoulder and knee pads,
// and the jumpkit on the back. Two paints: your side's pale shell, the other side's dark one.
const KIT = { you: { shell: "#d9d2bc", plate: "#8f8a80", accent: "#c45a1e", dark: "#1e2022", canvas: "#6e6046", glow: [.5, 2.6, 3.2] }, foe: { shell: "#3b3e42", plate: "#4a4e52", accent: "#b0312a", dark: "#141516", canvas: "#4a4336", glow: [3.4, .5, .3] } };

const E = new THREE.Euler(), Q = new THREE.Quaternion();
export function makeFigure(fac, enemy, paint) {
  const mil = fac === "militia", s = SOL.make({ x: 0, z: 0, yaw: 0, weapon: "rifle", role: "rifleman", camo: mil ? "ranger" : "urban", seed: 4242, helmet: false });
  if (!mil && window.CBMech) { try { window.CBMech.dress(s, "light", THREE, charMat, { scheme: enemy ? "steel" : "worn" }); } catch (e) {} }
  // let it bring the rifle up and settle, alone, so that nobody else on the field is moved along with it
  const others = SOL.all.splice(0); SOL.all.push(s); try { s.aimAt(V3(0, 25, 600)); for (let i = 0; i < 40; i++) SOL.update(.05); } catch (e) {} SOL.all.length = 0; for (const o of others) if (o !== s) SOL.all.push(o);
  const root = s.root; root.updateMatrixWorld(true); s.chest.attach(s.rifle);   // the rifle now rides with the chest, and so do the hands that hold it
  const J = { pelvis: s.pelvis, spine: s.spine, chest: s.chest, neck: s.neck, thL: s.LL.th, shL: s.LL.sh, ftL: s.LL.ft, thR: s.LR.th, shR: s.LR.sh, ftR: s.LR.ft, upL: s.AL.up, foL: s.AL.fo, upR: s.AR.up, foR: s.AR.fo };
  const rest = {}; for (const n in J) rest[n] = J[n].quaternion.clone(); const pelY = s.pelvis.position.y;
  for (const n of ["thL", "shL", "ftL", "thR", "shR", "ftR"]) rest[n].identity();   // legs are posed from straight down
  const set = (n, x, y = 0, z = 0) => { E.set(x, y, z, "YXZ"); J[n].quaternion.copy(rest[n]).multiply(Q.setFromEuler(E)); };
  // the pilot's kit, in metres on each joint (the figure faces +z), and the jumpkit's flames under its two canisters
  const S = { ...KIT[enemy ? "foe" : "you"] }; if (paint && !enemy) S.accent = paint; const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) });
  const gear = (jt, list) => { const g = new THREE.Group(); g.scale.setScalar(U); jt.add(g); build(g, list, S, glowMat); };
  // the helmet: a full shell shaped to the head, longer behind than in front, with a visor that wraps round the face,
  // a breather over the mouth with a filter on each cheek, cups over the ears and a guard down the back of the neck
  gear(s.head, [Bl(.25, .27, .3, 0, .128, -.012, "shell"), Bl(.23, .15, .2, 0, .07, -.07, "shell"), Bl(.19, .15, .19, 0, .045, .05, "dark"),
    Bl(.262, .282, .312, 0, .128, -.012, "glow", { face: 0, wide: 2.3, from: 1.32, to: 1.74 }), Bl(.27, .29, .32, 0, .128, -.012, "accent", { face: 0, wide: 2.5, from: 1.16, to: 1.32 }),
    C(.03, .05, .075, .03, .1, "plate", "z", 8), C(.03, .05, -.075, .03, .1, "plate", "z", 8), C(.05, .05, .125, .1, -.01, "dark", "x", 10), C(.05, .05, -.125, .1, -.01, "dark", "x", 10),
    Lf([[0, .03, .2], [.03, .045, .26], [.05, .02, .18]], 0, .235, -.03, "accent", 6), C(.005, .2, -.11, .3, -.06, "dark", "y", 4)]);
  // the body armour: a cuirass that follows the chest, caps on the shoulders, pouches, and the jumpkit: a hub with a canister each side
  gear(s.chest, [C(.085, .05, 0, .27, 0, "accent", "y", 10), Lf([[-.03, .3, .21], [.09, .35, .24], [.2, .37, .23], [.27, .25, .17]], 0, 0, 0, "plate", 10, .35), Bl(.2, .14, .08, 0, .17, .1, "shell"),
    ...[-.1, 0, .1].map((x) => Bl(.09, .1, .07, x, .01, .11, "canvas")), Bl(.15, .12, .17, .21, .235, 0, "shell"), Bl(.15, .12, .17, -.21, .235, 0, "shell"),
    Bl(.26, .3, .14, 0, .12, -.13, "dark"), ...[-1, 1].flatMap((sd) => [Lf([[-.17, .06, .06], [-.12, .11, .11], [.1, .11, .11], [.16, .06, .06]], sd * .105, 0, -.19, "plate", 10), C(.04, .07, sd * .105, -.2, -.19, "dark", "y", 10, .055), C(.057, .03, sd * .105, .06, -.19, "accent", "y", 10)])]);
  for (const L of [s.LL, s.LR]) { gear(L.sh, [Bl(.11, .13, .09, 0, -.01, .05, "shell"), Lf([[-.36, .09, .05, 0, .04], [-.2, .11, .06, 0, .05], [-.08, .1, .05, 0, .045]], 0, 0, 0, "plate", 8, .3)]); gear(L.th, [Bl(.06, .14, .11, L.s * .085, -.2, 0, "canvas")]); }
  for (const A of [s.AL, s.AR]) gear(A.fo, [Lf([[-.2, .07, .07], [-.1, .09, .09], [-.03, .085, .085]], 0, 0, 0, "plate", 8)]);
  const flames = [];
  for (const sx of [-1, 1]) { const fl = fxLayer(new THREE.Mesh(new THREE.ConeGeometry(.95, 7, 6).rotateX(Math.PI).translate(0, -3.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(enemy ? "#ff9a4a" : "#7fdcff").multiplyScalar(3), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }))); fl.position.set(sx * .1 * U, -.23 * U, -.18 * U); fl.scale.set(1, .01, 1); s.chest.add(fl); flames.push(fl); }
  const tag = new THREE.Mesh(new THREE.OctahedronGeometry(1.9), new THREE.MeshBasicMaterial({ color: enemy ? new THREE.Color(3.4, .5, .25) : new THREE.Color(.5, 2.4, 3) })); tag.position.y = 39; root.add(tag);
  // what is posed, each value easing toward where the pilot's state says it should be
  const cur = { tl: 0, kl: 0, tr: 0, kr: 0, lean: 0, drop: 0, roll: 0, armL: 0, armR: 0, fall: 0, thrust: 0, twist: 0 }; let ph = 0, t = 0;
  function pose(dt, st) { root.visible = !st.hidden; if (st.hidden) return; t += dt;
    const sp = st.speed, run = clamp(sp / 8, 0, 1.25), air = !st.grounded && !st.wall, tg = { tl: 0, kl: 0, tr: 0, kr: 0, lean: .06, drop: 0, roll: 0, armL: 0, armR: 0, fall: 0, thrust: 0, twist: 0 };
    if (st.dead) { tg.fall = 1; tg.drop = .55; tg.kl = .5; tg.kr = .9; }
    else if (st.sliding) { tg.drop = .62; tg.lean = -.55; tg.tl = -1.5; tg.kl = .15; tg.tr = -.75; tg.kr = 1.75; tg.twist = .25; }
    else if (st.wall) { ph += dt * (6 + sp * .9); const a = Math.sin(ph); tg.tl = -a * 1.05 - .25; tg.kl = .35 + .95 * Math.max(0, Math.sin(ph + 1.15)); tg.tr = a * 1.05 - .25; tg.kr = .35 + .95 * Math.max(0, Math.sin(ph + 1.15 + Math.PI));
      tg.lean = .3; tg.roll = -.38 * st.wall; tg.thrust = .45; if (st.wall > 0) tg.armR = 1; else tg.armL = 1; }
    else if (air) { const dj = st.dj < .4; tg.tl = dj ? -1.15 : -.95; tg.kl = dj ? 1.7 : 1.3; tg.tr = dj ? -.85 : .3; tg.kr = dj ? 1.6 : .95; tg.lean = st.vy > 0 ? .12 : -.06; tg.thrust = dj ? 1 : st.vy > 2 ? .22 : 0; }
    else if (st.crouch) { ph += dt * (3 + sp * 1.4); const a = Math.sin(ph) * clamp(sp / 3, 0, 1); tg.drop = .36; tg.lean = .3; tg.tl = -1.0 - a * .35; tg.kl = 1.75; tg.tr = -1.0 + a * .35; tg.kr = 1.75; }
    else { ph += dt * (3.5 + sp * 1.25); const a = Math.sin(ph) * run; tg.tl = -a * .95 - .12 * run; tg.kl = (.15 + 1.05 * Math.max(0, Math.sin(ph + 1.15))) * run; tg.tr = a * .95 - .12 * run; tg.kr = (.15 + 1.05 * Math.max(0, Math.sin(ph + 1.15 + Math.PI))) * run; tg.lean = .06 + .26 * run; tg.twist = -a * .18; }
    const e = 1 - Math.exp(-dt * (st.wall || st.sliding || air ? 12 : 22)); for (const n in cur) cur[n] += (tg[n] - cur[n]) * (n === "fall" ? 1 - Math.exp(-dt * 5) : e);
    const bob = st.grounded && !st.sliding && !st.dead ? Math.abs(Math.sin(ph)) * .55 * run : 0;
    root.position.set(st.x * U, st.y * U, st.z * U); root.rotation.set(-cur.fall * 1.45, st.yaw + Math.PI, cur.roll, "YXZ");
    s.pelvis.position.y = pelY * (1 - cur.drop) + bob + cur.fall * 1.5;
    set("thL", cur.tl); set("shL", cur.kl); set("ftL", -cur.kl * .25); set("thR", cur.tr); set("shR", cur.kr); set("ftR", -cur.kr * .25);
    const up = clamp(st.pitch, -1.1, 1.1); set("spine", cur.lean - up * .25, cur.twist); set("chest", -up * .3 - cur.lean * .5, -cur.twist * .6); set("neck", -up * .25 - cur.lean * .3);
    // the hand on the wall: that arm lets go of the rifle and reaches out to the side
    set("upL", -.25 * cur.armL, 0, 1.2 * cur.armL); set("foL", -.2 * cur.armL); set("upR", -.25 * cur.armR, 0, -1.2 * cur.armR); set("foR", -.2 * cur.armR);
    const fl = Math.max(.01, cur.thrust * (.8 + .35 * Math.sin(t * 47))); for (const f of flames) { f.scale.set(.6 + cur.thrust * .5, fl, .6 + cur.thrust * .5); f.visible = cur.thrust > .03; } }
  const dispose = () => { root.removeFromParent(); };
  return { root, pose, dispose, s };
}
