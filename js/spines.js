// Book spines painted onto canvases: colour and texture taken from the real cover, real spine
// typography and layout, the binding's material, a rounded spine and the light falling on it.
// Spines are painted at 3x their shelf size, so the browser shrinks them smoothly in the overview
// (titles soften like print seen across a room) and they stay crisp when a shelf is zoomed.

const R = 2.4; // render scale (canvas px per book px)

const FONTS = [
  { title: "600 {s}px Cinzel", caps: true, author: "500 {s}px 'EB Garamond'" },
  { title: "italic 600 {s}px 'Playfair Display'", caps: false, author: "italic 400 {s}px 'EB Garamond'" },
  { title: "600 {s}px 'EB Garamond'", caps: false, author: "italic 400 {s}px 'EB Garamond'" },
  { title: "500 {s}px Oswald", caps: true, author: "400 {s}px Oswald", authorCaps: true },
  { title: "700 {s}px 'Playfair Display'", caps: true, author: "500 {s}px 'EB Garamond'" },
  { title: "600 {s}px 'Cormorant Garamond'", caps: false, author: "italic 500 {s}px 'Cormorant Garamond'" },
];
export const SPINE_FONT_LOADS = [
  "600 20px Cinzel", "italic 600 20px 'Playfair Display'", "700 20px 'Playfair Display'",
  "600 20px 'EB Garamond'", "italic 400 20px 'EB Garamond'", "500 20px 'EB Garamond'",
  "500 20px Oswald", "400 20px Oswald", "600 20px 'Cormorant Garamond'", "italic 500 20px 'Cormorant Garamond'",
];

const CLOTHS = ["cloth-black", "cloth-linen", "cloth-weave"];
const textures = {};
function tex(name) {
  if (!textures[name]) {
    const img = new Image();
    img.src = `assets/tex/${name}.jpg`;
    textures[name] = img;
    img.onload = () => redrawAll();
  }
  return textures[name];
}

