/* Afterburn: the link between two players.
   One player hosts and is given a short code; the other joins with it. The two browsers then talk straight to each
   other (WebRTC, through the PeerJS library and its free public broker, which only introduces them). There are two
   lanes: a sure one for things that must arrive (orders, hits, deaths), and a quick one for things that are replaced
   a moment later anyway (where a pilot is, where the troops are).
   With ?local in the address the link runs between two tabs of one browser instead, for testing without a network. */
export const NET = { on: false, role: null, code: "", open: false, ping: 0, status: "", peer: null, sure: null, quick: null, bc: null, me: Math.random().toString(36).slice(2, 8) };
const H = {};
export const onMsg = (k, fn) => { H[k] = fn; };
const LOCAL = /[?&]local/.test(location.search);
const got = (m) => { if (!m || !m.length) return; if (m[0] === "pg") return send("po", m[1], false); if (m[0] === "po") { NET.ping = Math.round(performance.now() - m[1]); return; } const fn = H[m[0]]; if (fn) { try { fn(m[1]); } catch (e) { console.error("[net]", m[0], e); } } };
// send one message. sure = true takes the lane that always arrives, in order; false takes the quick lane
export function send(k, d, sure = true) { if (!NET.open) return; try { if (NET.bc) NET.bc.postMessage({ from: NET.me, m: [k, d] }); else { const c = sure ? NET.sure : (NET.quick && NET.quick.open ? NET.quick : NET.sure); if (c && c.open) c.send(JSON.stringify([k, d])); } } catch (e) {} }
const codeOf = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let s = ""; for (let i = 0; i < 5; i++) s += L[(Math.random() * L.length) | 0]; return s; };
const lib = () => new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("The link library could not be loaded.")); document.head.append(s); });
function opened() { if (NET.open) return; NET.open = NET.on = true; NET.status = "Linked."; if (!NET.tick) NET.tick = setInterval(() => send("pg", performance.now(), false), 1000); if (H._open) H._open(); }
function closed(why) { if (!NET.open) return; NET.open = false; NET.status = why || "The link has closed."; if (H._close) H._close(NET.status); }
function wire(c) { if (c.label === "quick") NET.quick = c; else NET.sure = c; c.on("data", (t) => { let m; try { m = typeof t === "string" ? JSON.parse(t) : t; } catch (e) { return; } got(m); }); c.on("open", () => { if (c.label !== "quick") opened(); }); c.on("close", () => { if (c.label !== "quick") closed("The other player has left."); }); c.on("error", () => {}); if (c.open && c.label !== "quick") opened(); }
function local(code, role) { NET.bc = new BroadcastChannel("afterburn-" + code); NET.bc.onmessage = (e) => { const d = e.data; if (!d || d.from === NET.me) return; if (d.hi) { if (role === "host" && !NET.open) { NET.bc.postMessage({ from: NET.me, hi: 1 }); opened(); } else if (role === "guest") opened(); return; } got(d.m); }; if (role === "guest") NET.bc.postMessage({ from: NET.me, hi: 1 }); }
// Host a match. Resolves with the code to give the other player once the broker has it.
export async function host() { NET.role = "host"; NET.code = codeOf(); if (LOCAL) { NET.code = "LOCAL"; local(NET.code, "host"); return NET.code; }
  await lib(); return new Promise((res, rej) => { let tries = 0; const go = () => { const p = new window.Peer("afterburn-" + NET.code); NET.peer = p;
    p.on("open", () => { NET.status = "Waiting for the other player."; res(NET.code); }); p.on("connection", (c) => { if (NET.open && c.label !== "quick") { c.close(); return; } wire(c); });
    p.on("error", (e) => { if (e && e.type === "unavailable-id" && tries++ < 4) { p.destroy(); NET.code = codeOf(); go(); } else if (!NET.open) { NET.status = "Could not reach the broker (" + (e && e.type || "error") + ")."; rej(new Error(NET.status)); } });
    p.on("disconnected", () => { try { p.reconnect(); } catch (e) {} }); }; go(); }); }
// Join the match with this code. Resolves once the two browsers are linked.
export async function join(code) { NET.role = "guest"; NET.code = String(code || "").trim().toUpperCase(); if (LOCAL) { NET.code = "LOCAL"; local(NET.code, "guest"); return new Promise((res) => { const t = setInterval(() => { if (NET.open) { clearInterval(t); res(); } else NET.bc.postMessage({ from: NET.me, hi: 1 }); }, 200); }); }
  await lib(); return new Promise((res, rej) => { const p = new window.Peer(); NET.peer = p; let done = false; const fail = (t) => { if (done) return; done = true; NET.status = t; rej(new Error(t)); };
    p.on("open", () => { const id = "afterburn-" + NET.code; wire(p.connect(id, { label: "sure", reliable: true, serialization: "raw" })); wire(p.connect(id, { label: "quick", reliable: false, serialization: "raw" }));
      const t = setInterval(() => { if (NET.open) { clearInterval(t); done = true; res(); } }, 100); setTimeout(() => { clearInterval(t); fail("No answer. Check the code, and that the host is still waiting."); }, 15000); });
    p.on("error", (e) => fail(e && e.type === "peer-unavailable" ? "Nobody is hosting with that code." : "Could not link (" + (e && e.type || "error") + ").")); }); }
export function leave() { try { send("bye", 0); } catch (e) {} closed("You left the match."); try { if (NET.peer) NET.peer.destroy(); if (NET.bc) NET.bc.close(); } catch (e) {} NET.peer = NET.sure = NET.quick = NET.bc = null; NET.on = false; NET.role = null; }
