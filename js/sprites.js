// Pixel-art objects, drawn in code onto tiny canvases and shown with crisp, square pixels.
// Each sprite returns a list of frames (data URLs). Frame 0 is the resting pose; the rest
// play on hover. Light comes from the lamp in the centre arch, so highlights sit on the
// left/top of objects to its left and the right/top of objects to its right.

const PAL = {
  brassHi: "#f6e2a0", brass: "#d6ad55", brassMid: "#b48a3a", brassLo: "#7c5a22", brassDk: "#4c3612",
  shadeHi: "#fbefcb", shade: "#efdcae", shadeMid: "#d9c08a", shadeLo: "#b49a64", shadeDk: "#8a7346",
  bulb: "#fff6d2", bulbHot: "#ffffff",
  woodHi: "#b07a4c", wood: "#8a5a34", woodMid: "#6e4426", woodLo: "#51301a", woodDk: "#33200f",
  paper: "#f2e7cc", paperMid: "#e0d1ad", paperLo: "#c4b28a", ink: "#9d8b66",
  coverDk: "#3a1c12", cover: "#5c2c1a", ribbon: "#9b2a22",
  black: "#17130f", blackHi: "#4a4238", gold: "#e5c06a", goldLo: "#a07a2c",
  silver: "#dde2e6", silverMid: "#a9b0b6", silverLo: "#6c737a", lens: "rgba(190,214,226,0.32)",
  glass: "rgba(214,232,238,0.55)", glassHi: "rgba(255,255,255,0.85)", glassIn: "rgba(214,232,238,0.10)",
  sand: "#1c1814", sandHi: "#3a332b",
  pot: "#b45a34", potHi: "#d7804f", potLo: "#843b1f", soil: "#33200f",
  leafDk: "#2f5528", leaf: "#477a36", leafMid: "#5f9845", leafHi: "#8cc06a", stem: "#3c5a24",
  card: "#6b1d25", cardLo: "#4a1219", cardLine: "#d9c497", edge: "#efe3c6", edgeLo: "#c9b68e",
  plane: "#f4ecdb", planeMid: "#ddd1b6", planeLo: "#b9ab8d", planeDk: "#8f8267",
  can: "#7b8b6a", canHi: "#a9b896", canLo: "#55644a", water: "#9fd0e6",
};

function canvasOf(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const api = {
    g,
    p(x, y, col) { if (col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); } },
    r(x, y, ww, hh, col) { if (col && ww > 0 && hh > 0) { g.fillStyle = col; g.fillRect(x | 0, y | 0, ww | 0, hh | 0); } },
    // horizontal span centred on cx
    span(cx, y, width, col) { const x0 = Math.round(cx - width / 2); api.r(x0, y, Math.round(width), 1, col); return x0; },
    ellipse(cx, cy, rx, ry, col) {
      for (let y = -ry; y <= ry; y++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001))));
        api.r(cx - half, cy + y, half * 2 + 1, 1, col);
      }
    },
  };
  draw(api);
  return c.toDataURL();
}

// ---------- lamp: brass table lamp with a pleated fabric shade ----------
function lampFrame(on, chainX, bright) {
  return canvasOf(26, 42, ({ p, r, span }) => {
    const cx = 13;
    // shade (rows 3..17), widening downwards
    span(cx, 2, 10, PAL.brassMid);
    for (let i = 0; i <= 14; i++) {
      const y = 3 + i;
      const wdt = 10 + Math.round((i * 12) / 14);
      const x0 = Math.round(cx - wdt / 2);
      const t = i / 14;
      const base = on ? (t < 0.3 ? PAL.shadeMid : t < 0.75 ? PAL.shade : PAL.shadeHi) : (t < 0.5 ? "#6d6048" : "#7d6e52");
      r(x0, y, wdt, 1, base);
      // pleats
      for (let x = x0 + 2; x < x0 + wdt - 1; x += 3) p(x, y, on ? PAL.shadeLo : "#5d5240");
      p(x0, y, on ? PAL.shadeDk : "#4a4132");
      p(x0 + wdt - 1, y, on ? PAL.shadeLo : "#4a4132");
    }
    span(cx, 18, 24, PAL.brassMid);
    span(cx - 1, 18, 8, PAL.brass);
    // bulb under the shade
    if (on) { span(cx, 19, 6, bright ? PAL.bulbHot : PAL.bulb); span(cx, 20, 4, PAL.bulb); }
    else { span(cx, 19, 6, "#8f876f"); }
    // pull chain
    for (let y = 19; y <= 25; y += 2) p(chainX, y, PAL.brass);
    r(chainX, 26, 2, 2, PAL.brassHi);
    // stem
    r(cx - 1, 21, 2, 16, PAL.brass);
    r(cx - 1, 21, 1, 16, PAL.brassHi);
    r(cx + 1, 21, 1, 16, PAL.brassLo);
    span(cx, 28, 4, PAL.brassMid);
    span(cx, 29, 4, PAL.brass);
    // base
    span(cx, 37, 10, PAL.brass);
    span(cx, 38, 14, PAL.brassMid);
    span(cx, 39, 16, PAL.brassLo);
    span(cx, 40, 16, PAL.brassDk);
    span(cx - 2, 38, 6, PAL.brassHi);
  });
}
export const lamp = {
  w: 26, h: 42,
  frames: [lampFrame(true, 18, false), lampFrame(true, 19, true), lampFrame(true, 18, false), lampFrame(true, 17, true)],
  off: lampFrame(false, 18, false),
};

