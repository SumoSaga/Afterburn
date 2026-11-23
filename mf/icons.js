/* ---------- pictures for the loadout cards ----------
   Each gun, gadget and Titan module is drawn once, off to the side, from the same models the game uses, and kept as a small
   picture for its card. The cores and the chassis kits have no single object to show, so they get a drawn sign instead.
   Pictures are made the first time a card asks for one and kept for the rest of the visit. */
import { THREE, renderer } from "./engine.js";

const ICON = {}, sc = new THREE.Scene(), camI = new THREE.PerspectiveCamera(22, 1, .005, 200), RT = {};
sc.add(new THREE.HemisphereLight("#fff4e0", "#4a3c30", 1.7)); { const d = new THREE.DirectionalLight("#fff0d8", 2.6); d.position.set(-.6, 1, .9); sc.add(d); const r = new THREE.DirectionalLight("#9fd8ff", 1.5); r.position.set(.9, .4, -1); sc.add(r); }

// a picture of a model: guns lie with the barrel to the right, turned a little toward you
export function iconOf(key, make, { w = 132, h = 72, yaw = -Math.PI / 2 + .42, pitch = .32, fill = 1 } = {}) { if (ICON[key] !== undefined) return ICON[key]; ICON[key] = "";
  let g = null; try { const obj = make(); if (!obj) return ""; g = new THREE.Group(); g.add(obj); g.rotation.y = yaw; sc.add(g); g.updateMatrixWorld(true);
    const bx = new THREE.Box3().setFromObject(g); if (bx.isEmpty()) return ""; const c = bx.getCenter(new THREE.Vector3()), sz = bx.getSize(new THREE.Vector3());
    camI.aspect = w / h; camI.updateProjectionMatrix(); const vf = Math.tan(camI.fov * Math.PI / 360), need = Math.max(sz.y / 2 / vf, sz.x / 2 / (vf * camI.aspect), sz.z / 2 / (vf * camI.aspect)) / fill + sz.z * .5;
    camI.position.set(c.x, c.y + Math.sin(pitch) * need, c.z + Math.cos(pitch) * need); camI.lookAt(c); camI.updateMatrixWorld();
    const k = w + "x" + h, rt = RT[k] || (RT[k] = new THREE.WebGLRenderTarget(w, h)), was = renderer.getRenderTarget(), col = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, camI); const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); renderer.setRenderTarget(was); renderer.setClearColor(col, al);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g2 = cv.getContext("2d"), im = g2.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4; for (let q = 0; q < 3; q++) im.data[o + q] = Math.min(255, Math.pow(px[i + q] / 255, 1 / 2.2) * 255); im.data[o + 3] = px[i + 3] > 0 ? 255 : 0; }
    g2.putImageData(im, 0, 0); ICON[key] = cv.toDataURL("image/png"); } catch (e) { console.warn("[icon]", key, e); } finally { if (g) sc.remove(g); } return ICON[key]; }

// the same picture, but made a little later so a page full of cards opens at once: the card shows an empty frame, and each
// picture drops in as it is made, one per frame. The card's <img> carries data-ik with the key.
const QUEUE = [], QSET = new Set(); let pumping = false;
export function iconLater(key, make, opts) { if (ICON[key]) return ICON[key]; if (!QSET.has(key)) { QSET.add(key); QUEUE.push([key, make, opts]); if (!pumping) { pumping = true; requestAnimationFrame(pump); } } return ""; }
function pump() { const job = QUEUE.shift(); if (job) { const [key, make, opts] = job; QSET.delete(key); const src = iconOf(key, make, opts); if (src) for (const im of document.querySelectorAll(`img[data-ik="${CSS.escape(key)}"]`)) im.src = src; }
  if (QUEUE.length) requestAnimationFrame(pump); else pumping = false; }
