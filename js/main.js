import { loadLibrary, normalizeRec } from "./data.js";
import { IMG, EYE, PERSPECTIVE, CASE, BAYS, BOOK_K, GENRE_ALIASES, OBJECTS, TITLE } from "./layout.js";
import { ESTATE_URL, SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { makeSpineCanvas, SPINE_FONT_LOADS } from "./spines.js";

const SHOW_OBJECTS = true;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canHover = matchMedia("(hover: hover)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => {
  if (!d) return "";
  const [y, m] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const COVER_RATIO = 0.66;
const LIFT = 52; // headroom above each bay so a pulled book isn't clipped
const GAP = 1.5;

const state = { bays: [], zoom: null, detail: null, unsorted: [], books: [], recs: [], byYear: false, lightsOff: false, waterings: 0, tsundokuFound: false };

// ---------- sorting books into bays ----------
function genreKey(g) {
  const k = String(g || "").trim().toLowerCase();
  return (GENRE_ALIASES[k] || String(g || "").trim()).toLowerCase();
}

function assignBooks(books, recs) {
  state.bays = BAYS.map((b) => ({ ...b, home: b.genre, books: [] }));
  const byGenre = new Map(state.bays.map((b) => [b.genre.toLowerCase(), b]));
  state.unsorted = [];
  for (const book of books) {
    if (book.status === "unfinished") continue;
    const bay = byGenre.get(genreKey(book.genre));
    if (bay && bay.genre !== "Recommended") bay.books.push(book);
    else state.unsorted.push(book);
  }
  const recBay = byGenre.get("recommended");
  if (recBay) recBay.books = recs;
  if (state.unsorted.length) {
    console.warn("Books whose genre has no bay:", state.unsorted.map((b) => `${b.title} (${b.genre})`));
  }
}

// ---------- one book ----------
const CLOTHS = ["cloth-black", "cloth-linen", "cloth-weave"];
function spineFaces(b) {
  const spine = el("span", `spine fin-${b.finish}`);
  spine.append(makeSpineCanvas(b), el("span", "light"));
  return spine;
}

function applyBookVars(node, b, k) {
  const s = node.style;
  s.setProperty("--k", k);
  s.setProperty("--bw", `${b.width * k}px`);
  s.setProperty("--bh", `${b.height * k}px`);
  s.setProperty("--bd", `${Math.round(b.height * COVER_RATIO * k)}px`);
  s.setProperty("--spine", b.spine);
  if (b.band) s.setProperty("--band", b.band);
  s.setProperty("--ink", b.ink);
  s.setProperty("--wear", b.wear);
  s.setProperty("--lean", `${b.lean}deg`);
  s.setProperty("--dz", `${(b.depth || 0) * 0.6}px`);
  s.setProperty("--fs", clamp(b.width * 0.46, 8, 15));
}

// A book lying on its side: the same spine as a standing book (colour, material, lettering),
// turned so the title reads left to right, with the page block's edge showing behind it.
function lyingBook(b, k) {
  const len = b.height * k, thick = Math.max(8, b.width * k);
  const box = el("span", "lbook");
  box.style.width = `${len}px`;
  box.style.height = `${thick}px`;
  box.append(makeSpineCanvas(b, true), el("span", "lbook-light"));
  box._book = b;
  return box;
}

function bookEl(b, bay, index) {
  const btn = el("button", "book");
  btn.type = "button";
  btn._book = b;
  btn.style.setProperty("--i", index);
  btn.setAttribute("aria-label", `${b.title} by ${b.author}`);
  applyBookVars(btn, b, BOOK_K);
  const body = el("span", "b3d");
  body.append(spineFaces(b), el("span", "pages" + (b.binding === "hardcover" ? " hard" : "")));
  // the front cover only exists once someone reaches for the book: 100+ hidden covers cost a lot
  const addFront = () => {
    if (body.querySelector(".front")) return;
    const front = el("span", "front");
    if (b.cover) front.style.backgroundImage = `url("${b.cover}")`;
    else {
      front.classList.add("plain");
      front.append(el("span", "front-title", b.title));
    }
    front.append(el("span", "front-shade"));
    body.insertBefore(front, body.children[1]);
  };
  btn.addEventListener("pointerenter", addFront);
  btn.addEventListener("focus", addFront);
  if (b.status === "reading") body.append(el("span", "ribbon"));
  if (b.kind === "rec" && b.recommender) body.append(el("span", "tag-thread"), el("span", "tag", b.recommender));
  btn.append(body);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.dataset.dragged === "1") return;
    hideCard();
    // on touch screens, a tap in the overview zooms the bay first: books are too small to aim at
    if (!canHover && state.zoom !== bay) return openZoom(bay);
    openDetail(btn, b, bay.books, index);
  });
  if (canHover) {
    btn.addEventListener("pointerenter", () => showBookCard(btn, b));
    btn.addEventListener("pointerleave", hideCard);
  }
  btn.addEventListener("focus", () => { if (canHover && btn.matches(":focus-visible")) showBookCard(btn, b); });
  btn.addEventListener("blur", hideCard);
  return btn;
}

// ---------- hover card ----------
let cardTimer = 0;
// Hover cards: a small, plain card just above whatever is pointed at.
function placeCard(anchor) {
  const card = $("hoverCard");
  cardTimer = setTimeout(() => {
    const r = anchor.getBoundingClientRect();
    card.classList.add("on");
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const left = clamp(r.left + r.width / 2 - cw / 2, 10, innerWidth - cw - 10);
    let top = r.top - ch - 10;
    if (top < 10) top = r.bottom + 10;
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }, 70);
}
function fillCard(kind, lines) {
  clearTimeout(cardTimer);
  const card = $("hoverCard");
  card.className = `hover-card ${kind}${card.classList.contains("on") ? " on" : ""}`;
  card.replaceChildren(...lines.filter(Boolean).map(([cls, text]) => el("p", cls, text)));
}
function showBookCard(anchor, b) {
  let meta = "";
  if (b.kind === "rec") meta = `Recommended by ${b.recommender}`;
  else if (b.status === "reading") meta = "Reading it now";
  else if (b.finished) meta = `Finished ${fmtDate(b.finished)}`;
  const facts = [b.year, b.kind === "rec" ? null : b.binding].filter(Boolean).join(" · ");
  fillCard("book-card", [
    ["hc-title", b.title],
    b.author ? ["hc-author", b.author] : null,
    facts ? ["hc-facts", facts] : null,
    meta ? ["hc-meta", meta + (b.rating ? `  ${"★".repeat(b.rating)}` : "")] : null,
  ]);
  placeCard(anchor);
}
function showBayCard(anchor, bay) {
  if (state.zoom) return;
  const n = bay.books.length;
  fillCard("bay-card", [["hc-title", bay.genre], ["hc-facts", `${n} ${n === 1 ? "book" : "books"}`]]);
  placeCard(bay.plateEl || anchor);
}
function hideCard() {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => $("hoverCard").classList.remove("on"), 60);
}

// ---------- brass plates ----------
// The plate is a real photo; the name is set in its band, shrunk to fit long names.
function engrave(text, room) {
  const span = el("span", "engraved", text);
  const fs = Math.min(12, room / (text.length * 0.78 + 1));
  span.style.fontSize = `${fs}px`;
  return span;
}

