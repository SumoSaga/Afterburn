/* Afterburn: the links between players.
   One player hosts and is given a short code; up to three others join with it. Every joiner's browser talks straight to
   the host's (WebRTC, through the PeerJS library and its free public broker, which only introduces them). Each link has
   two lanes: a sure one for things that must arrive (orders, hits, deaths), and a quick one for things that are replaced
   a moment later anyway (where a pilot is, where the troops are).
   A joiner whose link drops keeps trying to get back in for a minute.
   With ?local in the address the links run between tabs of one browser instead, for testing without a network. */
export const NET = { role: null, code: "", open: false, ping: 0, status: "", peer: null, bc: null, links: new Map(), me: Math.random().toString(36).slice(2, 8), want: false };
const H = {};
export const onMsg = (k, fn) => { H[k] = fn; };
const LOCAL = /[?&]local/.test(location.search), fire = (k, a, b) => { const fn = H[k]; if (fn) { try { fn(a, b); } catch (e) { console.error("[net]", k, e); } } };
function got(m, from) { if (!m || !m.length) return; if (m[0] === "pg") return send("po", m[1], false, from); if (m[0] === "po") { NET.ping = Math.round(performance.now() - m[1]); return; } fire(m[0], m[1], from); }
// Send one message. sure = true takes the lane that always arrives, in order. A joiner's messages go to the host.
// The host's go to everyone, or to one player (to), or to everyone but one (but).
export function send(k, d, sure = true, to = null, but = null) { if (!NET.role) return; const text = NET.bc ? null : JSON.stringify([k, d]);
  for (const [id, L] of NET.links) { if ((to && id !== to) || id === but || !L.open) continue; try { if (NET.bc) NET.bc.postMessage({ from: NET.me, to: id, m: [k, d] }); else { const c = sure ? L.sure : (L.quick && L.quick.open ? L.quick : L.sure); if (c && c.open) c.send(text); } } catch (e) {} } }
const codeOf = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let s = ""; for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0]; return s; };
const lib = () => new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("The link library could not be loaded.")); document.head.append(s); });
const linkOf = (id) => { let L = NET.links.get(id); if (!L) NET.links.set(id, L = { id, open: false, sure: null, quick: null }); return L; };
function up(id) { const L = linkOf(id); if (L.open) return; L.open = true; if (NET.role === "guest") { NET.open = true; NET.status = "Linked."; if (!NET.tick) NET.tick = setInterval(() => send("pg", performance.now(), false), 1000); fire("_open"); } else fire("_join", id); }
function down(id, why) { const L = NET.links.get(id); if (!L) return; const was = L.open; NET.links.delete(id); try { if (L.sure) L.sure.close(); if (L.quick) L.quick.close(); } catch (e) {} if (!was) return;
  if (NET.role === "guest") { NET.open = false; NET.status = why || "The link to the host has dropped."; fire("_close", NET.status); if (NET.want) retry(); } else fire("_leave", id); }
function wire(c, id) { const L = linkOf(id); if (c.label === "quick") L.quick = c; else L.sure = c; c.on("data", (t) => { let m; try { m = typeof t === "string" ? JSON.parse(t) : t; } catch (e) { return; } got(m, id); });
  if (c.label !== "quick") { c.on("open", () => up(id)); c.on("close", () => down(id)); if (c.open) up(id); } c.on("error", () => {}); }
function local(role) { NET.bc = new BroadcastChannel("afterburn-" + NET.code); NET.bc.onmessage = (e) => { const d = e.data; if (!d || d.from === NET.me || (d.to && d.to !== NET.me)) return;
    if (d.hi) { if (role === "host") { NET.bc.postMessage({ from: NET.me, to: d.from, hi: 1 }); up(d.from); } else up(d.from); return; } if (d.bye) return down(d.from, "The link to the host has dropped."); if (NET.links.has(d.from)) got(d.m, d.from); }; }
// Host a match. Resolves with the code to give the other players once the broker has it.
export async function host() { NET.role = "host"; NET.code = codeOf(); NET.open = true; if (LOCAL) { NET.code = "LOCAL"; local("host"); return NET.code; }
  await lib(); return new Promise((res, rej) => { let tries = 0, told = false; const go = () => { const p = new window.Peer("afterburn-" + NET.code); NET.peer = p;
    p.on("open", () => { NET.status = "Waiting for players."; if (!told) { told = true; res(NET.code); } }); p.on("connection", (c) => wire(c, c.peer));
    p.on("error", (e) => { if (e && e.type === "unavailable-id" && tries++ < 4 && !told) { p.destroy(); NET.code = codeOf(); go(); } else if (!told) { NET.status = "Could not reach the broker (" + (e && e.type || "error") + ")."; NET.role = null; rej(new Error(NET.status)); } });
    p.on("disconnected", () => { try { p.reconnect(); } catch (e) {} }); }; go(); }); }
function dial() { return new Promise((res, rej) => { if (LOCAL) { if (!NET.bc) local("guest"); const t0 = performance.now(), t = setInterval(() => { if (NET.open) { clearInterval(t); res(); } else if (performance.now() - t0 > 30000) { clearInterval(t); rej(new Error("No answer.")); } else NET.bc.postMessage({ from: NET.me, hi: 1 }); }, 200); return; }
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} } const p = new window.Peer(); NET.peer = p; let done = false; const fail = (t) => { if (done) return; done = true; rej(new Error(t)); };
  p.on("open", () => { const id = "afterburn-" + NET.code; wire(p.connect(id, { label: "sure", reliable: true, serialization: "raw" }), id); wire(p.connect(id, { label: "quick", reliable: false, serialization: "raw" }), id);
    const t = setInterval(() => { if (NET.open) { clearInterval(t); done = true; res(); } }, 100); setTimeout(() => { clearInterval(t); if (!NET.open) { NET.links.clear(); fail("No answer. Check the code, and that the host is still there."); } }, 12000); });
  p.on("error", (e) => fail(e && e.type === "peer-unavailable" ? "Nobody is hosting with that code." : "Could not link (" + (e && e.type || "error") + ").")); }); }
// Join the match with this code. Resolves once this browser is linked to the host.
export async function join(code) { NET.role = "guest"; NET.code = String(code || "").trim().toUpperCase(); if (LOCAL) NET.code = "LOCAL"; else await lib(); try { await dial(); NET.want = true; } catch (e) { NET.role = null; NET.status = e.message; throw e; } }
let retrying = false;
async function retry() { if (retrying) return; retrying = true; const t0 = performance.now(); while (NET.want && !NET.open && performance.now() - t0 < 60000) { fire("_retry", Math.round((60000 - (performance.now() - t0)) / 1000)); try { await dial(); } catch (e) { await new Promise((r) => setTimeout(r, 2500)); } } retrying = false; if (NET.want && !NET.open) { NET.want = false; fire("_lost"); } }
export function leave() { NET.want = false; try { if (NET.bc) NET.bc.postMessage({ from: NET.me, bye: 1 }); if (NET.peer) NET.peer.destroy(); if (NET.bc) NET.bc.close(); } catch (e) {} NET.links.clear(); NET.peer = NET.bc = null; NET.open = false; NET.role = null; }
// for testing: cut this joiner's link as a bad network would, without telling anyone it meant to
export function cut() { for (const [id] of NET.links) { if (NET.bc) NET.bc.postMessage({ from: NET.me, bye: 1 }); down(id, "The link to the host has dropped."); } }