// a drawn sign, for things with no one object to picture
const SIGNS = {
  overclock: (g) => { bolt(g, 48, 10, 86); }, orbital: (g) => { ring(g, 48, 58, 22); ring(g, 48, 58, 9); line(g, 48, 4, 48, 40); line(g, 18, 58, 30, 58); line(g, 66, 58, 78, 58); },
  upgrade: (g) => { for (let i = 0; i < 3; i++) chev(g, 48, 70 - i * 18); }, salvocore: (g) => { for (let i = -2; i <= 2; i++) missile(g, 48 + i * 14, 70 - Math.abs(i) * 8); },
  meltdown: (g) => { flame(g, 48, 82); ring(g, 48, 74, 30, .5); }, smart: (g) => { ring(g, 48, 48, 26); line(g, 48, 12, 48, 30); line(g, 48, 66, 48, 84); line(g, 12, 48, 30, 48); line(g, 66, 48, 84, 48); dot(g, 48, 48, 6); },
  turbo: (g) => { chevR(g, 30, 48); chevR(g, 50, 48); chevR(g, 70, 48); }, overcore: (g) => { ring(g, 48, 48, 28, .25); arc(g, 48, 48, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * .4, 7); dot(g, 48, 48, 9); },
  smoke: (g) => { for (const [x, y, r] of [[34, 56, 16], [54, 48, 20], [66, 62, 14], [44, 66, 12]]) ring(g, x, y, r); bolt(g, 54, 40, 30, .6); }, eject: (g) => { g.strokeRect(24, 56, 48, 26); line(g, 48, 70, 48, 14); line(g, 36, 26, 48, 14); line(g, 60, 26, 48, 14); },
  /* ordnance (Q) */
  cluster: (g) => { missile(g, 30, 58); missile(g, 48, 46); missile(g, 66, 58); for (const [x, y] of [[22, 84], [40, 80], [58, 84], [74, 80]]) dot(g, x, y, 3.5); },
  arcwave: (g) => { bolt(g, 48, 10, 46); arc(g, 48, 92, 22, Math.PI * 1.15, Math.PI * 1.85, 5); arc(g, 48, 92, 36, Math.PI * 1.15, Math.PI * 1.85, 5); },
  tether: (g) => { ring(g, 26, 66, 14); dot(g, 26, 66, 5); line(g, 38, 58, 70, 30); ring(g, 74, 26, 7); line(g, 18, 82, 34, 82); },
  salvo: (g) => { for (let i = 0; i < 4; i++) missile(g, 24 + i * 16, 62); g.strokeRect(14, 74, 68, 12); },
  laser: (g) => { ring(g, 20, 48, 10); const w = g.lineWidth; g.lineWidth = 11; line(g, 32, 48, 86, 48); g.lineWidth = w; line(g, 70, 32, 86, 24); line(g, 70, 64, 86, 72); },
  siphon: (g) => { for (const x of [-18, 0, 18]) { g.beginPath(); g.moveTo(48 + x * .5, 76); g.quadraticCurveTo(48 + x * 1.4, 44, 48 + x, 18); g.stroke(); } g.strokeRect(34, 76, 28, 12); },
  gas: (g) => { g.strokeRect(22, 34, 24, 48); g.strokeRect(28, 26, 12, 8); g.strokeRect(52, 40, 22, 42); flame(g, 64, 34); },
  power: (g) => { dot(g, 48, 48, 12); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(g, 48 + Math.cos(a) * 20, 48 + Math.sin(a) * 20, 48 + Math.cos(a) * 36, 48 + Math.sin(a) * 36); } },
  smokeb: (g) => { for (const [x, y, r] of [[30, 60, 14], [50, 52, 18], [68, 64, 13]]) ring(g, x, y, r); missile(g, 48, 34); line(g, 18, 86, 78, 86); },
  /* defence (E) */
  phase: (g) => { g.globalAlpha = .45; ring(g, 38, 50, 22); g.globalAlpha = 1; ring(g, 58, 46, 22); chevR(g, 46, 48); },
  vtol: (g) => { line(g, 48, 72, 48, 16); line(g, 32, 32, 48, 16); line(g, 64, 32, 48, 16); flame(g, 34, 92); flame(g, 62, 92); },
  buckler: (g) => { g.beginPath(); g.moveTo(48, 12); g.lineTo(78, 24); g.lineTo(74, 58); g.quadraticCurveTo(64, 78, 48, 86); g.quadraticCurveTo(32, 78, 22, 58); g.lineTo(18, 24); g.closePath(); g.stroke(); line(g, 48, 24, 48, 74); },
  vortex: (g) => { g.beginPath(); for (let a = 0; a < Math.PI * 5; a += .15) { const r = 4 + a * 2.6; g.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r); } g.stroke(); },
  pwall: (g) => { arc(g, 48, 92, 56, Math.PI * 1.2, Math.PI * 1.8, 7); for (const x of [26, 40, 56, 70]) line(g, x, 54, x, 84); },
  sonar: (g) => { dot(g, 22, 74, 7); for (const r of [20, 36, 52]) arc(g, 22, 74, r, -Math.PI / 2, 0, 5); },
  furnace: (g) => { g.beginPath(); g.moveTo(48, 10); g.lineTo(78, 22); g.lineTo(74, 56); g.quadraticCurveTo(64, 76, 48, 86); g.quadraticCurveTo(32, 76, 22, 56); g.lineTo(18, 22); g.closePath(); g.stroke(); flame(g, 48, 72); },
  gunshield: (g) => { g.strokeRect(18, 22, 34, 52); line(g, 52, 48, 86, 48); line(g, 52, 42, 86, 42); line(g, 52, 54, 86, 54); },
  anchor: (g) => { ring(g, 48, 18, 8); line(g, 48, 26, 48, 82); line(g, 32, 38, 64, 38); arc(g, 48, 56, 28, Math.PI * .15, Math.PI * .85, 5); },
  /* the rest of a mech's buttons */
  punch: (g) => { g.beginPath(); g.roundRect(24, 30, 48, 40, 9); g.stroke(); for (const x of [36, 48, 60]) line(g, x, 30, x, 46); line(g, 30, 70, 30, 84); line(g, 66, 70, 66, 84); line(g, 30, 84, 66, 84); },
  dash: (g) => { chevR(g, 46, 48); chevR(g, 66, 48); for (const [y, l] of [[34, 22], [48, 30], [62, 22]]) line(g, 30 - l, y, 30, y); },
  coax: (g) => { g.strokeRect(30, 40, 26, 22); line(g, 56, 50, 84, 50); line(g, 56, 46, 84, 46); line(g, 38, 62, 34, 76); ring(g, 20, 30, 6); ring(g, 14, 52, 4); } };