// ---------- the room ----------
function buildRoom() {
  const layer = $("bays");
  layer.innerHTML = "";
  for (const bay of state.bays) {
    const box = el("div", `bay ${bay.lit ? "lit" : "unlit"}`);
    box.style.left = `${bay.x}px`;
    box.style.top = `${bay.top - LIFT}px`;
    box.style.width = `${bay.w}px`;
    box.style.height = `${bay.base - bay.top + LIFT}px`;
    const scroller = el("div", "bay-scroll");
    const row = el("div", "bay-row");
    scroller.append(row);
    box.append(scroller);
    // the box reaches up into the shelf above (headroom for a pulled book); only the bay's own
    // opening responds to hover and clicks, so the shelf above never shows this bay's card
    const hit = el("div", "bay-hit");
    hit.style.top = `${LIFT}px`;
    hit.style.height = `${bay.base - bay.top}px`;
    box.prepend(hit); // under the books, so a book (or the pile) always wins the pointer
    hit.addEventListener("click", () => { if (!state.zoom) openZoom(bay); });
    if (canHover) {
      hit.addEventListener("pointerenter", () => showBayCard(hit, bay));
      hit.addEventListener("pointerleave", hideCard);
    }
    // zoomed in, the back panel becomes the centre arch's wood, warmed by the lamp's halo
    const back = el("div", "zoom-back");
    back.style.top = `${LIFT}px`;
    back.style.height = `${bay.base - bay.top}px`;
    box.prepend(back);
    bay.el = box;
    bay.scroller = scroller;
    bay.row = row;
    layer.append(box);

    const plate = el("button", "plate");
    plate.append(engrave(bay.genre, 132), el("span", "plate-hit"));
    plate.type = "button";
    plate.style.left = `${bay.x + bay.w / 2}px`;
    plate.style.top = `${bay.board}px`;
    plate.setAttribute("aria-label", `${bay.genre}: look closer`);
    plate.addEventListener("click", () => openZoom(bay));
    if (canHover) {
      plate.addEventListener("pointerenter", () => showBayCard(box, bay));
      plate.addEventListener("pointerleave", hideCard);
    }
    bay.plateEl = plate;
    layer.append(plate);

    fillBay(bay, false);
  }
}

function fillBay(bay, all) {
  const row = bay.row;
  row.innerHTML = "";
  const room = bay.w - 16 - (bay.reserve || 0);
  const widths = bay.books.map((b) => b.width * BOOK_K + GAP);
  const total = widths.reduce((a, x) => a + x, 0);
  let fit = bay.books.length;
  const stackW = Math.round(254 * BOOK_K * 0.95) + 10;
  if (!all && total > room) {
    let used = 0;
    fit = 0;
    for (const w of widths) {
      if (used + w > room - stackW) break;
      used += w;
      fit++;
    }
  }
  bay.books.slice(0, fit).forEach((b, j) => row.append(bookEl(b, bay, j)));
  const hidden = bay.books.length - fit;
  if (hidden > 0) {
    const stack = el("button", "stack");
    stack.type = "button";
    stack.setAttribute("aria-label", `${hidden} more ${bay.genre} books`);
    stack.style.width = `${stackW}px`;
    bay.books.slice(fit, fit + 4).forEach((b, j) => {
      const lying = lyingBook(b, BOOK_K * 0.94);
      const r = seeded(b.id + "stack");
      lying.style.marginRight = `${Math.round((r() - 0.3) * 10)}px`;
      stack.append(lying);
    });
    stack.addEventListener("click", (e) => { e.stopPropagation(); openZoom(bay); });
    if (canHover) {
      stack.addEventListener("pointerenter", (e) => { e.stopPropagation(); labelFor(stack.querySelector(".lbook") || stack, `+${hidden} more on this shelf`); });
      stack.addEventListener("pointerleave", hideCard);
    }
    row.append(stack);
  }
  row.style.paddingRight = bay.reserve ? `${bay.reserve + 8}px` : "";
  row.style.width = all ? `${Math.max(total + 16 + (bay.reserve || 0), bayWindow(bay).w - 2 * (bay.zpad || 0))}px` : "";
  bay.scroller.scrollLeft = 0;
  syncPerspective(bay);
}

function syncPerspective(bay) {
  const s = bay.scroller;
  s.style.perspective = `${PERSPECTIVE}px`;
  if (state.zoom === bay) {
    // the close-up photo is taken straight on from mid-height, so the books are seen the same way:
    // tops just visible, no sideways lean into the side walls
    s.style.perspectiveOrigin = `${s.clientWidth / 2 + s.scrollLeft}px ${LIFT + (bay.base - bay.top) * 0.42}px`;
  } else {
    s.style.perspectiveOrigin = `${EYE.x - bayWindow(bay).x + s.scrollLeft}px ${EYE.y - (bay.top - LIFT)}px`;
  }
  if (state.zoom === bay) {
    const max = s.scrollWidth - s.clientWidth;
    bay.el.classList.toggle("fade-l", s.scrollLeft > 4);
    bay.el.classList.toggle("fade-r", s.scrollLeft < max - 4);
  }
}

// ---------- camera ----------
function overviewTransform() {
  const vw = innerWidth, vh = innerHeight;
  const viewH = CASE.floor - CASE.y0 + 20;
  if (vw >= vh) {
    // case centred, equal wall either side; the right-hand strip carries the title
    const s = Math.min(vw / (CASE.x1 - CASE.x0 + 80), vh / viewH);
    const tx = vw / 2 - ((CASE.x0 + CASE.x1) / 2) * s;
    let ty = vh - CASE.floor * s;
    if (vh / s > viewH) ty = vh / 2 - ((CASE.y0 + CASE.floor) / 2) * s;
    if (IMG.h * s >= vh) ty = clamp(ty, vh - IMG.h * s, 0);
    return { s, tx, ty };
  }
  const caseW = CASE.x1 - CASE.x0 + 80;
  const s = Math.min(vw / caseW, vh / viewH);
  let tx = vw / 2 - ((CASE.x0 + CASE.x1) / 2) * s;
  let ty = vh / 2 - ((CASE.y0 + CASE.floor) / 2) * s;
  return { s, tx, ty };
}

// Zoom so the shelf is tall enough for books to be easy to pick, even on a phone.
// If that makes the bay wider than the screen, only a window of it is shown and the books scroll.
function zoomTransform(bay) {
  const vw = innerWidth, vh = innerHeight;
  const head = 100;
  const h = bay.base - bay.top + LIFT;
  // the close-up's whole frame (see SHELF_BACK) should fit on screen below the header
  const k = (bay.base - bay.top) / (SHELF_BACK.stand - SHELF_BACK.top);
  const fy0 = bay.top - (SHELF_BACK.top - SHELF_BACK.y0) * k, fH = (SHELF_BACK.y1 - SHELF_BACK.y0) * k;
  const fit = Math.min((vw * 0.94) / (bay.w * 1.08), (vh - head - 56) / fH);
  const byHeight = ((vh - head) * 0.62) / h;
  const s = Math.min(Math.max(fit, Math.min(byHeight, 2.4)), 3);
  const tx = vw / 2 - (bay.x + bay.w / 2) * s;
  const ty = head + (vh - head) / 2 - (fy0 + fH / 2) * s;
  return { s, tx, ty };
}

// The visible part of a bay while zoomed: the whole bay, or a centered window on narrow screens.
function bayWindow(bay) {
  if (state.zoom !== bay) return { x: bay.x, w: bay.w };
  const s = zoomTransform(bay).s;
  const w = Math.min(bay.w, (innerWidth * 0.94) / s);
  return { x: bay.x + (bay.w - w) / 2, w };
}

function sizeBayBox(bay) {
  const win = bayWindow(bay);
  bay.el.style.left = `${win.x}px`;
  bay.el.style.width = `${win.w}px`;
}

// The full-case view shows the photo at well under half size; browsers shrink large images
// poorly (patterns like the rug shimmer), so a pre-shrunk copy is used there.
let photoRes = "full";
function pickPhotoRes(s) {
  const want = s * (devicePixelRatio || 1) < 0.42 ? "half" : "full";
  if (want === photoRes) return;
  photoRes = want;
  const suffix = want === "half" ? "-half" : "";
  for (const [id, name] of [["photo", state.lightsOff ? "room-off" : "room"], ["extWall", "room-wall"], ["extFloor", "room-floor"]]) {
    const img = $(id), src = `assets/${name}${suffix}.jpg`;
    const pre = new Image();
    pre.onload = () => { if (photoRes === want) img.src = src; };
    pre.src = src;
  }
}

