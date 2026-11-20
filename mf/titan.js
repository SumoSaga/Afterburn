/* Afterburn: the Titan, an original humanoid walker about six metres tall.
   A skeleton of joints (hips, two legs of thigh, shin and foot, a torso that turns at the waist, two arms of upper arm
   and forearm) carrying a frame, layered armour plates, joints, pistons and stowage built from the pieces in mf/parts.js. The chest is a hollow shell with a hatch hinged at its top,
   so a pilot can really go in through the front. The right hand carries the 40 mm cannon, the left is a fist, and a
   rocket pod sits on the left shoulder. It is posed every frame from a few numbers: how fast it walks, how far it
   kneels, how far the hatch is open, where it aims, recoil, a punch. Built in metres, facing -z, drawn at U. */
import { THREE, U, clamp, lerp, charMat, grad } from "./engine.js";
import { build, box as B, hull as H, drum as C } from "./parts.js";

const SCHEMES = {
  you: { frame: "#34373a", plate: "#b9b3a4", plate2: "#8f8a80", accent: "#c45a1e", dark: "#1e2022", glow: [.5, 2.6, 3.2], steel: "#a3a8ab", canvas: "#7a6a4c", cream: "#e2dac4" },
  foe: { frame: "#1e2022", plate: "#4a4e52", plate2: "#36393c", accent: "#b0312a", dark: "#141516", glow: [3.4, .5, .3], steel: "#7c8084", canvas: "#4a4336", cream: "#b9b3a4" },
};
const L1 = 1.3, L2 = 1.35, ANK = .27, HIP_Y = 2.85, HIP_X = .8, KNEEL = 1.25;
const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export function makeRig(team, o = {}) {
  const S = { ...(SCHEMES[team] || SCHEMES.you), ...o }, glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...S.glow) }), hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, .7) });
  const root = new THREE.Group(); root.scale.setScalar(U);
  const hips = joint(root, 0, HIP_Y, 0);
  build(hips, [B(1.3, .6, 1.0, 0, 0, 0, "frame"), C(.5, .32, 0, .34, 0, "dark", "y", 10), H(1.6, .3, 1.2, 0, .2, 0, "plate2", { sx: .86, sz: .86 }),
    ...[-1, 1].flatMap((sd) => [C(.36, .5, sd * (HIP_X + .05), 0, 0, "dark", "x", 10), C(.2, .14, sd * (HIP_X + .36), 0, 0, "plate2", "x", 8), H(.2, .62, .86, sd * 1.0, -.22, 0, "plate2", { sz: .72 }), B(.22, .08, .5, sd * 1.0, -.3, 0, "accent")]),
    H(.66, .74, .2, 0, -.26, -.62, "plate", { sx: .68 }, -.12), B(.26, .07, .05, -.09, -.2, -.75, "accent", 0, .55), B(.26, .07, .05, .09, -.2, -.75, "accent", 0, -.55),
    C(.21, 1.0, 0, 0, .74, "plate2", "x", 8), B(.07, .46, .46, -.28, 0, .74, "dark"), B(.07, .46, .46, .28, 0, .74, "dark"), B(.3, .2, .16, 0, -.3, .62, "dark")], S, glowMat);
  const legs = [-1, 1].map((sd) => {
    const thigh = joint(hips, sd * HIP_X, 0, 0), shin = joint(thigh, 0, -L1, 0), foot = joint(shin, 0, -L2, 0);
    build(thigh, [B(.5, 1.3, .56, 0, -.65, 0, "frame"), H(.8, 1.0, .22, 0, -.58, -.38, "plate", { sx: .78, oz: .07 }), H(.88, .34, .74, 0, -.14, -.04, "plate2", { sx: .82, sz: .82 }), B(.5, .09, .04, 0, -.34, -.5, "accent"),
      B(.2, .5, .5, sd * .42, -.62, .06, "canvas"), B(.23, .06, .53, sd * .42, -.52, .06, "dark"), B(.23, .06, .53, sd * .42, -.74, .06, "dark"),
      C(.1, .8, 0, -.5, .37, "dark", "y", 6), C(.055, .6, 0, -1.0, .37, "steel", "y", 6), H(.6, .3, .2, 0, -1.12, -.36, "plate2", { sx: 1.15, oz: -.05 })], S, glowMat);
    build(shin, [C(.3, .68, 0, 0, 0, "dark", "x", 10), C(.16, .78, 0, 0, 0, "steel", "x", 8), H(.72, .5, .24, 0, .04, -.38, "plate2", { sx: .7, oz: .06 }), B(.42, 1.35, .48, 0, -.68, 0, "frame"),
      H(.6, 1.05, .26, 0, -.68, -.3, "plate", { sx: 1.2, oz: -.06 }), B(.36, .09, .04, 0, -.3, -.46, "accent"), B(.34, .7, .3, 0, -.5, .32, "plate2"), H(.3, .3, .3, 0, -1.0, .32, "plate2", { sz: .5, oz: -.06 }, Math.PI),
      C(.07, .9, sd * .27, -.62, .16, "dark", "y", 6), C(.04, .5, sd * .27, -1.05, .16, "steel", "y", 6), B(.1, .3, .4, -sd * .27, -.7, .0, "dark")], S, glowMat);
    build(foot, [C(.24, .62, 0, 0, 0, "dark", "x", 8), B(.8, .22, 1.3, 0, -.16, -.2, "frame"), H(.88, .32, .72, 0, -.02, -.74, "plate", { sx: .84, sz: .42, oz: .14 }), H(.62, .34, .5, 0, -.02, .44, "plate2", { sz: .58, oz: -.1 }),
      B(.14, .2, .62, .47, -.14, -.5, "dark"), B(.14, .2, .62, -.47, -.14, -.5, "dark"), H(.5, .3, .3, 0, .14, -.3, "plate2", { sx: .7, sz: .6 })], S, glowMat);
    return { thigh, shin, foot, sd };
  });
  // the torso turns at the waist; its chest is a shell with a hole in the front that the hatch covers
  const torso = joint(hips, 0, .35, 0);
  build(torso, [[1.05, .5, .95, 0, .22, 0, "dark"],
    [2.3, 1.7, .16, 0, 1.35, .87, "plate2"], [.16, 1.7, 1.9, -1.07, 1.35, 0, "plate2"], [.16, 1.7, 1.9, 1.07, 1.35, 0, "plate2"], [2.3, .16, 1.9, 0, .58, 0, "frame"], [2.3, .16, 1.9, 0, 2.12, 0, "plate"],
    [.5, 1.7, .16, -.9, 1.35, -.87, "plate"], [.5, 1.7, .16, .9, 1.35, -.87, "plate"], [1.3, .44, .16, 0, .72, -.87, "plate"],
    // sloped plates over the shell: cheeks beside the hatch, a lip under it, a pitched roof, side skirts
    ...[-1, 1].flatMap((sd) => [H(.56, 1.15, .28, sd * .92, 1.45, -1.04, "plate", { sx: .78, oz: .12, ox: -sd * .04 }), B(.4, .12, .06, sd * .92, 1.02, -1.2, "accent"), H(.22, 1.2, 1.5, sd * 1.2, 1.3, .05, "plate", { sz: .8, ox: -sd * .06 }), C(.03, 1.1, sd * 1.33, 1.95, .1, "dark", "z", 4),
      C(.5, .62, sd * 1.42, 1.75, 0, "dark", "x", 10), H(1.02, .5, 1.42, sd * 1.66, 2.08, 0, sd > 0 ? "accent" : "plate", { sx: .78, sz: .84, ox: -sd * .06 }), H(.3, .95, 1.3, sd * 2.1, 1.66, 0, "plate2", { sz: .8 }, 0, sd * .14), B(.34, .1, 1.0, sd * 2.1, 1.4, 0, "dark")]),
    H(1.4, .42, .3, 0, .76, -1.0, "plate2", { sx: .86, oz: .1 }), H(2.16, .3, 1.76, 0, 2.34, 0, "plate", { sx: .8, sz: .8 }),
    // the unit mark on the left shoulder: a pale disc with a bar across it
    C(.24, .05, -2.28, 1.7, 0, "cream", "x", 10), B(.07, .1, .4, -2.3, 1.7, 0, "accent"),
    // the head: a collar ring, a low sensor housing with one lit slit and an eye, cheek plates, two whip aerials
    C(.56, .2, 0, 2.56, -.15, "dark", "y", 10), H(.72, .44, .84, 0, 2.86, -.18, "plate2", { sx: .74, sz: .78, oz: -.06 }), B(.08, .32, .56, -.4, 2.82, -.18, "plate"), B(.08, .32, .56, .4, 2.82, -.18, "plate"),
    [.44, .1, .06, 0, 2.86, -.62, "glow"], C(.12, .2, .26, 2.72, -.6, "dark", "z", 8), [.1, .1, .04, .26, 2.72, -.71, "glow"], B(.12, .16, .12, .42, 3.08, .28, "dark"), C(.018, 1.7, .42, 3.95, .28, "dark", "y", 4), C(.018, 1.0, -.4, 3.5, .34, "dark", "y", 4),
    // the engine pack on the back: louvres, two stacks, vents that glow
    [1.5, 1.25, .62, 0, 1.4, 1.2, "frame"], ...[0, 1, 2, 3].map((i) => B(1.1, .06, .1, 0, 1.1 + i * .2, 1.53, "dark", -.5)), [.26, .7, .06, -.56, 1.4, 1.52, "glow"], [.26, .7, .06, .56, 1.4, 1.52, "glow"],
    C(.12, 1.0, -.62, 2.36, 1.36, "dark", "y", 8, .12, [.22, 0]), C(.12, 1.0, .62, 2.36, 1.36, "dark", "y", 8, .12, [.22, 0]), C(.15, .1, -.62, 2.86, 1.47, "steel", "y", 8, .15, [.22, 0]), C(.15, .1, .62, 2.86, 1.47, "steel", "y", 8, .15, [.22, 0]),
    // what a crew straps to it: a bedroll across the top, cans and a crate under the pack
    C(.19, 1.3, 0, 2.32, .98, "canvas", "x", 8), B(.06, .42, .42, -.4, 2.32, .98, "dark"), B(.06, .42, .42, .4, 2.32, .98, "dark"),
    B(.3, .44, .17, -.52, .68, 1.6, "plate2"), B(.3, .44, .17, -.18, .68, 1.6, "plate2"), B(.1, .08, .1, -.52, .94, 1.6, "dark"), B(.1, .08, .1, -.18, .94, 1.6, "dark"), B(.56, .4, .3, .44, .68, 1.62, "canvas"), B(.6, .06, .34, .44, .7, 1.62, "dark"),
    // rocket pod on the left shoulder: a box of six tubes
    [1.0, .74, 1.36, -1.66, 2.86, .1, "plate2"], H(1.06, .16, 1.42, -1.66, 3.3, .1, "plate", { sx: .9, sz: .9 }), [.9, .62, .06, -1.66, 2.86, -.6, "dark"],
    ...[-.26, 0, .26].flatMap((dx) => [-.16, .16].flatMap((dy) => [C(.1, .1, -1.66 + dx, 2.86 + dy, -.64, "accent", "z", 8), C(.065, .12, -1.66 + dx, 2.86 + dy, -.66, "dark", "z", 8)])),
    // inside the cockpit: a seat and a few lit panels
    [.72, .5, .56, 0, .9, .42, "dark"], [.6, .8, .16, 0, 1.4, .7, "dark"], [.04, .3, .5, -.97, 1.5, -.15, "glow"], [.04, .3, .5, .97, 1.5, -.15, "glow"], [.5, .1, .04, 0, 1.0, -.76, "glow"]], S, glowMat);
  const hatch = joint(torso, 0, 2.06, -.96);
  build(hatch, [[1.36, 1.16, .2, 0, -.6, -.04, "plate"], H(1.0, .7, .16, 0, -.74, -.18, "plate2", { sx: .7, oz: .05 }), C(.06, 1.3, 0, -.02, -.02, "dark", "x", 6), B(.5, .08, .1, 0, -.22, -.18, "accent"), [.7, .08, .05, 0, -.38, -.16, "glow"], B(.3, .06, .1, 0, -1.08, -.18, "dark")], S, glowMat);
  const arm = (sd) => { const up = joint(torso, sd * 1.72, 1.7, 0), fore = joint(up, 0, -1.2, 0);
    build(up, [C(.33, .5, 0, 0, 0, "dark", "x", 8), B(.46, 1.2, .5, 0, -.6, 0, "frame"), H(.68, .8, .72, sd * .06, -.5, 0, "plate", { sx: .84, sz: .84 }), C(.27, .62, 0, -1.2, 0, "dark", "x", 8), C(.14, .7, 0, -1.2, 0, "steel", "x", 8)], S, glowMat);
    build(fore, [B(.44, 1.2, .5, 0, -.6, 0, "frame"), H(.6, .8, .62, 0, -.62, 0, "plate2", { sx: 1.14, sz: 1.08 }), B(.18, .6, .1, sd * .36, -.6, 0, "accent"), C(.05, .8, -sd * .16, -.5, .32, "steel", "y", 6), C(.08, .4, -sd * .16, -.3, .32, "dark", "y", 6)], S, glowMat); return { up, fore, sd }; };
  const armR = arm(1), armL = arm(-1);
  // the 40 mm cannon in the right hand, lying along the forearm: receiver, drum, shroud, barrel and brake
  build(armR.fore, [[.56, .5, .6, 0, -1.36, 0, "dark"], [.5, 1.4, .62, 0, -1.9, -.34, "frame"], H(.56, .9, .26, 0, -1.8, -.74, "plate2", { sx: .8 }, 0, 0), C(.36, .34, 0, -1.72, .14, "plate", "x", 10), C(.37, .08, 0, -1.72, .14, "accent", "x", 10), B(.5, .3, .3, 0, -1.3, -.6, "plate"),
    C(.21, .76, 0, -2.84, -.34, "plate2", "y", 8), C(.115, 1.5, 0, -3.3, -.34, "dark", "y", 8), C(.18, .3, 0, -3.88, -.34, "frame", "y", 8), C(.2, .06, 0, -3.78, -.34, "steel", "y", 8), C(.045, 1.1, 0, -3.0, -.1, "steel", "y", 5),
    B(.08, .5, .18, 0, -2.0, -.96, "dark"), B(.1, .14, .14, 0, -2.42, -.92, "dark"), B(.3, .34, .2, 0, -2.3, .02, "canvas")], S, glowMat);
  const muzzle = joint(armR.fore, 0, -4.0, -.34), flash = new THREE.Mesh(new THREE.BoxGeometry(.5, .7, .5), hot); flash.visible = false; muzzle.add(flash);
  // the left hand: a plated fist of three fingers and a thumb
  build(armL.fore, [[.6, .44, .62, 0, -1.42, 0, "dark"], H(.72, .28, .76, 0, -1.28, 0, "plate", { sx: .88, sz: .88 }), ...[-.22, 0, .22].flatMap((x) => [B(.17, .34, .22, x, -1.74, -.18, "frame"), B(.17, .16, .3, x, -1.9, -.04, "frame")]), B(.16, .3, .2, .3, -1.62, .22, "frame")], S, glowMat);
  const pod = joint(torso, -1.66, 2.86, -.7);
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
