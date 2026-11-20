/* Circuit Breaker Pixel Table: weather (table/cbweather.js), after the Revelry Table's sky (clear, overcast, rain, storm,
   snow, fog). Kept on the board as weather: "clear" | "overcast" | "rain" | "storm" | "snow" | "fog", so each table keeps
   its own and everyone sees the same. It dims and greys the sun and the sky's light, thickens the haze, and fills the air
   over the whole table (edge to edge, however big it is) with rain streaks or snow; a storm adds lightning. It eases from
   one to the next.
   window.CBWEATHER.start(api) with { THREE, scene, game, size() [w, d], target(), sun, hemi, post, tod(), fxLayer, flash(at, color, power, life) }. */
(function () {
  const KINDS = [["clear", "Clear"], ["overcast", "Overcast"], ["rain", "Rain"], ["storm", "Storm"], ["snow", "Snow"], ["fog", "Fog"]];
  // how each one changes the light: the sun, the sky's light, the haze; and what falls (count, speed, slant)
  const LOOK = {
    clear: { sun: 1, sky: 1, fog: 1, rain: 0, snow: 0 },
    overcast: { sun: .42, sky: .92, fog: 1.2, rain: 0, snow: 0 },
    rain: { sun: .3, sky: .78, fog: 1.45, rain: 1, snow: 0 },
    storm: { sun: .16, sky: .6, fog: 1.8, rain: 1.8, snow: 0 },
    snow: { sun: .55, sky: 1.05, fog: 1.6, rain: 0, snow: 1 },
    fog: { sun: .5, sky: .9, fog: 2.6, rain: 0, snow: 0 },
  };
  // drops are kept over the table: as many as its area asks for, up to the most the page holds
  const TOP = 260, NR = 7000, NS = 5000, PER_RAIN = 1600 / (720 * 720), PER_SNOW = 1100 / (720 * 720), MARGIN = 30;
  let A = null, T = null, rain = null, snow = null, last = 0, nextBolt = 0, boltT = 0; const cur = { sun: 1, sky: 1, fog: 1, rain: 0, snow: 0 };
  const rnd = Math.random;
  function make() {
    { const g = new T.BufferGeometry(), a = new Float32Array(NR * 6); for (let i = 0; i < NR; i++) { const x = (rnd() - .5) * 2600, y = rnd() * TOP, z = (rnd() - .5) * 2600; a.set([x, y, z, x, y - 9, z], i * 6); } g.setAttribute("position", new T.BufferAttribute(a, 3));
      rain = new T.LineSegments(g, new T.LineBasicMaterial({ color: "#a9bcd6", transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; if (A.fxLayer) A.fxLayer(rain); A.scene.add(rain); }
    { const g = new T.BufferGeometry(), a = new Float32Array(NS * 3); for (let i = 0; i < NS; i++) a.set([(rnd() - .5) * 2600, rnd() * TOP, (rnd() - .5) * 2600], i * 3); g.setAttribute("position", new T.BufferAttribute(a, 3));
      snow = new T.Points(g, new T.PointsMaterial({ color: "#f4f6ff", size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); snow.frustumCulled = false; if (A.fxLayer) A.fxLayer(snow); A.scene.add(snow); }
  }
  function tick() {
    const now = performance.now() / 1000, dt = Math.min(.1, last ? now - last : .016); last = now; if (!A) return;
    const w = LOOK[A.game.state.weather] ? A.game.state.weather : "clear", L = LOOK[w], k = 1 - Math.exp(-dt * 1.6);
    for (const key in cur) cur[key] += (L[key] - cur[key]) * k;
    const td = A.tod() || {}; let flashK = 0;
    if (w === "storm") { if (!nextBolt) nextBolt = now + 3 + rnd() * 6; if (now > nextBolt) { nextBolt = now + 5 + rnd() * 10; boltT = now; const c = A.target(); if (A.flash) A.flash(new T.Vector3(c.x + (rnd() - .5) * 300, 160, c.z + (rnd() - .5) * 300), "#d6e2ff", 16000, .45); } }
    else nextBolt = 0;
    if (boltT && now - boltT < .5) { const e = now - boltT; flashK = e < .06 ? 1 : e < .12 ? .2 : e < .2 ? .8 : Math.max(0, 1 - (e - .2) / .3) * .3; }
    if (A.sun && td.sunI != null) A.sun.intensity = td.sunI * cur.sun;
    if (A.hemi && td.hemiI != null) A.hemi.intensity = td.hemiI * cur.sky + flashK * 2.2;
    if (A.post && A.post.uniforms && A.post.uniforms.fogDen && td.fogDen != null) A.post.uniforms.fogDen.value = td.fogDen * cur.fog;
    const [W, D] = (A.size && A.size()) || [1219.2, 1219.2], hx = W / 2 + MARGIN, hz = D / 2 + MARGIN, area = (2 * hx) * (2 * hz);
    const wrapX = (v) => { const L = 2 * hx; while (v > hx) v -= L; while (v < -hx) v += L; return v; }, wrapZ = (v) => { const L = 2 * hz; while (v > hz) v -= L; while (v < -hz) v += L; return v; };
    // rain: streaks falling fast and a little slanted; heavier in a storm
    rain.material.opacity = Math.min(.42, cur.rain * .3); rain.visible = cur.rain > .02;
    if (rain.visible) { const a = rain.geometry.attributes.position.array, n = Math.min(NR, Math.round(area * PER_RAIN * Math.min(1.6, cur.rain * .7 + .4))), sp = 430 + cur.rain * 160, sl = 60 * cur.rain;
      rain.geometry.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) { const o = i * 6; let x = a[o] + sl * dt, y = a[o + 1] - sp * dt, z = a[o + 2]; if (y < 0) { y += TOP; } x = wrapX(x); z = wrapZ(z); a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x - sl * .02; a[o + 4] = y + 10 + cur.rain * 3; a[o + 5] = z; }
      rain.geometry.attributes.position.needsUpdate = true; }
    // snow: slow flakes that drift
    snow.material.opacity = Math.min(.95, cur.snow * .95); snow.visible = cur.snow > .02;
    if (snow.visible) { const a = snow.geometry.attributes.position.array, ns = Math.min(NS, Math.round(area * PER_SNOW)); snow.geometry.setDrawRange(0, ns);
      for (let i = 0; i < ns; i++) { const o = i * 3; let x = a[o] + Math.sin(now * .7 + i) * 9 * dt + 6 * dt, y = a[o + 1] - (22 + (i % 7) * 3) * dt, z = a[o + 2] + Math.cos(now * .5 + i * .3) * 7 * dt; if (y < 0) y += TOP; a[o] = wrapX(x); a[o + 1] = y; a[o + 2] = wrapZ(z); }
      snow.geometry.attributes.position.needsUpdate = true; }
  }
  const api = {
    KINDS,
    start(a) { A = a; T = a.THREE; make(); const step = () => { try { tick(); } catch (e) { if (!api.warned) { api.warned = true; console.warn("[weather]", e); } } requestAnimationFrame(step); }; requestAnimationFrame(step); },
    get now() { return (A && A.game.state.weather) || "clear"; },
  };
  window.CBWEATHER = api;
})();