// ---------- open book on a small reading stand ----------
function bookFrame(turn) {
  return canvasOf(34, 24, ({ p, r }) => {
    // stand
    r(4, 17, 26, 2, PAL.woodMid);
    r(4, 17, 26, 1, PAL.woodHi);
    r(7, 19, 2, 4, PAL.woodLo);
    r(25, 19, 2, 4, PAL.woodLo);
    r(5, 22, 6, 1, PAL.woodDk);
    r(23, 22, 6, 1, PAL.woodDk);
    // cover behind the pages
    r(2, 3, 30, 15, PAL.coverDk);
    r(2, 3, 30, 1, PAL.cover);
    // pages: a shallow V, lower at the gutter
    for (let x = 3; x <= 30; x++) {
      const d = Math.abs(x - 16.5);
      const top = 3 + Math.round((8.5 - Math.min(d, 8.5)) / 4);
      r(x, top, 1, 17 - top, d < 1.5 ? PAL.paperLo : d < 4 ? PAL.paperMid : PAL.paper);
    }
    // text lines
    for (let y = 6; y <= 14; y += 2) {
      r(5, y, 9, 1, PAL.ink);
      r(19, y, 9, 1, PAL.ink);
    }
    r(5, 14, 5, 1, PAL.paperMid);
    // ribbon
    r(16, 16, 1, 4, PAL.ribbon);
    p(15, 20, PAL.ribbon);
    p(17, 20, PAL.ribbon);
    // a page lifting on hover
    if (turn > 0) {
      const reach = [0, 27, 23, 19][turn];
      for (let x = 17; x <= reach; x++) {
        const lift = Math.round(((x - 17) / Math.max(1, reach - 17)) * (turn === 2 ? 3 : 2));
        r(x, 4 - lift, 1, 12 + (turn === 3 ? 0 : 0), x > reach - 2 ? PAL.paperMid : PAL.paper);
      }
      r(reach, 4 - (turn === 2 ? 3 : 2), 1, 12, PAL.paperLo);
    }
  });
}
export const openBook = { w: 34, h: 24, frames: [bookFrame(0), bookFrame(1), bookFrame(2), bookFrame(3), bookFrame(2), bookFrame(1)] };

// ---------- fountain pen ----------
export const pen = {
  w: 32, h: 6,
  frames: [canvasOf(32, 6, ({ p, r }) => {
    // lies with a slight rise to the right
    for (let x = 0; x < 30; x++) {
      const y = 3 - Math.round(x / 15);
      const col = x < 3 ? PAL.gold : x < 5 ? PAL.goldLo : x < 26 ? PAL.black : x < 28 ? PAL.gold : PAL.black;
      r(x, y, 1, 2, col);
      if (x >= 5 && x < 26) p(x, y, PAL.blackHi);
    }
    p(0, 3, PAL.brassHi); // nib tip catches light
    r(18, 0, 7, 1, PAL.gold); // clip
    p(30, 1, PAL.black);
  })],
};