function line(g, a, b, c, d) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
function ring(g, x, y, r, gap = 0) { g.beginPath(); g.arc(x, y, r, gap, Math.PI * 2 - gap); g.stroke(); }
function arc(g, x, y, r, a, b, wd) { const lw = g.lineWidth; g.lineWidth = wd; g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); g.lineWidth = lw; }
function dot(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function bolt(g, x, y, hgt, s = 1) { const k = hgt / 76; g.beginPath(); g.moveTo(x + 8 * k, y); g.lineTo(x - 16 * k, y + 42 * k); g.lineTo(x + 2 * k, y + 42 * k); g.lineTo(x - 8 * k, y + 76 * k); g.lineTo(x + 18 * k, y + 30 * k); g.lineTo(x, y + 30 * k); g.closePath(); g.globalAlpha = s; g.fill(); g.globalAlpha = 1; }
function chev(g, x, y) { g.beginPath(); g.moveTo(x - 24, y + 10); g.lineTo(x, y - 6); g.lineTo(x + 24, y + 10); g.stroke(); }
function chevR(g, x, y) { g.beginPath(); g.moveTo(x - 6, y - 18); g.lineTo(x + 10, y); g.lineTo(x - 6, y + 18); g.stroke(); }
function missile(g, x, y) { g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 4, y - 22); g.lineTo(x + 4, y); g.lineTo(x - 4, y); g.lineTo(x - 4, y - 22); g.closePath(); g.fill(); line(g, x, y + 4, x, y + 14); }
function flame(g, x, y) { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 30, y - 10, x - 18, y - 40, x - 4, y - 64); g.bezierCurveTo(x - 2, y - 44, x + 14, y - 46, x + 10, y - 30); g.bezierCurveTo(x + 22, y - 36, x + 26, y - 14, x, y); g.fill(); }
export function signOf(key, color = "#f6c868") { const k = "sign:" + key + color; if (ICON[k] !== undefined) return ICON[k]; ICON[k] = ""; const draw = SIGNS[key]; if (!draw) return "";
  const cv = document.createElement("canvas"); cv.width = cv.height = 96; const g = cv.getContext("2d"); g.strokeStyle = g.fillStyle = color; g.lineWidth = 5; g.lineCap = g.lineJoin = "round"; g.shadowColor = color; g.shadowBlur = 8; draw(g); return (ICON[k] = cv.toDataURL("image/png")); }