// The room is laid out at the camera's scale with CSS zoom, so books, plates and lettering are
// drawn at the screen's real resolution instead of being shrunk from a 2912px canvas.
// While the camera moves, a transform carries the motion; when it stops, zoom takes over again.
let camTimer = 0;
function setCamera(stage, t, zoom) {
  const f = t.s / zoom;
  stage.style.zoom = zoom;
  stage.style.transform = `translate(${t.tx / zoom}px, ${t.ty / zoom}px) scale(${f})`;
}
function applyCamera(t, instant = false, ms = 0) {
  const stage = $("stage");
  clearTimeout(camTimer);
  const from = state.cam;
  state.cam = t;
  if (instant || !from) {
    stage.style.transition = "none";
    setCamera(stage, t, t.s);
    void stage.offsetWidth;
  } else {
    // re-express the current view at the target zoom without moving, then glide
    // while moving, the browser keeps the room as one ready-made picture instead of redrawing every
    // book at each step; it redraws once, crisp, when the camera stops
    stage.style.willChange = "transform";
    document.body.classList.add("cam-moving");
    stage.style.transition = "none";
    setCamera(stage, from, t.s);
    void stage.offsetWidth;
    const dur = ms || 950;
    stage.style.transition = `transform ${dur}ms ${ms ? "cubic-bezier(0.55, 0, 0.2, 1)" : "cubic-bezier(0.65, 0, 0.25, 1)"}`;
    setCamera(stage, t, t.s);
    camTimer = setTimeout(() => {
      stage.style.transition = "none";
      stage.style.willChange = "";
      document.body.classList.remove("cam-moving");
    }, dur + 30);
  }
  pickPhotoRes(t.s);
  if (!state.zoom) placeExtensions(t);
  // overview: plates grow so their lettering is never under ~11px on screen; true size when zoomed
  $("bays").style.setProperty("--ps", state.zoom ? 1 : Math.max(1, Math.min(1.7, 11 / (12 * t.s))));
}

// On tall screens the room continues above and below the photo: real wall and floor
// (assets/room-wall.jpg, room-floor.jpg) inside the stage, then plain colour past those.
const WALL_UP = 810, FLOOR_DOWN = 814;
function placeExtensions(t) {
  const w = IMG.w * t.s;
  const top = $("extTop"), bot = $("extBottom");
  for (const ext of [top, bot]) {
    ext.style.left = `${t.tx}px`;
    ext.style.width = `${w}px`;
  }
  const vh = innerHeight;
  top.style.top = `${t.ty - WALL_UP * t.s - vh}px`;
  top.style.height = `${vh + 2}px`;
  bot.style.top = `${t.ty + (IMG.h + FLOOR_DOWN) * t.s - 2}px`;
  bot.style.height = `${vh}px`;
}

// Zoomed in, the photo's back panel is softly out of focus, like a close-up lens:
// the books stay sharp, the wood behind them falls back.
function placeDepth(bay) {
  const win = bayWindow(bay);
  Object.assign($("depth").style, {
    left: `${win.x}px`, width: `${win.w}px`,
    top: `${bay.top + 10}px`, height: `${bay.base - bay.top - 14}px`,
  });
}

// Zoomed in, the bay is shown as a close-up photograph of one empty compartment
// (assets/shelf, the same photo carved to two widths). Measured in that photo's pixels:
// frame's inner edges at x = 100 and W - 90, the underside of the shelf above at y = 180,
// books stand at y = 1040, the moulding (where the brass plate goes) is centred on y = 1120,
// and the outer edge of the frame runs from y = 95 to 1170.
const SHELF_BACK = {
  side: { src: "assets/shelf/zoom-side.jpg", w: 2204 },
  mid: { src: "assets/shelf/zoom-mid.jpg", w: 3012 },
  h: 1280, l: 100, r: 90, top: 180, stand: 1040, plate: 1120, y0: 95, y1: 1170,
};
function shelfBackRect(bay) {
  const win = bayWindow(bay);
  const B = SHELF_BACK, v = win.w < 570 ? B.side : B.mid;
  const k = (bay.base - bay.top) / (B.stand - B.top);
  const sx = win.w / (v.w - B.l - B.r);
  const top = bay.top - B.top * k;
  return {
    v, k, left: win.x - B.l * sx, width: v.w * sx, top, height: B.h * k,
    x0: win.x - B.l * sx, x1: win.x + win.w + B.r * sx, y0: top + B.y0 * k, y1: top + B.y1 * k,
    plateY: top + B.plate * k,
  };
}
function placeShelfBack(bay) {
  const r = shelfBackRect(bay);
  const back = $("shelfBack");
  Object.assign(back.style, {
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    backgroundImage: `url("${r.v.src}")`,
  });
  // the brass plate moves down onto the moulding, where it sits in the close-up
  bay.plateEl.style.top = `${r.plateY}px`;
  // books stand clear of the side walls, which recede from the frame toward the back panel
  bay.zpad = Math.round(130 * (r.width / r.v.w));
  bay.el.style.setProperty("--zpad", `${bay.zpad}px`);
}
// both close-ups load quietly once the room is up, so the first zoom doesn't wait for them
function preloadShelfBack() {
  for (const v of [SHELF_BACK.side, SHELF_BACK.mid]) { const i = new Image(); i.src = v.src; }
}

function placeCurtain(bay) {
  const r = shelfBackRect(bay);
  const x0 = r.x0, x1 = r.x1;
  const y0 = r.y0, y1 = r.y1;
  const big = 1400;
  const parts = $("curtain").children;
  const rects = [
    [-big, -big, IMG.w + big * 2, y0 + big],
    [-big, y1, IMG.w + big * 2, big],
    [-big, y0, x0 + big, y1 - y0],
    [x1, y0, IMG.w - x1 + big, y1 - y0],
  ];
  rects.forEach(([x, y, w, h], i) => Object.assign(parts[i].style, {
    left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
  }));
}

// ---------- zoom into a bay ----------
function openZoom(bay) {
  if (state.zoom === bay) return;
  if (state.zoom) closeZoom(true);
  hideCard();
  state.zoom = bay;
  sizeBayBox(bay);
  placeShelfBack(bay);
  fillBay(bay, true);
  bay.el.classList.add("zoomed");
  bay.plateEl.classList.add("current");
  syncPerspective(bay);
  placeCurtain(bay);
  placeDepth(bay);
  $("scene").classList.add("zooming");
  applyCamera(zoomTransform(bay));
  $("zoomPlate").replaceChildren(engrave(bay.genre, 140));
  const n = bay.books.length;
  $("zoomCount").textContent = `${n} ${n === 1 ? "book" : "books"}`;
  $("zoomHead").classList.add("on");
  setTimeout(() => $("zoomBack").focus({ preventScroll: true }), 50);
}

function closeZoom(quick) {
  const bay = state.zoom;
  if (!bay) return;
  state.zoom = null;
  hideCard();
  closeTsundoku(bay);
  sizeBayBox(bay);
  bay.el.classList.remove("zoomed", "fade-l", "fade-r");
  bay.plateEl.style.top = `${bay.board}px`;
  bay.plateEl.classList.remove("current");
  fillBay(bay, false);
  $("zoomHead").classList.remove("on");
  if (!quick) {
    $("scene").classList.remove("zooming");
    applyCamera(overviewTransform());
  }
}

