/* Afterburn: rigged models worn over the built skeletons.
   A model here is a GLB with one skinned mesh on a Mixamo skeleton and no animations of its own (Hayden makes them in
   Tripo). The game already has skeletons it poses from numbers every frame (the mech in titan.js, the pilot in
   figure.js). puppet() hangs a copy of a model on one of those, hides the skeleton's own plates, and after each pose
   bends the model to follow: hips and spine take the skeleton's full turn, legs and arms are solved as two bones to the
   skeleton's feet and hands, feet keep the skeleton's foot angle. So every pose the game knows carries over, and a new
   model needs no new code as long as it has the same bones. If a file cannot be loaded the built look is used. */
import { THREE, grad, clamp } from "./engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export async function loadModel(file, key, foeTint = "#b98f86") {
  try { const g = await new GLTFLoader().loadAsync(new URL("../models/" + file + "?v=" + (globalThis.AB_BUILD || ""), import.meta.url).href); let map = null; g.scene.traverse((o) => { if (o.isMesh && o.material.map) map = o.material.map; });
    const mk = (col, k) => { const m = new THREE.MeshToonMaterial({ map, color: col, gradientMap: grad }); m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.a = 0.5;"); }; m.customProgramCacheKey = () => key + k; return m; };   // alpha .5 marks a figure for the pixel pass
    return { scene: g.scene, mats: { you: mk("#ffffff", "A"), foe: mk(foeTint, "B"), husk: mk("#2a2624", "H") } };
  } catch (e) { console.warn("model " + file + " not loaded, using the built look", e); return null; }
}

/* o: { root (the skeleton's space, scaled so its units are metres), height, turn (radians to face the skeleton's way), team,
        hips, hipY (the hips joint's height at rest), ankle (the foot joint's height at rest), fwd [x,y,z] (which way knees point),
        full: [[bone, joint], ...] parents first, legs: [{ foot, sd }], arms: [{ hand, sd, pole: [x,y,z], poleIn }], keep: [objects left visible] } */
export function puppet(M, o) {
  const root = o.root, box = new THREE.Group(), mdl = cloneSkinned(M.scene); box.rotation.y = o.turn; box.scale.setScalar(o.height); box.add(mdl); root.add(box);
  let skin = null; mdl.traverse((x) => { if (x.isSkinnedMesh) { skin = x; x.material = M.mats[o.team] || M.mats.you; x.frustumCulled = false; x.castShadow = true; } });
  const keep = new Set(); for (const k of o.keep || []) k.traverse((x) => keep.add(x)); box.traverse((x) => keep.add(x));
  root.traverse((x) => { if (x.isMesh && !keep.has(x)) { x.visible = false; x.userData.shell = true; } });
  const bone = (n) => mdl.getObjectByName("mixamorig" + n), V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const a = V(), b = V(), c = V(), d = V(), T = V(), pole = V(), qa = Q(), qb = Q(), qc = Q(), qBox = Q(), qRoot = Q();
  root.updateWorldMatrix(true, true); box.getWorldQuaternion(qBox); const qI = qBox.clone().invert(), sc = () => root.getWorldScale(c).x, s0 = sc();
  // how a bone sits at rest, in the model's own frame, and which way it points to the next joint
  const rest = (bn, child) => { const r = { b: bn, q: bn.getWorldQuaternion(Q()).premultiply(qI), d: null, len: 0 }; if (child) { bn.getWorldPosition(a); child.getWorldPosition(b); r.len = b.distanceTo(a) / s0; r.d = b.clone().sub(a).normalize().applyQuaternion(qI); } return r; };
  const side = (n) => { const L = bone("Left" + n), R = bone("Right" + n); return root.worldToLocal(L.getWorldPosition(V())).x > 0 ? [R, L] : [L, R]; };   // [the one on -x, the one on +x]
  const hipsB = bone("Hips"), rHips = rest(hipsB), FULL = o.full.map(([n, j]) => [rest(bone(n)), j]);
  const up = side("UpLeg"), lo = side("Leg"), ft = side("Foot"), ar = side("Arm"), fa = side("ForeArm"), ha = side("Hand");
  const LEG = [0, 1].map((i) => ({ up: rest(up[i], lo[i]), lo: rest(lo[i], ft[i]), ft: rest(ft[i]) })), ARM = [0, 1].map((i) => ({ up: rest(ar[i], fa[i]), lo: rest(fa[i], ha[i]) }));
  const hipLift = root.worldToLocal(hipsB.getWorldPosition(V())).y - o.hipY, ankLift = root.worldToLocal(ft[0].getWorldPosition(V())).y - o.ankle;
  // turn a bone so it sits as the skeleton's joint does (full), or so it points along a line (aim)
  const full = (r, j) => { j.getWorldQuaternion(qa).multiply(qc.copy(qRoot).invert()).multiply(qBox).multiply(r.q); r.b.parent.getWorldQuaternion(qb).invert(); r.b.quaternion.copy(qb.multiply(qa)); };
  const aim = (r, dir) => { c.copy(dir).normalize().applyQuaternion(qc.copy(qBox).invert()); qa.setFromUnitVectors(r.d, c).multiply(r.q).premultiply(qBox); r.b.parent.getWorldQuaternion(qb).invert(); r.b.quaternion.copy(qb.multiply(qa)); };
  // two bones from where r1 starts to T, the middle joint pushed toward the pole. All in world units.
  const limb = (r1, r2, s) => { const l1 = r1.len * s, l2 = r2.len * s; r1.b.getWorldPosition(a); b.copy(T).sub(a); let dist = b.length(); b.divideScalar(dist || 1); dist = clamp(dist, Math.abs(l1 - l2) + .01 * s, l1 + l2 - .01 * s);
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)); d.copy(pole).addScaledVector(b, -pole.dot(b)); if (d.lengthSq() < 1e-8) d.set(0, -1, 0); d.normalize();
    d.multiplyScalar(h).addScaledVector(b, x); aim(r1, d); b.multiplyScalar(dist).sub(d); aim(r2, b); };
  return { box, skin,
    update() { root.updateWorldMatrix(true, true); root.getWorldQuaternion(qRoot); box.getWorldQuaternion(qBox); const s = sc();
      T.copy(o.hips.position); T.y += hipLift; root.localToWorld(T); hipsB.position.copy(hipsB.parent.worldToLocal(T)); full(rHips, o.hips); for (const [r, j] of FULL) full(r, j);
      for (const L of o.legs) { const G = LEG[L.sd > 0 ? 1 : 0]; L.foot.getWorldPosition(T); root.worldToLocal(T); T.y += ankLift; root.localToWorld(T); pole.set(...o.fwd).applyQuaternion(qRoot); limb(G.up, G.lo, s); full(G.ft, L.foot); }
      for (const A of o.arms) { const G = ARM[A.sd > 0 ? 1 : 0]; A.poleIn.getWorldQuaternion(qa); pole.set(...A.pole).applyQuaternion(qa); A.hand.getWorldPosition(T); limb(G.up, G.lo, s); } },
    husk() { skin.material = M.mats.husk; root.traverse((x) => { if (x.isMesh && x.userData.shell) x.visible = false; }); } };
}
