/* Afterburn: another player's pilot, as you see them.
   An original figure built from the pieces in mf/parts.js on its own skeleton: hips, two legs of thigh, shin and boot,
   a waist, a chest, a head, and two arms of upper arm, forearm and hand. Its proportions follow a jointed miniature
   pilot Hayden assembled as a guide (big rounded helmet with a plate visor, broad shoulder pads, a harness over the
   chest, a pack with two round thruster nozzles, loose trousers with knee pads, heavy boots); nothing of that
   miniature's own sculpt is in here.
   The rifle rides on the chest and both arms are bent to reach it, so the hands stay on the grip and the foregrip as it
   aims. On a wall run the wall-side hand lets go and goes out to the wall. Legs and body are posed from the pilot's
   state: a run in time with its speed, a tucked jump, a second jump on the thrusters, a slide, a crouch, going down.
   Built in metres, facing +z, drawn at U. */
import { THREE, U, charMat, fxLayer, clamp, scene } from "./engine.js";
import { build, box as B, drum as C, loft as Lf, ball as Bl } from "./parts.js";

const PAINT = {
  you: { suit: "#6f745c", wrap: "#8c917a", vest: "#a9a79c", shell: "#d6cfb8", dark: "#26282a", boot: "#3a3632", gun: "#2b2d2f", accent: "#c45a1e", glow: [.5, 1.9, 2.4] },
  foe: { suit: "#34373a", wrap: "#45484c", vest: "#585b5f", shell: "#2c2e31", dark: "#141516", boot: "#1b1c1e", gun: "#18191b", accent: "#b0312a", glow: [2.6, .6, .3] } };
