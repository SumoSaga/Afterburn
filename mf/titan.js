/* Machine-Fall FPS: the Titan, an original humanoid walker about six metres tall.
   A skeleton of joints (hips, two legs of thigh, shin and foot, a torso that turns at the waist, two arms of upper arm
   and forearm) carrying armour built from rounded boxes. The chest is a hollow shell with a hatch hinged at its top,
   so a pilot can really go in through the front. The right hand carries the 40 mm cannon, the left is a fist, and a
   rocket pod sits on the left shoulder. It is posed every frame from a few numbers: how fast it walks, how far it
   kneels, how far the hatch is open, where it aims, recoil, a punch. Built in metres, facing -z, drawn at U. */
import { THREE, U, clamp, lerp, charMat, grad } from "./engine.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const SCHEMES = {
  you: { frame: "#34373a", plate: "#b9b3a4", plate2: "#8f8a80", accent: "#c45a1e", dark: "#1e2022", glow: [.5, 2.6, 3.2] },
  foe: { frame: "#1e2022", plate: "#4a4e52", plate2: "#36393c", accent: "#b0312a", dark: "#141516", glow: [3.4, .5, .3] },
};
const L1 = 1.3, L2 = 1.35, ANK = .27, HIP_Y = 2.85, HIP_X = .8, KNEEL = 1.25;
const _c = new THREE.Color();
// parts: [w, h, d, x, y, z, paint, rx, rz]; paint "glow" goes to a second mesh that is brighter than white
function build(parent, list, S, glowMat) {
  const solid = [], glow = [];
  for (const [w, h, d, x, y, z, key, rx = 0, rz = 0] of list) {
    if (key === "glow") { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); glow.push(g); continue; }
    let g = new RoundedBoxGeometry(w, h, d, 1, Math.min(.07, Math.min(w, h, d) * .22)); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); g = g.toNonIndexed(); g.deleteAttribute("uv");
    _c.set(S[key] || key); const P = g.attributes.position, a = new Float32Array(P.count * 3), j = .94 + Math.random() * .12;
    for (let i = 0; i < P.count; i++) { const k = j * lerp(.82, 1.06, clamp((P.getY(i) - (y - h / 2)) / h, 0, 1)); a[i * 3] = _c.r * k; a[i * 3 + 1] = _c.g * k; a[i * 3 + 2] = _c.b * k; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); solid.push(g);
  }
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), charMat); m.castShadow = m.receiveShadow = true; parent.add(m); }
  if (glow.length) parent.add(new THREE.Mesh(mergeGeometries(glow), glowMat));
}
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export function makeRig(team, o = {}) {
  const S = { ...(SCHEMES[team] || SCHEMES.you), ...o }, glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, .7) });
  const root = new THREE.Group(); root.scale.setScalar(U);
  const hips = joint(root, 0, HIP_Y, 0);
  build(hips, [[1.5, .7, 1.1, 0, 0, 0, "frame"], [1.74, .36, 1.26, 0, .16, 0, "plate2"], [.62, .62, .32, 0, -.2, -.6, "plate"], [.3, .3, .1, 0, -.12, -.78, "accent"], [.5, .62, .62, HIP_X + .05, 0, 0, "dark"], [.5, .62, .62, -HIP_X - .05, 0, 0, "dark"],
    [.5, .5, .3, .5, -.1, .62, "plate2"], [.5, .5, .3, -.5, -.1, .62, "plate2"]], S, glowMat);
  const legs = [-1, 1].map((sd) => {
    const thigh = joint(hips, sd * HIP_X, 0, 0), shin = joint(thigh, 0, -L1, 0), foot = joint(shin, 0, -L2, 0);
    build(thigh, [[.62, 1.3, .7, 0, -.65, 0, "frame"], [.78, .95, .5, 0, -.55, -.22, "plate"], [.22, .85, .66, sd * .38, -.55, 0, "plate2"], [.4, .3, .3, 0, -.2, -.5, "accent"]], S, glowMat);
    build(shin, [[.5, 1.35, .56, 0, -.68, 0, "frame"], [.68, 1.1, .42, 0, -.62, -.24, "plate"], [.74, .42, .5, 0, -.02, -.3, "plate2"], [.3, .95, .32, 0, -.6, .32, "dark"], [.2, .5, .1, sd * .3, -.5, -.3, "accent"]], S, glowMat);
    build(foot, [[.82, .3, 1.5, 0, -.12, -.25, "frame"], [.9, .24, .62, 0, -.1, -.86, "plate"], [.62, .3, .42, 0, -.1, .52, "plate2"], [.3, .4, .5, 0, .1, -.1, "dark"]], S, glowMat);
    return { thigh, shin, foot, sd };
  });
  // the torso turns at the waist; its chest is a shell with a hole in the front that the hatch covers
  const torso = joint(hips, 0, .35, 0);
  build(torso, [[1.05, .5, .95, 0, .22, 0, "dark"],
    [2.3, 1.7, .16, 0, 1.35, .87, "plate2"], [.16, 1.7, 1.9, -1.07, 1.35, 0, "plate2"], [.16, 1.7, 1.9, 1.07, 1.35, 0, "plate2"], [2.3, .16, 1.9, 0, .58, 0, "frame"], [2.3, .16, 1.9, 0, 2.12, 0, "plate"],
    [.5, 1.7, .16, -.9, 1.35, -.87, "plate"], [.5, 1.7, .16, .9, 1.35, -.87, "plate"], [1.3, .44, .16, 0, .72, -.87, "plate"],
    [.56, 1.0, .2, -.92, 1.5, -1.0, "plate", 0, .1], [.56, 1.0, .2, .92, 1.5, -1.0, "plate", 0, -.1], [.4, .16, .22, -.92, 1.05, -1.02, "accent"], [.4, .16, .22, .92, 1.05, -1.02, "accent"],
    [.95, .46, .86, 0, 2.42, -.2, "frame"], [.7, .3, .5, 0, 2.6, -.1, "plate2"], [.5, .12, .06, 0, 2.44, -.66, "glow"], [.12, .5, .12, .38, 2.9, .1, "dark"],
    [.95, .95, 1.25, -1.62, 1.75, 0, "plate"], [.95, .95, 1.25, 1.62, 1.75, 0, "plate"], [1.05, .26, 1.36, 1.64, 2.27, 0, "accent"], [1.05, .2, 1.36, -1.64, 2.25, 0, "plate2"],
    [1.45, 1.25, .62, 0, 1.4, 1.2, "frame"], [.9, .5, .3, 0, 2.0, 1.4, "dark"], [.26, .7, .06, -.42, 1.4, 1.52, "glow"], [.26, .7, .06, .42, 1.4, 1.52, "glow"],
    // rocket pod on the left shoulder
    [1.0, .74, 1.36, -1.66, 2.74, .1, "plate2"], [1.06, .16, 1.42, -1.66, 3.13, .1, "plate"], [.9, .62, .06, -1.66, 2.74, -.6, "dark"],
    ...[-.26, 0, .26].flatMap((dx) => [-.16, .16].map((dy) => [.17, .17, .05, -1.66 + dx, 2.74 + dy, -.64, "accent"])),
    // inside the cockpit: a seat and a few lit panels
    [.72, .5, .56, 0, .9, .42, "dark"], [.6, .8, .16, 0, 1.4, .7, "dark"], [.04, .3, .5, -.97, 1.5, -.15, "glow"], [.04, .3, .5, .97, 1.5, -.15, "glow"], [.5, .1, .04, 0, 1.0, -.76, "glow"]], S, glowMat);
  const hatch = joint(torso, 0, 2.06, -.96);
  build(hatch, [[1.36, 1.16, .2, 0, -.6, -.04, "plate"], [1.1, .5, .12, 0, -.82, -.16, "plate2"], [.52, .12, .14, 0, -.2, -.14, "accent"], [.86, .1, .05, 0, -.4, -.16, "glow"]], S, glowMat);
  const arm = (sd) => { const up = joint(torso, sd * 1.72, 1.7, 0), fore = joint(up, 0, -1.2, 0);
    build(up, [[.55, 1.2, .6, 0, -.6, 0, "frame"], [.7, .72, .7, sd * .04, -.45, 0, "plate"], [.5, .34, .5, 0, -1.2, 0, "dark"]], S, glowMat);
    build(fore, [[.5, 1.2, .55, 0, -.6, 0, "frame"], [.64, .8, .66, 0, -.6, 0, "plate2"], [.2, .6, .1, sd * .34, -.6, 0, "accent"]], S, glowMat); return { up, fore, sd }; };
  const armR = arm(1), armL = arm(-1);
  // the 40 mm cannon in the right hand, lying along the forearm
  build(armR.fore, [[.56, .5, .6, 0, -1.36, 0, "dark"], [.5, 1.5, .66, 0, -1.9, -.34, "frame"], [.56, .7, .3, 0, -1.7, -.74, "plate2"], [.6, .56, .56, 0, -1.6, .2, "plate"], [.62, .12, .58, 0, -1.6, .2, "accent"],
    [.36, .56, .36, 0, -2.75, -.34, "plate2"], [.16, 1.5, .16, -.09, -3.2, -.42, "dark"], [.16, 1.5, .16, .09, -3.2, -.42, "dark"], [.16, 1.5, .16, 0, -3.2, -.26, "dark"], [.4, .12, .4, 0, -3.9, -.34, "frame"]], S, glowMat);
  const muzzle = joint(armR.fore, 0, -4.0, -.34), flash = new THREE.Mesh(new THREE.BoxGeometry(.5, .7, .5), hot); flash.visible = false; muzzle.add(flash);
  build(armL.fore, [[.66, .56, .7, 0, -1.42, 0, "dark"], [.72, .3, .76, 0, -1.3, 0, "plate"], [.2, .2, .74, -.22, -1.66, 0, "frame"], [.2, .2, .74, .22, -1.66, 0, "frame"]], S, glowMat);
  const pod = joint(torso, -1.66, 2.74, -.7);
  const husk = new THREE.MeshToonMaterial({ color: "#1c1a18", gradientMap: grad, side: THREE.DoubleSide });

  const rig = { root, hips, torso, hatch, muzzle, pod, flash, phase: Math.random(), aimYaw: 0, aimPitch: 0,
    pose(dt, s) {
      const sp = Math.abs(s.speed || 0), sg = (s.speed || 0) < 0 ? -1 : 1, amt = clamp(sp / 1.4, 0, 1), kn = clamp(s.kneel || 0, 0, 1), limp = s.limp ? 1 : 0;
      rig.phase = (rig.phase + sp * dt / 3.6) % 1;
      const stride = clamp(sp / 5, 0, 1) * 2.0 * sg, bob = Math.abs(Math.sin(rig.phase * Math.PI * 2)) * .09 * amt, hipY = HIP_Y - KNEEL * kn - bob - limp * .5;
      hips.position.y = hipY; hips.rotation.z = Math.sin(rig.phase * Math.PI * 2) * .03 * amt; hips.rotation.x = -kn * .08;
      legs.forEach((L, i) => { const p = (rig.phase + i * .5) % 1; let f, lift = 0;
        if (p < .62) f = stride / 2 - stride * (p / .62); else { const u = (p - .62) / .38, e = u * u * (3 - 2 * u); f = -stride / 2 + stride * e; lift = Math.sin(Math.PI * u) * .6 * amt; }
        f = lerp(f, i ? .75 : -.85, kn);   // kneeling: one foot forward, one knee toward the ground
        const fy = -(hipY - ANK) + lift, d = clamp(Math.hypot(f, fy), .5, L1 + L2 - .01), dir = Math.atan2(f, -fy);
        const k1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), k2 = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
        L.thigh.rotation.x = dir + k1; L.shin.rotation.x = -(Math.PI - k2); L.foot.rotation.x = -(L.thigh.rotation.x + L.shin.rotation.x) + (lift > 0 ? -.25 * Math.sin(Math.PI * clamp((p - .62) / .38, 0, 1)) : 0) - (i ? 0 : kn * .5); });
      const kY = 1 - Math.exp(-dt * 9); rig.aimYaw += ((s.aimYaw || 0) - rig.aimYaw) * kY; rig.aimPitch += ((s.aimPitch || 0) - rig.aimPitch) * kY;
      const rec = s.recoil || 0, pu = s.punch || 0, sw = Math.sin(rig.phase * Math.PI * 2) * .22 * amt;
      torso.rotation.set(-kn * .2 - limp * .45 + rec * .02, rig.aimYaw * (1 - limp) + pu * .5, -hips.rotation.z);
      hatch.rotation.x = clamp(s.hatch || 0, 0, 1) * 1.95;
      armR.up.rotation.x = lerp(.5 + rig.aimPitch * .85 - rec * .06, .15, Math.max(limp, kn * .6)); armR.fore.rotation.x = lerp(1.05 + rig.aimPitch * .15 - rec * .12, .25, Math.max(limp, kn * .5)); armR.up.rotation.z = .06;
      armL.up.rotation.x = lerp(.12 - sw, 1.5, pu) * (1 - limp); armL.fore.rotation.x = lerp(.5, .1, pu); armL.up.rotation.z = -.08 - pu * .25;
      flash.visible = rec > .75; if (flash.visible) flash.rotation.y = Math.random() * 3;
    },
    // what is left when the reactor goes: a burnt shell down on one knee
    wreck() { root.traverse((o) => { if (!o.isMesh) return; if (o.material === charMat) { o.material = husk; } else o.visible = false; }); rig.pose(.5, { kneel: 1, limp: true, hatch: .7 }); },
  };
  rig.pose(.016, {});
  return rig;
}
export const TITAN = { HIP_Y, KNEEL, CHEST: HIP_Y + .35 + 1.45 };