function setupScrolling() {
  $("bays").addEventListener("scroll", (e) => {
    const bay = state.bays.find((b) => b.scroller === e.target);
    if (bay) syncPerspective(bay);
  }, { capture: true, passive: true });

  addEventListener("wheel", (e) => {
    const bay = state.zoom;
    if (!bay) return;
    const s = bay.scroller;
    if (s.scrollWidth <= s.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      s.scrollLeft += e.deltaY / zoomTransform(bay).s;
      e.preventDefault();
    }
  }, { passive: false });

  let drag = null;
  addEventListener("pointerdown", (e) => {
    const bay = state.zoom;
    if (!bay || e.pointerType !== "mouse" || !bay.el.contains(e.target)) return;
    drag = { x: e.clientX, left: bay.scroller.scrollLeft, moved: false, bay };
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    if (drag.moved) {
      const scale = zoomTransform(drag.bay).s;
      drag.bay.scroller.scrollLeft = drag.left - dx / scale;
    }
  });
  addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved) {
      const books = drag.bay.el.querySelectorAll(".book");
      books.forEach((b) => (b.dataset.dragged = "1"));
      setTimeout(() => books.forEach((b) => delete b.dataset.dragged), 0);
    }
    drag = null;
  });

  $("zoomBack").addEventListener("click", () => closeZoom());
  $("curtain").addEventListener("click", () => closeZoom());
}

// ---------- pull a book out ----------
function typesetCover(b) {
  const c = el("div", "typeset");
  c.style.background = b.spine;
  c.style.color = b.ink;
  c.append(el("span", "ts-title", b.title), el("span", "ts-author", b.author));
  return c;
}
function coverFace(b, faceW) {
  const face = el("div", "fcover");
  face.style.width = `${faceW}px`;
  face.style.fontSize = `${faceW * 0.12}px`;
  if (b.cover) {
    const img = el("img");
    img.src = b.cover;
    img.alt = `Cover of ${b.title}`;
    img.onerror = () => { img.remove(); face.append(typesetCover(b)); };
    face.append(img);
  } else {
    face.append(typesetCover(b));
  }
  return face;
}

function layoutTarget(rectH) {
  const narrow = innerWidth < 760;
  const coverH = narrow ? Math.min(innerHeight * 0.36, 300) : Math.min(innerHeight * 0.64, 500);
  const coverW = coverH * COVER_RATIO;
  const scale = coverH / rectH;
  if (narrow) return { scale, x: (innerWidth - coverW) / 2, y: 22 + coverH / 2, narrow, coverH, coverW };
  const panelW = Math.min(440, innerWidth * 0.4);
  const startX = (innerWidth - (coverW + 48 + panelW)) / 2;
  return { scale, x: startX, y: innerHeight / 2, narrow, coverH, coverW, panelW };
}

function openDetail(btn, b, list, index, keepSource = false) {
  const rect = btn.getBoundingClientRect();
  const fly = $("fly");
  fly.innerHTML = "";
  fly.className = "fly";
  fly.style.transition = "none";
  Object.assign(fly.style, {
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: "none",
  });
  applyBookVars(fly, b, rect.height / b.height);
  fly.append(spineFaces(b), coverFace(b, rect.height * COVER_RATIO));

  const t = layoutTarget(rect.height);
  const final = `translate(${t.x - rect.right}px, ${t.y - (rect.top + rect.height / 2)}px) scale(${t.scale}) rotateY(-90deg)`;
  state.detail = { btn, b, list, index, swapped: false, rectH: rect.height };
  if (!keepSource) btn.classList.add("away");
  else state.detail.swapped = true; // fades out on close instead of flying back into an object
  renderPanel(b, list, index, t);

  const detail = $("detail");
  detail.classList.add("on");
  detail.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fly.style.transition = "";
    fly.style.transform = final;
    detail.classList.add("out");
  }));
}

function renderPanel(b, list, index, t) {
  const panel = $("panel");
  panel.innerHTML = "";
  panel.classList.toggle("narrow", t.narrow);
  if (t.narrow) {
    panel.style.left = "";
    panel.style.width = "";
    panel.style.top = `${22 + t.coverH + 22}px`;
  } else {
    panel.style.top = "";
    panel.style.left = `${t.x + t.coverW + 48}px`;
    panel.style.width = `${t.panelW}px`;
  }

  let label = "";
  if (b.kind === "rec") label = `Recommended by ${b.recommender}`;
  else if (b.status === "reading") label = "Currently reading";
  else if (b.status === "unfinished") label = "Tsundoku · still in the pile";
  else if (b.finished) label = `Finished ${fmtDate(b.finished)}`;
  if (label) panel.append(el("p", "p-label", label));
  panel.append(el("h2", "p-title", b.title));
  panel.append(el("p", "p-author", b.author));
  const meta = [b.year, b.kind === "book" ? b.genre : null, b.pages ? `${b.pages} pages` : null].filter(Boolean);
  if (meta.length) panel.append(el("p", "p-meta", meta.join("  ·  ")));

  if (b.kind === "book") {
    const stars = el("p", "p-stars");
    if (b.rating) {
      stars.textContent = "★".repeat(b.rating) + "☆".repeat(5 - b.rating);
      stars.setAttribute("aria-label", `${b.rating} out of 5`);
    } else {
      stars.textContent = "Unrated";
      stars.classList.add("unrated");
    }
    panel.append(stars);
  }
  if (b.thoughts) {
    panel.append(el("p", "p-sub", b.kind === "rec" ? "Why I should read it" : "My take"));
    panel.append(el("blockquote", "p-thoughts", b.thoughts));
  }
  if (b.blurb) {
    panel.append(el("p", "p-sub", "About"));
    panel.append(el("p", "p-blurb", b.blurb));
  }
  if (b.themes && b.themes.length) {
    const chips = el("p", "p-themes");
    b.themes.forEach((th) => chips.append(el("span", "chip", th)));
    panel.append(chips);
  }
  const nav = el("div", "p-nav");
  const prev = el("button", "p-btn", "← Previous");
  const next = el("button", "p-btn", "Next →");
  const shelve = el("a", "p-btn shelve", "Find it on Goodreads");
  const gq = [b.title, b.author].filter(Boolean).join(" ");
  shelve.href = `https://www.goodreads.com/search?q=${encodeURIComponent(b.isbn || gq)}`;
  shelve.target = "_blank";
  shelve.rel = "noopener";
  prev.disabled = index <= 0;
  next.disabled = index >= list.length - 1;
  prev.addEventListener("click", () => swapDetail(-1));
  next.addEventListener("click", () => swapDetail(1));
  nav.append(prev, next, shelve);
  panel.append(nav);
  panel.scrollTop = 0;
  setTimeout(() => shelve.focus({ preventScroll: true }), 300);
}

function swapDetail(dir) {
  const d = state.detail;
  if (!d) return;
  const ni = d.index + dir;
  if (ni < 0 || ni >= d.list.length) return;
  const nb = d.list[ni];
  const fly = $("fly");
  const old = fly.querySelector(".fcover");
  old.replaceWith(coverFace(nb, parseFloat(old.style.width)));
  Object.assign(d, { b: nb, index: ni, swapped: true });
  renderPanel(nb, d.list, ni, layoutTarget(d.rectH));
}

function closeDetail() {
  const d = state.detail;
  if (!d) return;
  state.detail = null;
  const detail = $("detail");
  const fly = $("fly");
  detail.classList.remove("out");
  if (d.swapped || reduceMotion) fly.classList.add("fade");
  else fly.style.transform = "none";
  setTimeout(() => {
    detail.classList.remove("on");
    detail.setAttribute("aria-hidden", "true");
    d.btn.classList.remove("away");
    fly.innerHTML = "";
    d.btn.focus({ preventScroll: true });
  }, 640);
}


// Landscape: stacked down the wall to the right of the case. Portrait: across the wall above it.
function placeTitle() {
  const t = $("wallTitle");
  const side = innerWidth >= innerHeight;
  t.classList.toggle("side", side);
  t.classList.toggle("top", !side);
  const box = { ...(side ? TITLE.side : TITLE.top) };
  if (side) {
    // fit the stacked title into whatever wall shows to the right of the case
    const o = overviewTransform();
    const right = Math.min(IMG.w, (innerWidth - o.tx) / o.s);
    box.x = CASE.x1 + 16;
    box.w = Math.max(120, right - box.x - 16);
    t.style.setProperty("--title-size", `${Math.min(108, box.w / 4.3)}px`);
  }
  Object.assign(t.style, { left: `${box.x}px`, width: `${box.w}px`, top: `${box.y}px`, height: box.h ? `${box.h}px` : "" });
  const z = box.zone;
  Object.assign($("wallZone").style, { left: `${z.x}px`, top: `${z.y}px`, width: `${z.w}px`, height: `${z.h}px` });
}