// ---------- carved wooden glasses holder with octagonal frames ----------
function glassesFrame(glint) {
  return canvasOf(22, 42, ({ p, r, ellipse, span }) => {
    // carved head shape
    ellipse(11, 14, 7, 12, PAL.wood);
    ellipse(10, 13, 5, 10, PAL.woodHi);
    ellipse(11, 14, 4, 9, PAL.wood);
    for (let y = 4; y < 26; y += 3) span(13, y, 3, PAL.woodMid); // grain
    // nose ridge
    r(10, 12, 2, 9, PAL.woodHi);
    p(12, 20, PAL.woodLo);
    // neck and plinth
    r(8, 26, 7, 7, PAL.woodMid);
    r(8, 26, 2, 7, PAL.wood);
    r(4, 33, 15, 2, PAL.wood);
    r(3, 35, 17, 5, PAL.woodMid);
    r(3, 35, 17, 1, PAL.woodHi);
    r(3, 39, 17, 1, PAL.woodDk);
    // octagonal lenses resting on the nose
    const oct = (x0, y0) => {
      r(x0 + 2, y0, 4, 1, PAL.silver);
      r(x0 + 2, y0 + 6, 4, 1, PAL.silverMid);
      r(x0, y0 + 2, 1, 3, PAL.silver);
      r(x0 + 7, y0 + 2, 1, 3, PAL.silverMid);
      p(x0 + 1, y0 + 1, PAL.silver); p(x0 + 6, y0 + 1, PAL.silver);
      p(x0 + 1, y0 + 5, PAL.silverMid); p(x0 + 6, y0 + 5, PAL.silverLo);
      r(x0 + 1, y0 + 2, 6, 3, PAL.lens);
      r(x0 + 2, y0 + 1, 4, 1, PAL.lens);
      r(x0 + 2, y0 + 5, 4, 1, PAL.lens);
    };
    oct(1, 15);
    oct(13, 15);
    r(9, 16, 4, 1, PAL.silver); // bridge
    // glint sweeping across the lenses
    if (glint > 0) {
      const gx = [0, 2, 6, 14, 18][glint];
      for (let i = 0; i < 4; i++) p(gx + i, 20 - i, "rgba(255,255,255,0.9)");
    }
  });
}
export const glasses = { w: 22, h: 42, frames: [glassesFrame(0), glassesFrame(1), glassesFrame(2), glassesFrame(3), glassesFrame(4), glassesFrame(0)] };

// ---------- frameless hourglass with black sand ----------
function hourglassFrame(grain) {
  return canvasOf(16, 30, ({ p, r, ellipse }) => {
    const bulb = (cy, sandFrom, top) => {
      ellipse(8, cy, 6, 6, PAL.glass);
      ellipse(8, cy, 5, 5, PAL.glassIn);
      // sand
      for (let y = -5; y <= 5; y++) {
        const yy = cy + y;
        if ((top && yy < sandFrom) || (!top && yy < sandFrom)) continue;
        const half = Math.round(5 * Math.sqrt(Math.max(0, 1 - (y * y) / 26)));
        const shrink = top ? Math.max(0, Math.round((yy - sandFrom) * 0.9)) : 0;
        r(8 - half + shrink, yy, (half - shrink) * 2 + 1, 1, PAL.sand);
      }
      r(3, cy - 3, 1, 4, PAL.glassHi);
    };
    bulb(7, 9, true);
    bulb(22, 23, false);
    // mound on top of the bottom sand
    r(6, 22, 5, 1, PAL.sand);
    p(7, 21, PAL.sandHi);
    // neck
    r(7, 13, 3, 4, PAL.glass);
    r(8, 13, 1, 4, PAL.sand);
    // brass caps
    r(2, 0, 13, 1, PAL.brassMid);
    r(2, 29, 13, 1, PAL.brassMid);
    // falling grains on hover
    if (grain) for (const y of [[17, 19], [18, 20], [17, 21], [19, 20]][grain - 1]) p(8, y, PAL.sandHi);
  });
}
export const hourglass = { w: 16, h: 30, frames: [hourglassFrame(0), hourglassFrame(1), hourglassFrame(2), hourglassFrame(3), hourglassFrame(4)] };

