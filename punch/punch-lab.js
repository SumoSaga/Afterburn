/* Punch sound lab: a panel for hearing every sound in the bank on its own, layer by layer, and changing the numbers.
   PUNCH.lab.open() / PUNCH.lab.close() / PUNCH.lab.isOpen. Needs punch.js loaded first.
   Changes are kept on this browser and are heard in the game straight away. "Copy my mix" gives the numbers as text. */
(function (root) {
  "use strict";
  const PUNCH = root.PUNCH; if (!PUNCH) return;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const CSS = `
  #plab { position: fixed; inset: 0; z-index: 50; background: rgba(14,11,9,.96); color: #efe2c8; font: 13px/1.4 "Courier New", ui-monospace, monospace; display: none; user-select: none; }
  #plab .top { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 2px solid #5a4630; }
  #plab h1 { font-size: 16px; margin: 0; letter-spacing: .12em; color: #f2c46a; } #plab h2 { font-size: 12px; margin: 12px 0 4px; letter-spacing: .1em; color: #f2c46a; text-transform: uppercase; }
  #plab .note { color: #b9a582; font-size: 12px; } #plab .grow { flex: 1; }
  #plab .cols { display: grid; grid-template-columns: 220px 1fr 280px; height: calc(100% - 50px); }
  #plab .col { overflow-y: auto; padding: 8px 14px 20px; } #plab .col + .col { border-left: 2px solid #5a4630; }
  #plab button { font: inherit; background: #2d241b; color: #efe2c8; border: 2px solid #6b5438; padding: 4px 10px; cursor: pointer; }
  #plab button:hover { border-color: #f2c46a; } #plab button.on { background: #7a4a1c; border-color: #f2a046; } #plab button.go { background: #7a4a1c; border-color: #f2a046; font-size: 15px; padding: 7px 16px; }
  #plab .list button { display: block; width: 100%; text-align: left; margin: 2px 0; }
  #plab .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
  #plab .sl { display: grid; grid-template-columns: 96px 1fr 52px; gap: 8px; align-items: center; margin: 2px 0; } #plab .sl span:last-child { text-align: right; color: #f2c46a; }
  #plab input[type=range] { width: 100%; accent-color: #e4a050; }
  #plab .layer { border: 2px solid #5a4630; background: rgba(20,16,12,.86); padding: 8px 10px; margin: 8px 0; display: grid; grid-template-columns: 1fr 190px; gap: 12px; } #plab .layer.off { opacity: .45; }
  #plab .layer b { color: #f2c46a; } #plab canvas { width: 190px; height: 64px; background: #1b1611; border: 2px solid #3a2e21; image-rendering: pixelated; }
  #plab .bar { height: 10px; background: #2d241b; border: 2px solid #6b5438; margin-top: 4px; } #plab .bar div { height: 100%; width: 0; background: #e4a050; }
  #plab textarea { width: 100%; height: 90px; background: #1b1611; color: #efe2c8; border: 2px solid #5a4630; font: inherit; font-size: 11px; display: none; }
  @media (max-width: 900px) { #plab .cols { grid-template-columns: 150px 1fr; } #plab .mix { grid-column: 1 / -1; border-left: 0; border-top: 2px solid #5a4630; } }`;
  let el, cur = "carbine", dist = 0, side = 0, raf = 0, burstT = 0; const shut = { "Command voice: Militia": 1, "Command voice: The Machine": 1, "Titan voice": 1 };
  const S = PUNCH.SET, fmt = (v, d = 2) => (+v).toFixed(d).replace(/\.?0+$/, "") || "0";
  function slider(host, label, v, mn, mx, st, on, show = fmt) { const r = h("label", "sl"), a = h("span", "", label), i = h("input"), o = h("span", "", show(v)); i.type = "range"; i.min = mn; i.max = mx; i.step = st; i.value = v;
    i.oninput = () => { o.textContent = show(+i.value); on(+i.value); }; r.append(a, i, o); host.append(r); return i; }
  function where() { if (dist <= 0) return undefined; const E = PUNCH.ears, a = side * Math.PI / 2, rx = -E.fz, rz = E.fx; return [E.x + (E.fx * Math.cos(a) + rx * Math.sin(a)) * dist, E.y, E.z + (E.fz * Math.cos(a) + rz * Math.sin(a)) * dist]; }
  function fire(solo) { PUNCH.start(root.PUNCH_BASE).then(() => { const n = PUNCH.BANK[cur].layers[0].s; if (PUNCH.BANK[cur].voice && !PUNCH.buffers[n]) { el.querySelector('.out').textContent = 'The voices are still loading. Try again in a moment.'; return; } PUNCH.play(cur, { pos: where(), solo }); }); }
  function burst() { const d = PUNCH.BANK[cur], n = d.rate < .2 ? 8 : 3; clearInterval(burstT); let i = 0; fire(); burstT = setInterval(() => { if (++i >= n) return clearInterval(burstT); fire(); }, (d.rate || .3) * 1000); }
  function wave(cv, buf) { const c = cv.getContext("2d"), W = cv.width = 190, H = cv.height = 64; c.fillStyle = "#1b1611"; c.fillRect(0, 0, W, H); if (!buf) return; const d = buf.getChannelData(0), step = d.length / W; c.fillStyle = "#e4a050";
    for (let x = 0; x < W; x++) { let m = 0; for (let i = Math.floor(x * step); i < (x + 1) * step; i++) m = Math.max(m, Math.abs(d[i] || 0)); const y = Math.max(1, m * H); c.fillRect(x, (H - y) / 2, 1, y); } }
  function drawList() { const host = el.querySelector(".list"); host.innerHTML = ""; let g = "";
    for (const k in PUNCH.BANK) { const d = PUNCH.BANK[k]; if (d.group !== g) { g = d.group; const hd = h("h2", "", (shut[g] ? "+ " : "- ") + g), gg = g; hd.style.cursor = "pointer"; hd.onclick = () => { shut[gg] = !shut[gg]; drawList(); }; host.append(hd); } if (shut[g] && k !== cur) continue; const b = h("button", k === cur ? "on" : "", d.label); b.onclick = () => { cur = k; drawList(); drawSound(); fire(); }; host.append(b); } }
  function drawSound() { const host = el.querySelector(".sound"), d = PUNCH.BANK[cur], save = () => PUNCH.saveBank(); host.innerHTML = "";
    host.append(h("h1", "", d.voice ? "\u201C" + d.label + "\u201D" : d.label.toUpperCase())); host.append(h("div", "note", d.voice ? "A spoken line. Press Space to hear it." : d.loop ? "A loop. Here it plays through once; in the game it runs until it is no longer needed." : d.layers.length + (d.layers.length === 1 ? " layer" : " layers stacked together") + ". Press Space to play it."));
    const row = h("div", "row"), go = h("button", "go", "Play"); go.onclick = () => fire(); row.append(go);
    if (d.rate) { const b = h("button", "", d.rate < .2 ? "Burst of 8" : "Three in a row"); b.onclick = burst; row.append(b); }
    const rs = h("button", "", "Back to the shipped numbers"); rs.onclick = () => { PUNCH.resetSound(cur); drawSound(); }; row.append(rs); host.append(row);
    host.append(h("h2", "", "Where you hear it from"));
    slider(host, "Distance", dist, 0, 150, 1, (v) => { dist = v; }, (v) => v <= 0 ? "close" : v + " m"); slider(host, "Side", side, -1, 1, .05, (v) => { side = v; }, (v) => v < -.05 ? "left" : v > .05 ? "right" : "ahead");
    host.append(h("h2", "", "The whole sound"));
    slider(host, "Yard echo", d.tail ?? 0, 0, 1.5, .05, (v) => { d.tail = v; save(); });
    if (d.duck != null) slider(host, "Duck others", d.duck, 0, 1, .05, (v) => { d.duck = v; save(); });
    if (d.ref != null) slider(host, "Carries", d.ref, 1, 40, 1, (v) => { d.ref = v; save(); }, (v) => v + " m");
    host.append(h("h2", "", "Layers"));
    for (const l of d.layers) { const box = h("div", "layer" + (l.mute ? " off" : "")), a = h("div"), b = h("div"), head = h("div", "row"); head.append(h("b", "", l.id), h("span", "note", l.synth ? "sine thump made in code" : [].concat(l.s).join(", ")));
      const m = h("button", l.mute ? "on" : "", "Mute"); m.onclick = () => { l.mute = l.mute ? 0 : 1; save(); drawSound(); }; const so = h("button", "", "Alone"); so.onclick = () => fire(l.id); head.append(h("span", "grow"), m, so); a.append(head);
      slider(a, "Volume", l.gain, 0, 1.5, .01, (v) => { l.gain = v; save(); });
      if (l.synth) { slider(a, "Starts at", l.f0, 30, 200, 1, (v) => { l.f0 = v; save(); }, (v) => v + " Hz"); slider(a, "Falls to", l.f1, 15, 120, 1, (v) => { l.f1 = v; save(); }, (v) => v + " Hz"); slider(a, "Length", l.dur, .03, 1, .01, (v) => { l.dur = v; save(); }, (v) => fmt(v) + " s"); }
      else { slider(a, "Pitch", l.pitch || 1, .4, 2, .01, (v) => { l.pitch = v; save(); });
        slider(a, "Cut lows", l.hp || 0, 0, 4000, 10, (v) => { l.hp = v || undefined; save(); }, (v) => v ? v + " Hz" : "off"); slider(a, "Cut highs", l.lp || 0, 0, 12000, 10, (v) => { l.lp = v || undefined; save(); }, (v) => v ? v + " Hz" : "off");
        slider(a, "Falls away", l.decay || 0, 0, .6, .005, (v) => { l.decay = v || undefined; save(); }, (v) => v ? Math.round(v * 1000) + " ms" : "natural");
        slider(a, "Starts late", l.delay || 0, 0, 1.2, .005, (v) => { l.delay = v || undefined; save(); }, (v) => Math.round(v * 1000) + " ms");
        const cv = h("canvas"); b.append(cv); wave(cv, PUNCH.buffers[[].concat(l.s)[0]]); }
      box.append(a, b); host.append(box); } }
  function drawMix() { const host = el.querySelector(".mixs"); host.innerHTML = ""; const ch = () => { PUNCH.applyMix(); PUNCH.saveMix(); };
    for (const [k, n, mx] of [["master", "Master", 1.2], ["weapons", "Your weapons", 1.5], ["impacts", "Impacts", 1.5], ["world", "Enemy fire", 1.5], ["ui", "Hit feedback", 1.5], ["voice", "Voices", 1.5], ["ambience", "Ambience", 2], ["tail", "Yard echo", 2], ["duck", "Ducking", 1.5], ["sub", "Sub thump", 1.5]]) slider(host, n, S[k], 0, mx, .01, (v) => { S[k] = v; ch(); }); }
  function tick() { raf = requestAnimationFrame(tick); const m = PUNCH.meter; if (!m) return; const d = tick.d ??= new Float32Array(m.fftSize); m.getFloatTimeDomainData(d); let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
    tick.p = Math.max(p, (tick.p || 0) * .93); el.querySelector(".peak").style.width = Math.min(100, tick.p * 100) + "%"; el.querySelector(".sq").style.width = Math.min(100, -PUNCH.reduction * 5) + "%"; el.querySelector(".sqn").textContent = "Compressor is squeezing by " + fmt(-PUNCH.reduction, 1) + " dB"; }
  function make() { const st = h("style"); st.textContent = CSS; document.head.append(st); el = h("div"); el.id = "plab";
    el.innerHTML = `<div class="top"><h1>SOUND LAB</h1><span class="note grow">Pick a sound, play it, and move the sliders. Your changes are kept on this browser and the game uses them right away.</span><button class="x on">Close the lab</button></div>
      <div class="cols"><div class="col list"></div><div class="col sound"></div><div class="col mix"><h2>The mix</h2><div class="mixs"></div>
      <h2>Output</h2><div class="note">Loudness going out</div><div class="bar"><div class="peak"></div></div><div class="note sqn" style="margin-top:6px"></div><div class="bar"><div class="sq" style="background:#8fe0f0"></div></div>
      <div class="row" style="margin-top:14px"><button class="copy">Copy my mix</button><button class="reset">Reset everything</button><button class="mute"></button></div><textarea readonly></textarea><p class="note out"></p>
      <h2>Credits</h2><p class="note cred"></p></div></div>`;
    document.body.append(el); el.querySelector(".cred").textContent = PUNCH.CREDITS; el.querySelector(".x").onclick = close;
    const mute = el.querySelector(".mute"), ml = () => { mute.textContent = S.on ? "Sound is on" : "Sound is off"; mute.className = "mute" + (S.on ? " on" : ""); }; mute.onclick = () => { PUNCH.enable(!S.on); ml(); }; ml();
    el.querySelector(".reset").onclick = () => { PUNCH.resetAll(); drawSound(); el.querySelector(".out").textContent = "Every sound is back to the shipped numbers."; };
    el.querySelector(".copy").onclick = () => { const txt = JSON.stringify({ mix: S, bank: PUNCH.edits() }), ta = el.querySelector("textarea"), out = el.querySelector(".out"); const done = (ok) => { out.textContent = ok ? "Copied. Paste it to Claude and these can become the shipped numbers." : "Copy the text above and paste it to Claude."; if (!ok) { ta.style.display = "block"; ta.value = txt; ta.select(); } };
      try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch (e) { done(false); } };
    addEventListener("keydown", (e) => { if (!lab.isOpen) return; if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); fire(); } if (e.code === "Escape") close(); }, true); }
  function open() { if (!el) make(); el.style.display = "block"; lab.isOpen = true; drawList(); drawSound(); drawMix(); PUNCH.start(root.PUNCH_BASE).then(() => { if (lab.isOpen) drawSound(); }); cancelAnimationFrame(raf); tick(); }
  function close() { if (!el) return; el.style.display = "none"; lab.isOpen = false; cancelAnimationFrame(raf); clearInterval(burstT); if (lab.onClose) lab.onClose(); }
  const lab = PUNCH.lab = { open, close, isOpen: false, onClose: null };
})(typeof window !== "undefined" ? window : globalThis);