// The title shows for a few seconds, then fades; it returns while the wall is hovered (or tapped).
function setupTitle() {
  const t = $("wallTitle"), zone = $("wallZone");
  state.titleFadeAt = performance.now() + 5000;
  setTimeout(() => t.classList.add("faded"), 5000);
  zone.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") t.classList.add("peek"); });
  zone.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") t.classList.remove("peek"); });
  let tapTimer = 0;
  zone.addEventListener("click", () => {
    if (canHover) return;
    t.classList.add("peek");
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => t.classList.remove("peek"), 3000);
  });
}

// ---------- pixel objects ----------
function labelFor(anchor, text) {
  fillCard("label", [["hc-line", text]]);
  placeCard(anchor);
}

// Each object is a photographed cut-out (assets/obj), sized and placed in image pixels.
// Only these objects respond for now; the rest are scenery.
const CLICKABLE = new Set(["glasses", "deck", "hourglass", "book", "plane"]);
// hover line only, no click
const HOVER_ONLY = new Set(["pen"]);

function makeObject(spec, label, onClick) {
  const live = CLICKABLE.has(spec.id) || HOVER_ONLY.has(spec.id);
  if (!CLICKABLE.has(spec.id)) onClick = null;
  const node = el(onClick ? "button" : "div", `obj obj-${spec.id} zone-${spec.zone}${live ? "" : " still"}`);
  if (onClick) node.type = "button";
  const text = () => (typeof label === "function" ? label() : label);
  node.setAttribute("aria-label", text());
  const img = el("img");
  const src = `assets/obj/${spec.img || spec.id}.png`;
  img.src = src;
  img.alt = "";
  img.draggable = false;
  // contact shadow on the surface it stands on, then the object, then a light pass clipped to its shape
  const tint = el("span", "tint");
  tint.style.setProperty("--src", `url("${src}")`);
  node.append(el("span", "contact"), img, tint);
  const w = spec.w, sq = spec.squash || 1, h = spec.h * sq;
  const foot = spec.foot || 1;
  const sink = spec.sink || 0;
  const top = spec.base + sink - h * foot;
  Object.assign(node.style, { left: `${spec.x - w / 2}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  if (spec.sink !== undefined) {
    // everything below the shelf's front edge is hidden behind it
    node.classList.add("on-shelf");
    node.style.setProperty("--hide", `${Math.max(0, top + h - spec.base)}px`);
  }
  node.style.setProperty("--foot", `${(1 - foot) * 100}%`);
  if (spec.rot) node.style.setProperty("--rot", `${spec.rot}deg`);
  if (spec.reflect) {
    const ref = el("img", "reflection");
    ref.src = src;
    ref.alt = "";
    node.insertBefore(ref, img);
  }
  if (!live) return node;
  node.addEventListener("pointerenter", () => {
    if (state.zoom && !node.closest(".bay.zoomed")) return;
    labelFor(node, text());
  });
  node.addEventListener("pointerleave", () => { hideCard(); });
  if (onClick) node.addEventListener("click", (e) => { e.stopPropagation(); hideCard(); onClick(node, e); });
  return node;
}

function buildObjects() {
  const layer = $("objects");
  layer.innerHTML = "";
  const reading = state.books.filter((b) => b.status === "reading");

  layer.append(makeObject(OBJECTS.lamp, () => (state.lightsOff ? "Lights: On" : "Lights: Off"), () => toggleLights()));
  layer.append(makeObject(OBJECTS.glasses, "Put these on to search.", () => openReader()));
  layer.append(makeObject(OBJECTS.hourglass, "If I could save time in a bottle.. ", (node) => flipTime(node)));
  layer.append(makeObject(OBJECTS.book,
    () => (reading.length ? `Currently reading: ${reading.map((b) => b.title).join(" · ")}` : "Currently reading: nothing open right now."),
    (node) => { if (reading.length) openDetail(node, reading[0], reading, 0, true); }));
  layer.append(makeObject(OBJECTS.pen, "The Key to the Estate",
    (node) => {
      if (ESTATE_URL) window.open(ESTATE_URL, "_blank", "noopener");
      else flashLabel(node, "The Estate opens soon.");
    }));
  layer.append(makeObject(OBJECTS.deck, "Pick a card, any card.", (node) => {
    const shelved = shelvedBooks();
    if (!shelved.length) return;
    const i = Math.floor(Math.random() * shelved.length);
    openDetail(node, shelved[i], shelved, i, true);
  }));
  state.planeEl = makeObject(OBJECTS.plane, "Click to send me a book.", (node) => openRecForm(node));
  layer.append(state.planeEl);
  addPlant();
  const glow = $("lampGlow");
  const L = OBJECTS.lamp;
  Object.assign(glow.style, { left: `${L.x - L.w / 2 + L.w * 0.3 - 260}px`, top: `${L.base - L.h + L.h * 0.34 - 170}px` });
}

function shelvedBooks() {
  return state.books.filter((b) => b.status !== "unfinished");
}

function flashLabel(node, text, ms = 2600) {
  labelFor(node, text);
  clearTimeout(flashLabel.t);
  flashLabel.t = setTimeout(hideCard, ms);
}

// the plant lives inside the Self-Help bay so it zooms with it
function addPlant() {
  const sh = state.bays.find((b) => b.home === OBJECTS.plant.bay);
  if (!sh) return;
  const spec = { ...OBJECTS.plant, x: sh.w - OBJECTS.plant.inset, base: sh.base - sh.top + LIFT };
  const node = makeObject(spec, "Looks thirsty.", (n) => waterPlant(n, sh));
  sh.el.append(node);
  state.plantEl = node;
  addCard();
}

// A sticky note tacked flat to the middle of the case's right-hand upright.
function addCard() {
  const C = OBJECTS.card;
  $("objects").querySelector(".rec-note")?.remove();
  const card = el("button", "rec-note");
  card.type = "button";
  card.setAttribute("aria-label", "Recommend a book");
  Object.assign(card.style, { left: `${C.x - C.w / 2}px`, top: `${C.top}px`, width: `${C.w}px`, height: `${C.h}px` });
  const ink = el("span", "rec-note-ink");
  ["Your", "picks!"].forEach((line, i) => ink.append(el("span", `rn rn-${i + 1}`, line)));
  // the lifted lower edge: a deeper shadow there, the paper curving away from the wood
  card.prepend(el("span", "rec-note-gap"));
  card.append(el("span", "rec-note-sheet"), ink, el("span", "rec-note-pin"));
  card.addEventListener("click", (e) => { e.stopPropagation(); hideCard(); if (state.planeEl) openRecForm(state.planeEl); });
  $("objects").append(card);
  // the writing is as large as the note allows: the longest line just fits across it
  const fit = () => {
    ink.style.fontSize = "21px";
    const widest = Math.max(...[...ink.children].map((n) => n.scrollWidth));
    if (widest > ink.clientWidth) ink.style.fontSize = `${(21 * ink.clientWidth / widest).toFixed(1)}px`;
  };
  fit();
  document.fonts.load("700 21px 'Dancing Script'").then(fit, () => {});
}

// =====================================================================
// LAMP: lights off, the books become stars
// =====================================================================
const STAR_COLORS = { "-2": "#86b4ff", "-1": "#bcd4ff", "0": "#f6efe2", "1": "#ffd08c", "2": "#ff8f5e" };

function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

// A real lamp doesn't fade: click, and the room cuts to the lights-off photo.
// (The night sky will live here once it's redesigned.)
function toggleLights() {
  if (state.lightsOff) return lightsOn();
  if (state.zoom) closeZoom();
  hideCard();
  state.lightsOff = true;
  swapPhoto();
  document.body.classList.add("lights-off");
}

function lightsOn() {
  if (!state.lightsOff) return;
  state.lightsOff = false;
  hideCard();
  swapPhoto();
  document.body.classList.remove("lights-off");
}

function swapPhoto() {
  const suffix = photoRes === "half" ? "-half" : "";
  $("photo").src = `assets/${state.lightsOff ? "room-off" : "room"}${suffix}.jpg`;
}

// =====================================================================
// GLASSES: reading mode, the whole library as a plain list
// =====================================================================
function openReader(sort = state.readerSort || "genre") {
  if (sort === "year") sort = "genre";
  state.readerSort = sort;
  const reader = $("reader");
  const panel = reader.querySelector(".reader-sheet");
  panel.innerHTML = "";
  const head = el("div", "reader-head");
  head.append(el("h2", "reader-title", "The fine print"));
  const sorts = el("div", "reader-sorts");
  [["genre", "Genre"], ["rating", "Rating"], ["title", "Title"]].forEach(([k, label]) => {
    const b = el("button", "reader-sort" + (k === sort ? " on" : ""), label);
    b.type = "button";
    b.addEventListener("click", () => {
      state.readerSort = k;
      sorts.querySelectorAll(".reader-sort").forEach((x) => x.classList.toggle("on", x === b));
      renderReaderBody(panel);
    });
    sorts.append(b);
  });
  const close = el("button", "reader-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", closeReader);
  head.append(sorts, close);

  const search = el("input", "reader-search");
  search.type = "search";
  search.placeholder = "Search a title or author";
  search.setAttribute("aria-label", "Search a title or author");
  search.autocomplete = "off";
  search.value = state.readerQuery || "";
  search.addEventListener("input", () => { state.readerQuery = search.value; renderReaderBody(panel); });
  head.append(search);
  panel.append(head, el("div", "reader-body"));
  renderReaderBody(panel);
  reader.classList.add("on");
  reader.setAttribute("aria-hidden", "false");
  setTimeout(() => search.focus({ preventScroll: true }), 250);
}

function renderReaderBody(panel) {
  const sort = state.readerSort || "genre";
  const q = (state.readerQuery || "").trim().toLowerCase();
  const fold = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const books = shelvedBooks().filter((b) => !q || fold(b.title).includes(fold(q)) || fold(b.author).includes(fold(q)));
  const groupKey = { genre: (b) => b.genre, rating: (b) => (b.rating ? "★".repeat(b.rating) : "Unrated"), title: (b) => (b.title[0] || "#").toUpperCase() }[sort];
  const order = {
    genre: (a, b) => a.genre.localeCompare(b.genre) || a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
  }[sort];
  const sorted = [...books].sort(order);
  const body = panel.querySelector(".reader-body");
  body.innerHTML = "";
  let current = null;
  sorted.forEach((b, i) => {
    const g = groupKey(b);
    if (g !== current) { current = g; body.append(el("h3", "reader-group", g)); }
    const row = el("button", "reader-row");
    row.type = "button";
    const left = el("span", "rr-main");
    left.append(el("span", "rr-title", b.title), el("span", "rr-author", b.author));
    const right = el("span", "rr-meta", [b.finished ? fmtDate(b.finished) : b.status === "reading" ? "Reading" : "", b.rating ? "★".repeat(b.rating) : ""].filter(Boolean).join("  ·  "));
    row.append(left, right);
    row.addEventListener("click", () => openDetail(row, b, sorted, i, true));
    body.append(row);
  });
  if (!sorted.length) body.append(el("p", "reader-empty", q ? `Nothing on the shelves matches “${state.readerQuery.trim()}”.` : "No books yet."));
  body.scrollTop = 0;
}
function closeReader() {
  const r = $("reader");
  r.classList.remove("on");
  r.setAttribute("aria-hidden", "true");
}

// =====================================================================
// HOURGLASS: genre shelves <-> year shelves
// =====================================================================
function assignByYear() {
  state.bays = BAYS.map((b) => ({ ...b, home: b.genre, books: [] }));
  const groups = new Map();
  for (const b of shelvedBooks()) {
    const y = b.finished ? b.finished.slice(0, 4) : b.status === "reading" ? String(new Date().getFullYear()) : "Undated";
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(b);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "Undated") - (b === "Undated") || b.localeCompare(a));
  const slots = state.bays.filter((b) => b.home !== "Recommended");
  slots.forEach((slot, i) => {
    if (i < slots.length - 1 || keys.length <= slots.length) {
      const k = keys[i];
      slot.genre = k || "—";
      if (k) slot.books.push(...groups.get(k));
    } else {
      slot.genre = "Earlier";
      keys.slice(i).forEach((k) => slot.books.push(...groups.get(k)));
    }
  });
  const rec = state.bays.find((b) => b.home === "Recommended");
  rec.books = state.recs;
}

function flipTime(node) {
  if (state.flipping) return;
  state.flipping = true;
  if (state.zoom) closeZoom();
  node.classList.toggle("flipped");
  state.byYear = !state.byYear;
  const bays = $("bays");
  bays.classList.add("shuffling");
  setTimeout(() => {
    if (state.byYear) assignByYear();
    else assignBooks(state.books, state.recs);
    buildRoom();
    addPlant();
    bays.classList.remove("shuffling");
    bays.classList.add("settling");
    setTimeout(() => { bays.classList.remove("settling"); state.flipping = false; }, 1400);
  }, 520);
}

// =====================================================================
// PLANT: watering, and on the 6th the tsundoku compartment
// =====================================================================
function waterPlant(node, bay) {
  if (state.watering) return;
  state.watering = true;
  hideCard();
  state.waterings++;
  const host = node.parentElement;
  const can = el("img", "can");
  can.src = "assets/obj/can.png";
  can.alt = "";
  const pl = parseFloat(node.style.left), pt = parseFloat(node.style.top);
  Object.assign(can.style, { left: `${pl - 66}px`, top: `${pt - 40}px` });
  host.append(can);
  for (let i = 0; i < 6; i++) {
    const d = el("span", "drop");
    Object.assign(d.style, { left: `${pl + 4 + i * 4}px`, top: `${pt - 6}px`, animationDelay: `${520 + i * 70}ms` });
    host.append(d);
  }
  setTimeout(() => node.classList.add("bounce"), 760);
  setTimeout(() => {
    node.classList.remove("bounce");
    host.querySelectorAll(".can, .drop").forEach((x) => x.remove());
    state.watering = false;
    if (state.waterings === 6 && !state.tsundokuFound) revealTsundoku(bay);
    else if (state.tsundokuFound && state.waterings > 6) {
      node.classList.add("droop");
      flashLabel(node, "Here's a self help tip: Know when to stop.", 3000);
      setTimeout(() => node.classList.remove("droop"), 2600);
    }
  }, 1500);
}

function revealTsundoku(bay) {
  state.tsundokuFound = true;
  openZoom(bay);
  const pile = state.books.filter((b) => b.status === "unfinished");
  setTimeout(() => {
    const host = bay.el;
    host.classList.add("secret");
    const w = Math.min(bay.w * 0.62, 320), h = (bay.base - bay.top) * 0.86;
    const x = (bay.w - w) / 2 - 30, y = LIFT + (bay.base - bay.top) - h;
    const comp = el("div", "compartment");
    Object.assign(comp.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const recess = el("div", "recess");
    comp.append(recess);

    // the doors are the real back panel of the bay, cut from the photo
    const bgX = -(bay.x + x), bgY = -(bay.top - LIFT + y);
    ["l", "r"].forEach((side) => {
      const door = el("div", `door door-${side}`);
      door.style.backgroundImage = `url("${IMG.src}")`;
      door.style.backgroundSize = `${IMG.w}px ${IMG.h}px`;
      door.style.backgroundPosition = `${bgX - (side === "r" ? w / 2 : 0)}px ${bgY}px`;
      comp.append(door);
    });

    const plate = el("button", "ts-plate");
    plate.type = "button";
    plate.append(el("span", "ts-word", "Tsundoku"), el("span", "ts-kanji", "積ん読"));
    plate.setAttribute("aria-label", "What is tsundoku?");
    plate.addEventListener("click", (e) => { e.stopPropagation(); openNote(); });
    plate.addEventListener("pointerenter", () => labelFor(plate, "What is this?"));
    plate.addEventListener("pointerleave", hideCard);
    recess.append(plate);

    const heap = el("div", "heap");
    recess.append(heap);
    if (!pile.length) heap.append(el("p", "heap-empty", "Nothing piled up. Yet."));
    let stackY = 0;
    // size the pile so it fits under the plate, however many books are in it
    const sumW = pile.reduce((a, b) => a + b.width, 0) || 1;
    const kHeap = Math.min(BOOK_K, (w * 0.7) / 254, (h - 78) / (sumW * 0.9));
    pile.forEach((b, i) => {
      const r = seeded(b.id + "pile");
      const slab = lyingBook(b, kHeap);
      slab.classList.add("slab");
      slab.setAttribute("role", "button");
      slab.tabIndex = 0;
      const len = b.height * kHeap, thick = Math.max(8, b.width * kHeap);
      const tilt = (r() - 0.5) * 5;
      slab.style.left = `${w * 0.06 + r() * Math.max(0, w * 0.84 - len)}px`;
      slab.style.bottom = `${stackY}px`;
      slab.style.setProperty("--rot", `${tilt.toFixed(1)}deg`);
      slab.style.animationDelay = `${700 + i * 160}ms`;
      stackY += thick * 0.86;
      slab.addEventListener("pointerenter", () => { slab.classList.add("lift"); showBookCard(slab, b); });
      slab.addEventListener("pointerleave", () => { slab.classList.remove("lift"); hideCard(); });
      slab.addEventListener("click", (e) => { e.stopPropagation(); hideCard(); openDetail(slab, b, pile, i, true); });
      heap.append(slab);
    });
    host.append(comp);
    requestAnimationFrame(() => requestAnimationFrame(() => comp.classList.add("open")));
  }, 1100);
}

function closeTsundoku(bay) {
  if (!bay.el || !bay.el.classList.contains("secret")) return;
  const comp = bay.el.querySelector(".compartment");
  bay.el.classList.remove("secret");
  if (comp) { comp.classList.remove("open"); setTimeout(() => comp.remove(), 900); }
}

function openNote() {
  const n = $("note");
  n.classList.add("on");
  n.setAttribute("aria-hidden", "false");
}
function closeNote() {
  const n = $("note");
  n.classList.remove("on");
  n.setAttribute("aria-hidden", "true");
}

// =====================================================================
// PAPER PLANE: recommend a book
// =====================================================================
const normTitle = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
let recPick = null, searchTimer = 0, searchCtl = null;

// The arrowhead the folded plane makes when laid flat (matches the 3D plane's flat shape),
// and the full sheet it opens into. Same number of points, so one shape morphs into the other.
function sheetShapes(sheet) {
  const W = sheet.offsetWidth, H = sheet.offsetHeight;
  const half = Math.min(50, ((0.36 * H) / W) * 100), fold = Math.min(50, ((0.12 * H) / W) * 100);
  const L = 50 - half, R = 50 + half, fl = 50 - fold, fr = 50 + fold;
  return {
    arrow: `polygon(50% 0, 50% 0, ${R}% 98%, ${fr}% 95%, 50% 100%, ${fl}% 95%, ${L}% 98%, 50% 0)`,
    rect: `polygon(50% 0, 100% 0, 100% 100%, ${fr}% 100%, 50% 100%, ${fl}% 100%, 0 100%, 0 0)`,
  };
}

function openRecForm(planeNode) {
  if (state.zoom) closeZoom();
  if (state.plane3d && state.plane3d.busy) return;
  hideCard();
  const form = $("recForm");
  const sheet = form.querySelector(".rec-sheet");
  resetRecForm();
  form.classList.add("on");
  form.setAttribute("aria-hidden", "false");
  sheet.scrollTop = 0;
  const shapes = sheetShapes(sheet);
  sheet.style.clipPath = shapes.arrow;
  const reveal = () => {
    form.classList.add("open");
    requestAnimationFrame(() => { sheet.style.clipPath = shapes.rect; });
    setTimeout(() => { sheet.style.clipPath = "none"; $("recSearch").focus({ preventScroll: true }); }, 520);
  };
  if (state.plane3d && !reduceMotion) {
    state.planeActing = true;
    state.plane3d.openTo(sheet.getBoundingClientRect(), () => { state.planeActing = false; reveal(); });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  }
}

function closeRecForm(sent) {
  const form = $("recForm");
  const sheet = form.querySelector(".rec-sheet");
  if (!form.classList.contains("on")) return;
  const shapes = sheetShapes(sheet);
  const rect = sheet.getBoundingClientRect();
  sheet.style.transition = "none";
  sheet.style.clipPath = shapes.rect;
  void sheet.offsetWidth;
  sheet.style.transition = "";
  requestAnimationFrame(() => { sheet.style.clipPath = shapes.arrow; });
  const finish = () => {
    form.classList.remove("on");
    form.setAttribute("aria-hidden", "true");
    sheet.style.clipPath = "";
    sheet.style.transition = "";
  };
  setTimeout(() => {
    // hand over to the 3D plane: the paper vanishes exactly as the plane appears in its place
    sheet.style.transition = "none";
    form.classList.remove("open");
    if (state.plane3d && !reduceMotion) {
      const recBay = state.bays.find((b) => b.home === "Recommended");
      const r = recBay && recBay.el.getBoundingClientRect();
      const target = r ? { x: r.left + r.width * 0.35, y: r.top + r.height * 0.6 } : null;
      state.planeActing = true;
      state.plane3d.foldTo(rect, target, () => {
        state.planeActing = false;
        if (sent) shelveSent(sent);
      }, !!(sent && target));
      setTimeout(finish, 200);
    } else {
      finish();
      if (sent) shelveSent(sent);
    }
  }, 430);
}

// the book they sent slides onto the Recommended shelf straight away
function shelveSent(rec) {
  const bay = state.bays.find((b) => b.home === "Recommended");
  if (!bay || typeof rec !== "object") return;
  const book = normalizeRec({ id: `sent-${Date.now()}`, ...rec });
  state.recs.unshift(book);
  bay.books = state.recs;
  fillBay(bay, false);
  const first = bay.row.querySelector(".book");
  if (first) first.classList.add("arrived");
  if (state.planeEl) setTimeout(() => flashLabel(state.planeEl, "Thank you. It's on the shelf.", 3200), 600);
}

function resetRecForm() {
  recPick = null;
  $("recSearch").value = "";
  $("recResults").innerHTML = "";
  $("recPicked").innerHTML = "";
  $("recFields").hidden = true;
  $("recName").value = "";
  $("recNote").value = "";
  $("recErr").textContent = "";
  $("recSend").disabled = false;
}

function setupRecForm() {
  const input = $("recSearch");
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    $("recErr").textContent = "";
    if (q.length < 2) { $("recResults").innerHTML = ""; return; }
    searchTimer = setTimeout(() => searchBooks(q), 300);
  });
  $("recForm").addEventListener("click", (e) => { if (e.target.id === "recForm") closeRecForm(false); });
  $("recCancel").addEventListener("click", () => closeRecForm(false));
  $("recName").addEventListener("input", () => { $("recErr").textContent = ""; });
  $("recSend").addEventListener("click", sendRec);
}

async function searchBooks(q) {
  if (searchCtl) searchCtl.abort();
  searchCtl = new AbortController();
  const list = $("recResults");
  list.innerHTML = "";
  list.append(el("p", "rec-hint", "Looking…"));
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=key,title,author_name,first_publish_year,cover_i`;
    const res = await fetch(url, { signal: searchCtl.signal });
    const data = await res.json();
    list.innerHTML = "";
    const docs = (data.docs || []).filter((d) => d.title);
    if (!docs.length) { list.append(el("p", "rec-hint", "Nothing found. Try the title and author.")); return; }
    docs.forEach((d) => {
      const row = el("button", "rec-result");
      row.type = "button";
      const img = el("span", "rec-thumb");
      if (d.cover_i) img.style.backgroundImage = `url("https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg")`;
      const txt = el("span", "rec-txt");
      txt.append(el("span", "rec-rt", d.title), el("span", "rec-ra", [d.author_name?.[0], d.first_publish_year].filter(Boolean).join(" · ")));
      row.append(img, txt);
      row.addEventListener("click", () => pickBook(d));
      list.append(row);
    });
  } catch (e) {
    if (e.name !== "AbortError") { list.innerHTML = ""; list.append(el("p", "rec-hint", "Search isn't answering right now. Try again in a moment.")); }
  }
}

function pickBook(d) {
  recPick = {
    title: d.title,
    author: d.author_name?.[0] || "",
    year: d.first_publish_year || null,
    ol_key: d.key || null,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : "",
  };
  $("recResults").innerHTML = "";
  $("recSearch").value = "";
  const picked = $("recPicked");
  picked.innerHTML = "";
  const card = el("div", "rec-card");
  const c = el("span", "rec-cover");
  if (recPick.cover) c.style.backgroundImage = `url("${recPick.cover.replace("-L.jpg", "-M.jpg")}")`;
  const t = el("div", "rec-ctxt");
  t.append(el("span", "rec-rt big", recPick.title), el("span", "rec-ra", [recPick.author, recPick.year].filter(Boolean).join(" · ")));
  card.append(c, t);
  picked.append(card);

  const mine = state.books.find((b) => b.status !== "unfinished" && normTitle(b.title) === normTitle(recPick.title));
  if (mine) {
    $("recFields").hidden = true;
    const have = el("button", "rec-have", "Already on the shelf.");
    have.type = "button";
    have.addEventListener("click", () => {
      const list = shelvedBooks();
      closeRecForm(false);
      setTimeout(() => openDetail(state.planeEl, mine, list, list.indexOf(mine), true), 700);
    });
    picked.append(have);
    return;
  }
  $("recFields").hidden = false;
  setTimeout(() => $("recName").focus({ preventScroll: true }), 50);
}

async function sendRec() {
  const err = $("recErr");
  const name = $("recName").value.trim();
  const note = $("recNote").value.trim();
  if (!recPick) { err.textContent = "Pick a book first."; return; }
  if (!name) { err.textContent = "Add your name so I know who to thank."; $("recName").focus(); return; }
  if (name.length > 60) { err.textContent = "Name is a little long (60 characters max)."; return; }
  if (note.length > 500) { err.textContent = "Keep the note under 500 characters."; return; }
  $("recSend").disabled = true;
  err.textContent = "";
  try {
    // straight into the database, through the same door the site already reads books from
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recommend_book`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({
        p_recommender: name, p_title: recPick.title, p_author: recPick.author || "", p_note: note,
        p_cover: recPick.cover || "", p_year: Number.isInteger(recPick.year) ? recPick.year : null,
        p_ol_key: recPick.ol_key || "", p_website: $("recHp").value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.warn("recommend failed", res.status, data);
      throw new Error(data.error || (res.status === 404 ? "The recommend slot isn't set up yet (404)." : `Couldn't send it (${res.status}${data.message ? ": " + data.message : ""}).`));
    }
    closeRecForm({ ...recPick, recommender: name, note: null });
  } catch (e) {
    err.textContent = e.message && e.message !== "Failed to fetch" ? e.message : "Couldn't send it just now. Try again in a moment.";
    $("recSend").disabled = false;
  }
}