// ---------- potted plant ----------
function plantFrame(sway, droop) {
  return canvasOf(26, 36, ({ p, r, ellipse }) => {
    const leaf = (x, y, rx, ry, dark) => {
      ellipse(x, y, rx, ry, dark ? PAL.leafDk : PAL.leaf);
      ellipse(x - 1, y - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), dark ? PAL.leaf : PAL.leafMid);
      p(x - 1, y - 1, PAL.leafHi);
    };
    const d = droop ? 3 : 0;
    // stems
    r(12, 12 + d, 1, 13 - d, PAL.stem);
    p(10, 18, PAL.stem); p(9, 17, PAL.stem); p(15, 16, PAL.stem); p(16, 15, PAL.stem);
    // leaves (back to front)
    leaf(6 + sway, 15 + d * 1.3, 4, 3, true);
    leaf(19 + sway, 13 + d * 1.3, 4, 3, true);
    leaf(9 - sway, 8 + d, 4, 3, false);
    leaf(16 - sway, 6 + d, 4, 3, false);
    leaf(12 + sway, 3 + d, 3, 3, false);
    leaf(4 - sway, 20 + d, 3, 2, false);
    leaf(21 - sway, 19 + d, 3, 2, false);
    // pot
    r(5, 24, 16, 2, PAL.potHi);
    r(5, 25, 16, 1, PAL.pot);
    for (let y = 26; y <= 34; y++) {
      const inset = Math.round((y - 26) / 4);
      r(6 + inset, y, 14 - inset * 2, 1, PAL.pot);
      p(6 + inset, y, PAL.potHi);
      p(19 - inset, y, PAL.potLo);
    }
    r(7, 23, 12, 1, PAL.soil);
  });
}
export const plant = { w: 26, h: 36, frames: [plantFrame(0, false), plantFrame(1, false), plantFrame(0, false), plantFrame(-1, false)], droop: plantFrame(0, true) };

// ---------- deck of cards, original back pattern ----------
function deckFrame(lift) {
  return canvasOf(22, 14, ({ p, r }) => {
    // card edges (the stack)
    r(1, 7, 20, 6, PAL.edge);
    for (let y = 8; y < 13; y += 1) r(1, y, 20, 1, y % 2 ? PAL.edge : PAL.edgeLo);
    r(1, 12, 20, 1, PAL.edgeLo);
    r(0, 7, 1, 6, PAL.edgeLo);
    // the top card's back, seen at a shallow angle
    const top = 1 - lift;
    const dx = lift ? 1 : 0;
    r(1 + dx, top, 20, 6, PAL.card);
    r(1 + dx, top + 5, 20, 1, PAL.cardLo);
    for (let x = 3; x < 20; x += 4) {
      p(x + dx, top + 2, PAL.cardLine);
      p(x + 1 + dx, top + 1, PAL.cardLine);
      p(x + 1 + dx, top + 3, PAL.cardLine);
      p(x + 2 + dx, top + 2, PAL.cardLine);
    }
    r(1 + dx, top, 20, 1, "#8a2a33");
    if (lift) r(1, 6, 20, 1, PAL.edgeLo);
  });
}
export const deck = { w: 22, h: 14, frames: [deckFrame(0), deckFrame(1), deckFrame(2), deckFrame(1)] };

// ---------- crash-landed paper airplane ----------
export const plane = {
  w: 32, h: 14,
  frames: [canvasOf(32, 14, ({ p, r }) => {
    // body: tail high on the right, nose crumpled into the floor on the left
    for (let x = 4; x <= 30; x++) {
      const t = (x - 4) / 26;
      const yTop = Math.round(9 - t * 8);
      const yMid = Math.round(11 - t * 5);
      r(x, yTop, 1, Math.max(1, yMid - yTop), PAL.plane);
      r(x, yMid, 1, 2, PAL.planeMid);
      p(x, yMid + 2, PAL.planeLo);
    }
    // centre fold
    for (let x = 6; x <= 29; x += 1) p(x, Math.round(10 - ((x - 4) / 26) * 6.5), PAL.planeLo);
    // near wing, lit
    for (let x = 12; x <= 28; x++) r(x, Math.round(4 - ((x - 12) / 16) * 3), 1, 2, PAL.plane);
    // crumpled nose
    r(1, 10, 4, 3, PAL.planeMid);
    p(2, 9, PAL.plane); p(0, 12, PAL.planeLo); p(4, 13, PAL.planeDk); p(3, 11, PAL.planeDk);
    r(1, 13, 6, 1, "rgba(0,0,0,0.25)");
  })],
};
