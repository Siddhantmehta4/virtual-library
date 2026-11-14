// Book spines painted onto canvases: colour and texture taken from the real cover, real spine
// typography and layout, the binding's material, a rounded spine and the light falling on it.
// Spines are painted at 3x their shelf size, so the browser shrinks them smoothly in the overview
// (titles soften like print seen across a room) and they stay crisp when a shelf is zoomed.

// render scale (canvas px per book px): enough that a zoomed shelf on a retina screen shows the
// spine at (or above) its painted size, so lettering and cover art stay sharp
const R = (globalThis.devicePixelRatio || 1) > 1.2 ? 3.4 : 2.2;

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
    // read with CORS when the host allows it (then the spine can measure the art it sits on);
    // otherwise load it plainly, which still paints fine
    img.crossOrigin = "anonymous";
    img.onerror = () => {
      const plain = new Image();
      plain.decoding = "async";
      plain.onload = () => redrawBook(id);
      plain.src = img.src;
      covers.set(url, plain);
    };
    img.onload = () => redrawBook(id);
    img.src = url.replace("-M.jpg", "-L.jpg");
    covers.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

// the average colour of the strip of art the spine is cut from (null if the cover's host
// doesn't allow reading it)
function stripTone(img, sx, sw) {
  try {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 32;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, 8, 32);
    const d = g.getImageData(0, 0, 8, 32).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [r / n, gg / n, b / n];
  } catch { return null; }
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
  const gold = [222, 188, 112];

  g.save();
  g.clearRect(0, 0, W, H);

  // 1. the cover's own art wraps round onto the spine: the strip at the cover's left edge,
  // scaled to the spine's height, so every book carries its real colours and imagery
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, H);
  const img = cover(b.cover, b.id);
  let tone = null;
  if (img) {
    const scale = img.naturalHeight / H;
    const sw = Math.min(img.naturalWidth * 0.5, W * scale);
    const sx = Math.min(img.naturalWidth * 0.015, img.naturalWidth - sw);
    g.save();
    g.filter = "saturate(1.12) contrast(1.04)";
    g.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, W, H);
    g.restore();
    tone = stripTone(img, sx, sw);
    // a light settle of the spine colour, so the lettering reads as printed on top of the art
    g.fillStyle = css(tone || base, 0.28);
    g.fillRect(0, 0, W, H);
    // a little more of it behind the title, so the cover's own lettering sinks back
    const z = g.createLinearGradient(0, H * 0.06, 0, H * 0.78);
    const c0 = css(tone || base, 0), c1 = css(tone || base, 0.5);
    z.addColorStop(0, c0); z.addColorStop(0.12, c1); z.addColorStop(0.88, c1); z.addColorStop(1, c0);
    g.fillStyle = z;
    g.fillRect(0, H * 0.06, W, H * 0.72);
  }
  const ground = tone || base;
  const dark = lum(ground) < 0.5;
  const ink = dark ? [248, 242, 230] : [26, 21, 16];

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
  // a soft halo in the opposite tone keeps lettering readable over busy art
  const halo = (c) => { g.shadowColor = lum(c) > 0.5 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.3)"; g.shadowBlur = R * 1.6; };
  lines.forEach((line, i) => {
    const lw = Math.min(lenT, g.measureText(line).width);
    g.save();
    g.translate(W / 2 + (i - (lines.length - 1) / 2) * lh * -1, T0 + (lenT - lw) / 2);
    g.rotate(Math.PI / 2);
    g.textBaseline = "middle";
    g.fillStyle = css(titleInk);
    if (img && style !== 1) halo(titleInk);
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
    g.fillStyle = css(authorInk, 0.95);
    if (img && style !== 2) halo(authorInk);
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

  // 6. material, kept faint so it reads as surface rather than dust
  g.save();
  const t = tex(b.finish === "cloth" ? CLOTHS[h % CLOTHS.length] : "paper-matte");
  if (t.complete && t.naturalWidth) {
    g.globalCompositeOperation = "overlay";
    g.globalAlpha = b.finish === "cloth" ? 0.32 : b.finish === "gloss" ? 0.05 : 0.14;
    const ts = R * (b.finish === "cloth" ? 0.35 : 0.4);
    g.fillStyle = g.createPattern(t, "repeat");
    g.setTransform(ts, 0, 0, ts, 0, 0);
    g.fillRect(0, 0, W / ts, H / ts);
  }
  g.restore();

  // 7. a rounded spine under a soft light from the upper left: a broad lit crown,
  // edges turning away into shade, and on glossy card a crisp highlight with a soft bloom
  const hard = b.binding === "hardcover";
  const sh = g.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, `rgba(0,0,0,${hard ? 0.42 : 0.3})`);
  sh.addColorStop(0.12, "rgba(0,0,0,0.04)");
  sh.addColorStop(0.3, "rgba(0,0,0,0)");
  sh.addColorStop(0.78, "rgba(0,0,0,0.05)");
  sh.addColorStop(1, `rgba(0,0,0,${hard ? 0.46 : 0.34})`);
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  g.save();
  g.globalCompositeOperation = "soft-light";
  const crown = g.createLinearGradient(0, 0, W, 0);
  crown.addColorStop(0.1, "rgba(255,255,255,0)");
  crown.addColorStop(0.34, "rgba(255,255,255,0.55)");
  crown.addColorStop(0.62, "rgba(255,255,255,0)");
  g.fillStyle = crown;
  g.fillRect(0, 0, W, H);
  g.restore();
  const gloss = b.finish === "gloss" ? 1 : b.finish === "matte" ? 0.45 : hard ? 0.3 : 0.2;
  const hi = g.createLinearGradient(0, 0, W, 0);
  hi.addColorStop(0.2, "rgba(255,252,245,0)");
  hi.addColorStop(0.29, `rgba(255,252,245,${(0.16 * gloss).toFixed(3)})`);
  hi.addColorStop(0.315, `rgba(255,252,245,${(0.42 * gloss).toFixed(3)})`);
  hi.addColorStop(0.34, `rgba(255,252,245,${(0.16 * gloss).toFixed(3)})`);
  hi.addColorStop(0.46, "rgba(255,252,245,0)");
  g.fillStyle = hi;
  g.fillRect(0, 0, W, H);
  // the light falls off a little toward the foot
  const fall = g.createLinearGradient(0, 0, 0, H);
  fall.addColorStop(0, "rgba(255,248,236,0.06)");
  fall.addColorStop(0.5, "rgba(0,0,0,0)");
  fall.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = fall;
  g.fillRect(0, 0, W, H);

  // 8. a little wear at the head, a crisp edge where the spine meets the boards
  if (b.wear > 0.05) {
    const wr = g.createLinearGradient(0, 0, 0, H * 0.05);
    wr.addColorStop(0, `rgba(255,240,215,${(b.wear * 0.35).toFixed(2)})`);
    wr.addColorStop(1, "rgba(255,240,215,0)");
    g.fillStyle = wr;
    g.fillRect(0, 0, W, H * 0.05);
  }
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.fillRect(0, 0, W, Math.max(1, R * 0.5));
  g.restore();
}