// ---------- the paper plane in 3D (falls back to the photo if WebGL isn't available) ----------
function startPlane3D() {
  if (!state.planeEl) return;
  import("./plane3d.js").then(({ initPlane3D }) => {
    initPlane3D({
      anchor: state.planeEl,
      isHidden: () => !!state.zoom || ($("recForm").classList.contains("on") && !state.planeActing),
      isDark: () => state.lightsOff,
      note: () => {
        const n = $("objects").querySelector(".rec-note");
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 };
      },
      onReady: (api) => {
        const { flyOnce, arriveNow } = api;
        state.plane3d = api;
        document.body.classList.add("plane-3d");
        // it comes in through the window just as the welcome starts to fade
        if (reduceMotion) arriveNow();
        else setTimeout(flyOnce, Math.max(0, (state.titleFadeAt || 0) - performance.now()));
      },
    });
  }).catch((e) => console.warn("3D plane unavailable, using the photo", e));
}

// ---------- keys, resize, boot ----------
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.detail) return closeDetail();
    if ($("note").classList.contains("on")) return closeNote();
    if ($("recForm").classList.contains("on")) return closeRecForm(false);
    if ($("reader").classList.contains("on")) return closeReader();
    if (state.lightsOff) return lightsOn();
  }
  if (state.detail) {
    if (e.key === "Escape") closeDetail();
    else if (e.key === "ArrowLeft") swapDetail(-1);
    else if (e.key === "ArrowRight") swapDetail(1);
    return;
  }
  if (state.zoom) {
    const s = state.zoom.scroller;
    if (e.key === "Escape") closeZoom();
    else if (e.key === "ArrowLeft") s.scrollBy({ left: -240, behavior: "smooth" });
    else if (e.key === "ArrowRight") s.scrollBy({ left: 240, behavior: "smooth" });
  }
});
$("detailDim").addEventListener("click", closeDetail);
$("reader").addEventListener("click", (e) => { if (e.target.id === "reader") closeReader(); });
$("note").addEventListener("click", closeNote);
setupRecForm();