const HIP = .95, TH = .42, SH = .42, A1 = .29, A2 = .27, DOWN = new THREE.Vector3(0, -1, 0);
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export function makeFigure(fac, enemy, paint) {
  const S = { ...PAINT[enemy ? "foe" : "you"] }; if (paint && !enemy) S.accent = paint; const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) });
  const root = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(U); root.add(body); scene.add(root);
  // hips and legs: loose trousers, a pocket on each thigh, knee pads, wrapped shins with a guard, heavy boots
  const hips = joint(body, 0, HIP, 0);
  build(hips, [Lf([[-.16, .3, .23], [-.02, .4, .28], [.1, .34, .24]], 0, 0, 0, "suit", 10, .3), Lf([[.06, .33, .235], [.11, .33, .235]], 0, 0, 0, "dark", 10, .3), Bl(.1, .12, .09, -.17, .0, .02, "vest"), Bl(.1, .12, .09, .17, .0, .02, "vest"), Bl(.16, .12, .08, 0, .02, -.12, "vest")], S, glowMat);
  const legs = [-1, 1].map((sd) => { const th = joint(hips, sd * .12, -.06, 0), sh = joint(th, 0, -TH, 0), ft = joint(sh, 0, -SH, 0);
    build(th, [Lf([[-TH, .17, .18], [-.3, .22, .235, 0, .01], [-.1, .235, .25], [.04, .19, .2]], 0, 0, 0, "suit"), Bl(.08, .17, .15, sd * .115, -.2, 0, "wrap")], S, glowMat);
    build(sh, [Bl(.16, .17, .13, 0, -.01, .055, "shell"), Lf([[-SH + .04, .14, .15], [-.27, .18, .2, 0, -.01], [-.08, .175, .185], [.02, .16, .17]], 0, 0, 0, "wrap"), Lf([[-.36, .11, .06, 0, .07], [-.22, .135, .07, 0, .08], [-.1, .12, .06, 0, .075]], 0, 0, 0, "shell", 8, .3), Lf([[-.33, .185, .195], [-.3, .185, .195]], 0, 0, 0, "dark"), Lf([[-.17, .19, .2], [-.14, .19, .2]], 0, 0, 0, "dark")], S, glowMat);
    build(ft, [Lf([[-.03, .15, .17], [.1, .16, .175]], 0, 0, 0, "boot"), Bl(.17, .15, .34, 0, -.04, .06, "boot"), B(.165, .04, .34, 0, -.085, .06, "dark"), Bl(.15, .1, .15, 0, -.02, .17, "dark", { half: true })], S, glowMat);
    return { th, sh, ft, sd }; });
  // waist and chest: a harness and plate over the suit, a collar, and the pack with its two round nozzles
  const waist = joint(hips, 0, .08, 0), chest = joint(waist, 0, .28, 0);
  build(waist, [Lf([[-.02, .3, .21], [.14, .28, .19], [.3, .33, .22]], 0, 0, 0, "suit", 10, .25), ...[-.09, 0, .09].map((x) => Bl(.085, .11, .07, x, .1, .1, "vest"))], S, glowMat);
  build(chest, [Lf([[-.05, .34, .235], [.07, .385, .265], [.19, .37, .245], [.26, .23, .18]], 0, 0, 0, "vest", 10, .3), Bl(.24, .17, .1, 0, .1, .1, "shell"), B(.1, .03, .02, 0, .14, .152, "accent"), Lf([[.23, .17, .17], [.3, .15, .15]], 0, 0, 0, "dark", 10),
    Bl(.31, .36, .18, 0, .08, -.16, "dark"), Bl(.27, .16, .12, 0, .2, -.19, "vest"), ...[-1, 1].flatMap((sd) => [C(.058, .08, sd * .075, 0, -.25, "wrap", "z", 12), C(.043, .09, sd * .075, 0, -.26, "dark", "z", 12), C(.02, .18, sd * .12, .26, -.14, "vest", "y", 6)]), B(.26, .025, .025, 0, .35, -.14, "vest")], S, glowMat);
  const flames = []; for (const sd of [-1, 1]) { const fl = fxLayer(new THREE.Mesh(new THREE.ConeGeometry(.055, .42, 6).rotateX(Math.PI).translate(0, -.21, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(enemy ? "#ff9a4a" : "#7fdcff").multiplyScalar(3), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }))); fl.position.set(sd * .075, -.02, -.3); fl.rotation.x = -.5; fl.scale.set(1, .01, 1); chest.add(fl); flames.push(fl); }
  // the head: a helmet shaped to it, ribbed behind, a plate visor in a raised frame, a breather with a filter each side, ear cups
  const head = joint(chest, 0, .215, .01);
  build(head, [Bl(.255, .275, .305, 0, .135, -.01, "shell"), Bl(.2, .16, .2, 0, .05, .045, "dark"), ...[0, 1, 2].map((i) => Bl(.265 - i * .012, .05, .2, 0, .085 + i * .055, -.085, "shell")),
    Bl(.27, .29, .32, 0, .135, -.01, "accent", { face: 0, wide: 2.0, from: 1.12, to: 1.8 }), Bl(.278, .298, .328, 0, .135, -.01, "glow", { face: 0, wide: 1.72, from: 1.24, to: 1.68 }), B(.17, .035, .05, 0, .235, .1, "shell"),
    C(.03, .055, .075, .03, .1, "vest", "z", 8), C(.03, .055, -.075, .03, .1, "vest", "z", 8), C(.055, .05, .128, .1, -.01, "dark", "x", 10), C(.055, .05, -.128, .1, -.01, "dark", "x", 10), C(.005, .2, -.12, .3, -.06, "dark", "y", 4)], S, glowMat);
  // arms: broad shoulder pads, an elbow pad, a bracer, a gloved hand
  const arm = (sd) => { const up = joint(chest, sd * .19, .16, 0), fo = joint(up, 0, -A1, 0);
    build(up, [Bl(.19, .17, .2, sd * .02, .01, 0, "shell"), Lf([[-A1, .09, .1], [-.15, .12, .13], [.02, .125, .135]], 0, 0, 0, "suit"), B(.03, .1, .12, sd * .07, -.1, 0, "accent")], S, glowMat);
    build(fo, [Bl(.11, .12, .12, 0, 0, -.01, "shell"), Lf([[-A2, .08, .085], [-.14, .105, .11], [.01, .1, .105]], 0, 0, 0, "suit"), Lf([[-.24, .095, .1], [-.15, .115, .12], [-.08, .11, .115]], 0, 0, 0, "wrap", 8), Bl(.09, .11, .08, 0, -A2 - .03, 0, "dark")], S, glowMat); return { up, fo, sd }; };
  const armR = arm(-1), armL = arm(1);   // facing +z, the figure's right is -x
  // the rifle, built pointing along +z from the butt of its stock
  const gun = new THREE.Object3D(); chest.add(gun);
  build(gun, [Lf([[-.06, .04, .1], [0, .05, .13], [.045, .045, .1]], 0, 0, .06, "gun", 8, .5), B(.055, .1, .36, 0, 0, .28, "gun"), B(.04, .11, .045, 0, -.09, .2, "dark", -.3), B(.045, .15, .07, 0, -.11, .33, "wrap", -.12), Lf([[-.035, .06, .26], [.03, .05, .22]], 0, .0, .56, "gun", 8, .6),
    C(.016, .26, 0, .0, .78, "dark", "z", 8), C(.024, .06, 0, .0, .9, "gun", "z", 8), B(.035, .08, .04, 0, -.07, .52, "dark"), B(.03, .02, .3, 0, .06, .3, "dark"), B(.045, .05, .1, 0, .095, .27, "dark"), [.03, .03, .01, 0, .095, .325, "glow"]], S, glowMat);
  const tag = new THREE.Mesh(new THREE.OctahedronGeometry(1.9), new THREE.MeshBasicMaterial({ color: enemy ? new THREE.Color(3.4, .5, .25) : new THREE.Color(.5, 2.4, 3) })); tag.position.y = 39; root.add(tag);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  // bend one arm so its hand is at T (in the chest's own space), elbow toward the pole
  function reach(A, T, px, py, pz) { const S0 = A.up.position, l1 = A1, l2 = A2 + .03; v1.copy(T).sub(S0); let d = v1.length(); v1.divideScalar(d || 1); d = clamp(d, Math.abs(l1 - l2) + .01, l1 + l2 - .005);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); v2.set(px, py, pz).addScaledVector(v1, -(px * v1.x + py * v1.y + pz * v1.z)); if (v2.lengthSq() < 1e-6) v2.set(0, -1, 0); v2.normalize();
    v3.copy(v1).multiplyScalar(a).addScaledVector(v2, h); q1.setFromUnitVectors(DOWN, v2.copy(v3).normalize()); A.up.quaternion.copy(q1); v2.copy(v1).multiplyScalar(d).sub(v3).normalize(); q2.setFromUnitVectors(DOWN, v2); A.fo.quaternion.copy(q1).invert().multiply(q2); }
  const GRIP = new THREE.Vector3(0, -.09, .2), FORE = new THREE.Vector3(0, -.07, .52), tR = new THREE.Vector3(), tL = new THREE.Vector3(), out = new THREE.Vector3();
  // what is posed, each value easing toward where the pilot's state says it should be
  const keys = ["tl", "kl", "fl", "tr", "kr", "fr", "off", "lean", "twist", "nod", "roll", "fall", "thrust", "wall", "gunLow"], cur = {}; for (const k of keys) cur[k] = 0; let ph = 0, t = 0;
  function pose(dt, st) { root.visible = !st.hidden; if (st.hidden) return; t += dt; const sp = st.speed, run = clamp(sp / 8, 0, 1.15), air = !st.grounded && !st.wall, g = {}; for (const k of keys) g[k] = 0;
    const cyc = (f, a) => { const s = Math.sin(f), c = Math.cos(f); g.tr = -.75 * s * a; g.tl = .75 * s * a; g.kr = (.15 + 1.1 * Math.max(0, c)) * a; g.kl = (.15 + 1.1 * Math.max(0, -c)) * a; g.fr = (-.25 * Math.max(0, c) + .25 * s) * a; g.fl = (-.25 * Math.max(0, -c) - .25 * s) * a; g.off = (.042 * Math.abs(c) - .054) * a; g.lean = .2 * a; g.twist = .12 * s * a; g.nod = -.12 * a; };
    if (st.dead) { g.off = -.75; g.tr = -1; g.tl = -.7; g.kr = 1.6; g.kl = 1.2; g.lean = -.4; g.nod = .5; g.fall = 1; g.gunLow = 1; }
    else if (st.sliding) { g.off = -.5; g.lean = -.55; g.nod = .35; g.tr = -1.35; g.kr = .05; g.fr = .5; g.tl = .55; g.kl = 1.9; g.fl = -.2; }
    else if (st.wall) { ph += dt * (6 + sp * .9); cyc(ph, 1.1); g.roll = -.42 * st.wall; g.thrust = .45; g.wall = st.wall; }
    else if (air) { const tk = st.dj < .4 ? 1 : .55; g.tr = -.4 - 1.0 * tk; g.tl = .25 - .9 * tk; g.kr = .6 + 1.4 * tk; g.kl = .8 + 1.2 * tk; g.lean = .1 + .25 * tk; g.thrust = st.dj < .4 ? 1 : st.vy > 2 ? .22 : 0; }
    else if (st.crouch) { ph += dt * (3 + sp * 1.4); const a = Math.sin(ph) * clamp(sp / 3, 0, 1); g.off = -.32; g.tr = -1.0 - a * .3; g.tl = -1.0 + a * .3; g.kr = g.kl = 1.8; g.fr = g.fl = -.7; g.lean = .3; g.nod = -.2; }
    else if (run > .08) { ph += dt * (3.5 + sp * 1.25); cyc(ph, Math.min(1, run)); }
    else { g.off = -.012 + .007 * Math.sin(t * 2.1); g.tr = -.12; g.kr = .2; g.fr = -.08; g.tl = .1; g.kl = .08; g.fl = -.16; g.twist = .04 * Math.sin(t * .6); }   // standing: one foot a little forward, weight settled
    const e = 1 - Math.exp(-dt * (st.wall || st.sliding || air ? 12 : 20)), ef = 1 - Math.exp(-dt * 5); for (const k of keys) cur[k] += (g[k] - cur[k]) * (st.dead || k === "fall" ? ef : e);
    hips.position.y = HIP + cur.off; legs[0].th.rotation.x = cur.tr; legs[0].sh.rotation.x = cur.kr; legs[0].ft.rotation.x = cur.fr; legs[1].th.rotation.x = cur.tl; legs[1].sh.rotation.x = cur.kl; legs[1].ft.rotation.x = cur.fl;
    const up = clamp(st.pitch, -1.1, 1.1); waist.rotation.set(cur.lean * .6, cur.twist, 0); chest.rotation.set(cur.lean * .4 - up * .25, cur.twist * .5, 0); head.rotation.set(cur.nod - up * .3 - cur.lean * .3, -cur.twist, 0);
    body.rotation.set(-cur.fall * .9, 0, cur.roll); root.position.set(st.x * U, st.y * U, st.z * U); root.rotation.y = st.yaw + Math.PI;
    // the rifle at the right shoulder, turned a little across the body; both hands go to it
    gun.position.set(-.09, .1 - cur.gunLow * .12, .1); gun.rotation.set(-up * .55 + cur.gunLow * .9 + Math.abs(cur.wall) * .25, .16, 0, "YXZ"); gun.updateMatrix(); tR.copy(GRIP).applyMatrix4(gun.matrix); tL.copy(FORE).applyMatrix4(gun.matrix);
    if (cur.wall > .02) { out.set(-.52, .1, .08); tR.lerp(out, Math.min(1, cur.wall)); } else if (cur.wall < -.02) { out.set(.52, .1, .08); tL.lerp(out, Math.min(1, -cur.wall)); }   // the hand on the wall
    reach(armR, tR, -.7, -1, -.2); reach(armL, tL, .8, -1, .1);
    const fl = Math.max(.01, cur.thrust * (.8 + .35 * Math.sin(t * 47))); for (const f of flames) { f.scale.set(.7 + cur.thrust * .5, fl, .7 + cur.thrust * .5); f.visible = cur.thrust > .03; } }
  return { root, pose, dispose: () => root.removeFromParent() };
}