const covers = new Map();   // url -> Image
const live = new Map();     // book id -> Set of {canvas, b}
function cover(url, id) {
  if (!url) return null;
  let img = covers.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url.replace("-L.jpg", "-M.jpg");
    covers.set(url, img);
    img.onload = () => redrawBook(id);
  }
  return img.complete && img.naturalWidth ? img : null;
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [88, 79, 70];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function cleanTitle(t) {
  const s = String(t || "").split(/[:(]/)[0].trim();
  return s || String(t || "");
}

// Each book is painted once into a cached bitmap; every spine on screen (standing, lying,
// pulled out, rebuilt after a zoom) just copies it. New paints are spread over frames.
const cache = new Map(); // book id -> { canvas, withCover }
const queue = [];
let pumping = false;
function pump() {
  pumping = true;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) {
    const e = queue.shift();
    if (e.canvas.isConnected || !e.started) draw(e);
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

// lying = true gives the same spine turned on its side, painted straight into a horizontal
// canvas (an exact 90° pixel turn) so it is as crisp as a standing one
export function makeSpineCanvas(b, lying = false) {
  const c = document.createElement("canvas");
  c.className = "spine-canvas";
  const sw = Math.max(1, Math.round(b.width * R)), sh = Math.max(1, Math.round(b.height * R));
  c.width = lying ? sh : sw;
  c.height = lying ? sw : sh;
  if (!live.has(b.id)) live.set(b.id, new Set());
  const entry = { canvas: c, b, lying, sw, sh };
  live.get(b.id).add(entry);
  const hit = cache.get(b.id);
  if (hit && hit.canvas.width === sw && hit.canvas.height === sh) {
    blit(entry, hit.canvas);
  } else {
    const g = c.getContext("2d");
    g.fillStyle = b.spine || "#584f46";
    g.fillRect(0, 0, c.width, c.height);
    queue.push(entry);
    if (!pumping) requestAnimationFrame(pump);
  }
  return c;
}

function blit(entry, src) {
  const g = entry.canvas.getContext("2d");
  g.save();
  g.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
  if (entry.lying) { g.translate(0, entry.canvas.height); g.rotate(-Math.PI / 2); }
  g.drawImage(src, 0, 0);
  g.restore();
}

function draw(entry) {
  entry.started = true;
  const { b, sw, sh } = entry;
  let hit = cache.get(b.id);
  const coverReady = !!cover(b.cover, b.id);
  if (!hit || hit.canvas.width !== sw || hit.canvas.height !== sh || (coverReady && !hit.withCover)) {
    const off = document.createElement("canvas");
    off.width = sw; off.height = sh;
    paint({ canvas: off, b });
    hit = { canvas: off, withCover: coverReady };
    cache.set(b.id, hit);
  }
  blit(entry, hit.canvas);
}

function redrawBook(id) {
  const set = live.get(id);
  if (!set) return;
  cache.delete(id);
  for (const e of [...set]) {
    if (!e.canvas.isConnected && e.started) { set.delete(e); continue; }
    draw(e);
  }
}
function redrawAll() {
  cache.clear();
  for (const set of live.values()) for (const e of set) { if (e.canvas.isConnected) queue.push(e); }
  if (!pumping && queue.length) requestAnimationFrame(pump);
}

function paint(entry) {
  const { canvas: c, b } = entry;
  entry.painted = true;
  const g = c.getContext("2d");
  const W = c.width, H = c.height;
  const h = hash(b.id + b.title);
  const pick = (n) => (h >>> (n * 3)) % 997;

  const base = rgb(b.spine);
  const band = b.band ? rgb(b.band) : mix(base, lum(base) > 0.5 ? [40, 30, 20] : [230, 210, 170], 0.45);
  const dark = lum(base) < 0.42;
  const ink = dark ? [244, 236, 220] : [30, 24, 18];
  const gold = [214, 178, 104];

  g.save();
  g.clearRect(0, 0, W, H);

  // 1. base: the cover's own colours, softened, under the spine colour
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, H);
  const img = cover(b.cover, b.id);
  if (img) {
    g.save();
    g.filter = `blur(${Math.max(2, W * 0.06)}px) saturate(1.05)`;
    g.globalAlpha = 0.32;
    const sw = Math.max(2, img.naturalWidth * 0.08);
    g.drawImage(img, 0, 0, sw, img.naturalHeight, -W * 0.2, -H * 0.05, W * 1.4, H * 1.1);
    g.restore();
    g.fillStyle = css(base, 0.55);
    g.fillRect(0, 0, W, H);
  }

  // 2. layout style
  const font = FONTS[pick(1) % FONTS.length];
  let style = pick(2) % 4; // 0 rules, 1 label panel, 2 colour blocks, 3 gilt
  if (style === 3 && !dark) style = 0;
  if (style === 1 && W < 24 * R) style = 0;
  let titleInk = ink, authorInk = ink;
  const T0 = H * 0.11, T1 = H * 0.72, A0 = H * 0.75, A1 = H * 0.89;

  if (style === 0) {
    g.fillStyle = css(dark ? gold : band, 0.9);
    for (const y of [H * 0.05, H * 0.065, H * 0.935, H * 0.95]) g.fillRect(0, y, W, Math.max(1, R * 0.7));
  } else if (style === 1) {
    const paper = [236, 226, 204];
    g.fillStyle = css(paper);
    const px = W * 0.12, py = H * 0.1;
    g.fillRect(px, py, W - px * 2, H * 0.6);
    g.strokeStyle = css(band, 0.9);
    g.lineWidth = Math.max(1, R * 0.6);
    g.strokeRect(px + R, py + R, W - px * 2 - R * 2, H * 0.6 - R * 2);
    titleInk = [36, 28, 20];
  } else if (style === 2) {
    g.fillStyle = css(band);
    g.fillRect(0, 0, W, H * 0.09);
    g.fillRect(0, H * 0.74, W, H * 0.17);
    authorInk = lum(band) < 0.45 ? [244, 236, 220] : [30, 24, 18];
  } else {
    titleInk = gold;
    authorInk = mix(gold, [255, 240, 200], 0.2);
    g.fillStyle = css(gold, 0.85);
    for (const y of [H * 0.06, H * 0.075, H * 0.925, H * 0.94]) g.fillRect(0, y, W, Math.max(1, R * 0.8));
  }

  // 3. title, top to bottom, sized to the spine; wide spines take two lines before shrinking
  const title = font.caps ? cleanTitle(b.title).toUpperCase() : cleanTitle(b.title);
  const lenT = (style === 1 ? H * 0.68 : T1) - T0;
  const fontOf = (tpl, s) => tpl.replace("{s}", s.toFixed(1));
  const setF = (s) => { g.font = fontOf(font.title, s); g.letterSpacing = font.caps ? `${(s * 0.06).toFixed(1)}px` : "0px"; };
  const fit = (str, maxFs) => { setF(maxFs); const w = g.measureText(str).width; return w > lenT ? maxFs * lenT / w : maxFs; };
  let lines = [title];
  let fs = fit(title, W * (font.caps ? 0.42 : 0.5));
  const words = title.split(" ");
  if (fs < W * 0.3 && words.length > 1 && W >= 26 * R) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const f2 = Math.min(fit(pair[0], W * 0.3), fit(pair[1], W * 0.3));
      if (!best || f2 > best.f) best = { f: f2, pair };
    }
    if (best && best.f > fs) { lines = best.pair; fs = best.f; }
  }
  const minFs = W * 0.2;
  if (fs < minFs) {
    fs = minFs; setF(fs);
    let t = lines.join(" ");
    while (t.length > 3 && g.measureText(t + "…").width > lenT) t = t.slice(0, -1);
    lines = [t.trimEnd() + "…"];
  }
  setF(fs);
  const lh = fs * 1.05;
  lines.forEach((line, i) => {
    const lw = Math.min(lenT, g.measureText(line).width);
    g.save();
    g.translate(W / 2 + (i - (lines.length - 1) / 2) * lh * -1, T0 + (lenT - lw) / 2);
    g.rotate(Math.PI / 2);
    g.textBaseline = "middle";
    g.fillStyle = css(titleInk);
    g.fillText(line, 0, 0);
    g.restore();
  });
  g.letterSpacing = "0px";

  // 4. author near the foot
  if (b.author && W >= 14 * R) {
    const last = String(b.author).trim().split(/\s+/).slice(-1)[0];
    const name = font.authorCaps ? last.toUpperCase() : last;
    let as = W * 0.3;
    g.font = fontOf(font.author, as);
    const aw = g.measureText(name).width;
    if (aw > A1 - A0) { as *= (A1 - A0) / aw; g.font = fontOf(font.author, as); }
    g.save();
    g.translate(W / 2, A0 + (A1 - A0 - Math.min(A1 - A0, g.measureText(name).width)) / 2);
    g.rotate(Math.PI / 2);
    g.textBaseline = "middle";
    g.fillStyle = css(authorInk, 0.92);
    g.fillText(name, 0, 0);
    g.restore();
  }

  // 5. publisher's mark at the foot
  const mk = Math.min(W * 0.26, 7 * R);
  g.fillStyle = css(style === 3 ? gold : authorInk, 0.75);
  g.strokeStyle = g.fillStyle;
  g.lineWidth = Math.max(1, R * 0.5);
  const my = H * 0.955;
  if (pick(3) % 3 === 0) { g.beginPath(); g.arc(W / 2, my, mk / 2, 0, Math.PI * 2); g.stroke(); }
  else if (pick(3) % 3 === 1) { g.fillRect(W / 2 - mk / 2, my - mk / 4, mk, mk / 2); }
  else { g.beginPath(); g.moveTo(W / 2, my - mk / 2); g.lineTo(W / 2 + mk / 2, my + mk / 3); g.lineTo(W / 2 - mk / 2, my + mk / 3); g.closePath(); g.stroke(); }

  // 6. material: woven cloth, paper fibre, or a gloss highlight
  g.save();
  if (b.finish === "cloth") {
    const t = tex(CLOTHS[h % CLOTHS.length]);
    if (t.complete && t.naturalWidth) {
      g.globalCompositeOperation = "overlay";
      g.globalAlpha = 0.55;
      g.fillStyle = g.createPattern(t, "repeat");
      g.setTransform(R * 0.35, 0, 0, R * 0.35, 0, 0);
      g.fillRect(0, 0, W / (R * 0.35), H / (R * 0.35));
    }
  } else {
    const t = tex("paper-matte");
    if (t.complete && t.naturalWidth) {
      g.globalCompositeOperation = "overlay";
      g.globalAlpha = b.finish === "gloss" ? 0.15 : 0.35;
      g.fillStyle = g.createPattern(t, "repeat");
      g.setTransform(R * 0.4, 0, 0, R * 0.4, 0, 0);
      g.fillRect(0, 0, W / (R * 0.4), H / (R * 0.4));
    }
  }
  g.restore();

  // 7. a rounded spine: light on the curve, falling into shadow at both edges
  const hard = b.binding === "hardcover";
  const sh = g.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, `rgba(0,0,0,${hard ? 0.55 : 0.4})`);
  sh.addColorStop(0.16, "rgba(0,0,0,0.05)");
  sh.addColorStop(0.32, "rgba(0,0,0,0)");
  sh.addColorStop(0.72, "rgba(0,0,0,0.06)");
  sh.addColorStop(1, `rgba(0,0,0,${hard ? 0.6 : 0.45})`);
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  const hi = g.createLinearGradient(0, 0, W, 0);
  const spec = b.finish === "gloss" ? 0.32 : hard ? 0.14 : 0.1;
  hi.addColorStop(0.18, "rgba(255,240,215,0)");
  hi.addColorStop(0.3, `rgba(255,240,215,${spec})`);
  hi.addColorStop(0.42, "rgba(255,240,215,0)");
  g.fillStyle = hi;
  g.fillRect(0, 0, W, H);

  // 8. wear at the head, and the darker foot where the book meets the shelf
  if (b.wear > 0.05) {
    const wr = g.createLinearGradient(0, 0, 0, H * 0.06);
    wr.addColorStop(0, `rgba(255,236,200,${(b.wear * 0.5).toFixed(2)})`);
    wr.addColorStop(1, "rgba(255,236,200,0)");
    g.fillStyle = wr;
    g.fillRect(0, 0, W, H * 0.06);
  }
  const ao = g.createLinearGradient(0, H * 0.9, 0, H);
  ao.addColorStop(0, "rgba(0,0,0,0)");
  ao.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = ao;
  g.fillRect(0, H * 0.9, W, H * 0.1);
  g.fillStyle = "rgba(0,0,0,0.09)";
  g.fillRect(0, 0, W, H);
  g.restore();
}