// first-timer hint in the corner
const helpBtn = $("help");
helpBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !helpBtn.classList.contains("open");
  helpBtn.classList.toggle("open", open);
  $("helpNote").classList.toggle("on", open);
  helpBtn.setAttribute("aria-expanded", String(open));
});
addEventListener("click", () => {
  helpBtn.classList.remove("open");
  $("helpNote").classList.remove("on");
  helpBtn.setAttribute("aria-expanded", "false");
});

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.lightsOff) lightsOn();
    if (state.zoom) {
      sizeBayBox(state.zoom);
      placeShelfBack(state.zoom);
      placeCurtain(state.zoom);
      placeDepth(state.zoom);
      syncPerspective(state.zoom);
      applyCamera(zoomTransform(state.zoom));
    } else { placeTitle(); applyCamera(overviewTransform(), true); }
  }, 120);
});

async function boot() {
  const stage = $("stage");
  stage.style.width = `${IMG.w}px`;
  stage.style.height = `${IMG.h}px`;
  placeTitle();
  applyCamera(overviewTransform(), true);
  setupScrolling();
  const photo = $("photo");
  const photoReady = photo.complete ? Promise.resolve() : new Promise((r) => { photo.onload = r; photo.onerror = r; });
  try {
    const fontsReady = Promise.race([
      Promise.all(SPINE_FONT_LOADS.map((f) => document.fonts.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    const [{ books, recs }] = await Promise.all([loadLibrary(), photoReady, fontsReady]);
    assignBooks(books, recs);
    buildRoom();
    const n = books.filter((b) => b.status !== "unfinished").length;
    $("volumes").textContent = `${n} ${n === 1 ? "volume" : "volumes"}`;
    state.books = books;
    state.recs = recs;
    if (SHOW_OBJECTS) buildObjects();
    document.body.classList.add("ready");
    setupTitle();
    startPlane3D();
    setTimeout(preloadShelfBack, 4000);
  } catch (err) {
    console.error(err);
    $("status").textContent = "The library is closed for a moment. Try again shortly.";
    $("status").classList.add("on");
  }
}
boot();
