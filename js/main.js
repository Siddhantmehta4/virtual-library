import { loadLibrary } from "./data.js";
import { IMG, EYE, PERSPECTIVE, CASE, BAYS, BOOK_K, GENRE_ALIASES, OBJECTS, TITLE } from "./layout.js";
import { ESTATE_URL } from "./config.js";

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

const state = { bays: [], zoom: null, detail: null, unsorted: [] };

// ---------- sorting books into bays ----------
function genreKey(g) {
  const k = String(g || "").trim().toLowerCase();
  return (GENRE_ALIASES[k] || String(g || "").trim()).toLowerCase();
}

function assignBooks(books, recs) {
  state.bays = BAYS.map((b) => ({ ...b, books: [] }));
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
  const spine = el("span", `spine f-${b.face} fin-${b.finish}`);
  if (b.finish === "cloth") {
    let h = 0;
    for (const c of String(b.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    spine.style.setProperty("--tex", `url("assets/tex/${CLOTHS[h % CLOTHS.length]}.jpg")`);
  }
  if (b.cover) {
    const strip = el("span", "strip");
    strip.style.backgroundImage = `url("${b.cover}")`;
    spine.append(strip);
  }
  spine.append(el("span", "band top"), el("span", "band bot"));
  spine.append(el("span", "t" + (b.caps ? " caps" : ""), b.title));
  if (b.width >= 44) {
    spine.classList.add("has-author");
    spine.append(el("span", "a", b.author));
  }
  spine.append(el("span", "sheen"), el("span", "wear"), el("span", "light"));
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
  s.setProperty("--fs", clamp(b.width * 0.46, 8, 15));
}

function bookEl(b, bay, index) {
  const btn = el("button", "book");
  btn.type = "button";
  btn.setAttribute("aria-label", `${b.title} by ${b.author}`);
  applyBookVars(btn, b, BOOK_K);
  const body = el("span", "b3d");
  const front = el("span", "front");
  if (b.cover) front.style.backgroundImage = `url("${b.cover}")`;
  else {
    front.classList.add("plain");
    front.append(el("span", "front-title", b.title));
  }
  front.append(el("span", "front-shade"));
  body.append(spineFaces(b), front, el("span", "pages" + (b.binding === "hardcover" ? " hard" : "")));
  if (b.status === "reading") body.append(el("span", "ribbon"));
  if (b.kind === "rec" && b.recommender) body.append(el("span", "tag", b.recommender));
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
function placeCard(anchor) {
  const card = $("hoverCard");
  cardTimer = setTimeout(() => {
    const r = anchor.getBoundingClientRect();
    card.classList.add("on");
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const left = clamp(r.left + r.width / 2 - cw / 2, 10, innerWidth - cw - 10);
    let top = r.top - ch - 12;
    if (top < 10) top = r.bottom + 12;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }, 90);
}
function showBookCard(anchor, b) {
  clearTimeout(cardTimer);
  const card = $("hoverCard");
  card.innerHTML = "";
  card.classList.remove("label");
  let meta = "";
  if (b.kind === "rec") meta = `Recommended by ${b.recommender}`;
  else if (b.status === "reading") meta = "Currently reading";
  else if (b.finished) meta = `Finished ${fmtDate(b.finished)}`;
  if (meta) card.append(el("p", "hc-meta", meta));
  card.append(el("p", "hc-title", b.title));
  card.append(el("p", "hc-author", b.author));
  const bits = [b.year, b.rating ? "★".repeat(b.rating) : null].filter(Boolean);
  if (bits.length) card.append(el("p", "hc-bits", bits.join("  ·  ")));
  placeCard(anchor);
}
function showBayCard(anchor, bay) {
  if (state.zoom) return;
  clearTimeout(cardTimer);
  const card = $("hoverCard");
  card.innerHTML = "";
  card.classList.remove("label");
  card.append(el("p", "hc-title", bay.genre));
  const n = bay.books.length;
  card.append(el("p", "hc-bits", `${n} ${n === 1 ? "book" : "books"} · click to look closer`));
  placeCard(anchor);
}
function hideCard() {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => $("hoverCard").classList.remove("on"), 60);
}

// ---------- brass plates ----------
// The plate is a real photo; the name is set in its band, shrunk to fit long names.
function engrave(text, room) {
  const span = el("span", "engraved", text);
  const fs = Math.min(13, room / (text.length * 0.7 + 1));
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
    box.addEventListener("click", () => { if (!state.zoom) openZoom(bay); });
    if (canHover) {
      box.addEventListener("pointerenter", () => showBayCard(box, bay));
      box.addEventListener("pointerleave", hideCard);
    }
    bay.el = box;
    bay.scroller = scroller;
    bay.row = row;
    layer.append(box);

    const plate = el("button", "plate");
    plate.append(engrave(bay.genre, 132));
    plate.type = "button";
    plate.style.left = `${bay.x + bay.w / 2}px`;
    plate.style.top = `${bay.board}px`;
    plate.setAttribute("aria-label", `${bay.genre}: look closer`);
    plate.addEventListener("click", () => openZoom(bay));
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
      const lying = el("span", "lying");
      lying.style.width = `${b.height * BOOK_K * 0.94}px`;
      lying.style.height = `${Math.max(9, b.width * BOOK_K)}px`;
      lying.style.backgroundColor = b.spine;
      lying.style.marginRight = `${(j % 2) * 6}px`;
      stack.append(lying);
    });
    stack.addEventListener("click", (e) => { e.stopPropagation(); openZoom(bay); });
    row.append(stack);
  }
  row.style.paddingRight = bay.reserve ? `${bay.reserve + 8}px` : "";
  row.style.width = all ? `${Math.max(total + 16 + (bay.reserve || 0), bayWindow(bay).w)}px` : "";
  bay.scroller.scrollLeft = 0;
  syncPerspective(bay);
}

function syncPerspective(bay) {
  const s = bay.scroller;
  s.style.perspective = `${PERSPECTIVE}px`;
  s.style.perspectiveOrigin = `${EYE.x - bayWindow(bay).x + s.scrollLeft}px ${EYE.y - (bay.top - LIFT)}px`;
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
    // case on the left, the stretch of wall to its right carries the title
    const left = CASE.x0 - 40;
    const s = Math.min(vw / (IMG.w - left), vh / viewH);
    const tx = vw - IMG.w * s;
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
  const byHeight = ((vh - head) * 0.62) / h;
  const byWidth = (vw * 0.9) / bay.w;
  const s = Math.min(Math.max(byWidth, Math.min(byHeight, 2.4)), 3);
  const tx = vw / 2 - (bay.x + bay.w / 2) * s;
  const ty = head + (vh - head) / 2 - (bay.top - LIFT + h / 2) * s;
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
  const want = s * (devicePixelRatio || 1) < 0.62 ? "half" : "full";
  if (want === photoRes) return;
  photoRes = want;
  const suffix = want === "half" ? "-half" : "";
  for (const [id, name] of [["photo", "room"], ["extWall", "room-wall"], ["extFloor", "room-floor"]]) {
    const img = $(id), src = `assets/${name}${suffix}.jpg`;
    const pre = new Image();
    pre.onload = () => { if (photoRes === want) img.src = src; };
    pre.src = src;
  }
}

function applyCamera(t, instant = false, ms = 0) {
  const stage = $("stage");
  stage.style.transition = instant ? "none" : ms ? `transform ${ms}ms cubic-bezier(0.55, 0, 0.2, 1)` : "";
  stage.style.transform = `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`;
  if (instant) void stage.offsetWidth;
  pickPhotoRes(t.s);
  if (!state.zoom) placeExtensions(t);
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

function placeCurtain(bay) {
  const pad = 10;
  const win = bayWindow(bay);
  const x0 = win.x - pad, x1 = win.x + win.w + pad;
  const y0 = bay.top - pad, y1 = bay.base + 28;
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
  fillBay(bay, true);
  bay.el.classList.add("zoomed");
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
  sizeBayBox(bay);
  bay.el.classList.remove("zoomed", "fade-l", "fade-r");
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
  const shelve = el("button", "p-btn shelve", "Shelve it");
  prev.disabled = index <= 0;
  next.disabled = index >= list.length - 1;
  prev.addEventListener("click", () => swapDetail(-1));
  next.addEventListener("click", () => swapDetail(1));
  shelve.addEventListener("click", closeDetail);
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
  const box = side ? TITLE.side : TITLE.top;
  Object.assign(t.style, { left: `${box.x}px`, width: `${box.w}px`, top: `${box.y}px`, height: box.h ? `${box.h}px` : "" });
  const z = box.zone;
  Object.assign($("wallZone").style, { left: `${z.x}px`, top: `${z.y}px`, width: `${z.w}px`, height: `${z.h}px` });
}

// The title shows for a few seconds, then fades; it returns while the wall is hovered (or tapped).
function setupTitle() {
  const t = $("wallTitle"), zone = $("wallZone");
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
  clearTimeout(cardTimer);
  const card = $("hoverCard");
  card.innerHTML = "";
  card.classList.add("label");
  card.append(el("p", "hc-line", text));
  placeCard(anchor);
}

// Each object is a photographed cut-out (assets/obj), sized and placed in image pixels.
function makeObject(spec, label, onClick) {
  const node = el(onClick ? "button" : "div", `obj obj-${spec.id} zone-${spec.zone}`);
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
  Object.assign(node.style, { left: `${spec.x - w / 2}px`, top: `${spec.base - h * foot}px`, width: `${w}px`, height: `${h}px` });
  node.style.setProperty("--foot", `${(1 - foot) * 100}%`);
  if (spec.reflect) {
    const ref = el("img", "reflection");
    ref.src = src;
    ref.alt = "";
    node.insertBefore(ref, img);
  }
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
  const shelved = state.bays.filter((b) => b.genre !== "Recommended").flatMap((b) => b.books);

  layer.append(makeObject(OBJECTS.lamp, () => (state.lightsOff ? "Lights: On" : "Lights: Off")));
  layer.append(makeObject(OBJECTS.glasses, "For the fine print."));
  layer.append(makeObject(OBJECTS.hourglass, "Time in a bottle."));
  layer.append(makeObject(OBJECTS.book,
    () => (reading.length ? `Currently reading: ${reading.map((b) => b.title).join(" · ")}` : "Currently reading: nothing open right now."),
    (node) => { if (reading.length) openDetail(node, reading[0], reading, 0, true); }));
  layer.append(makeObject(OBJECTS.pen, "The Key to the Estate",
    () => { if (ESTATE_URL) window.open(ESTATE_URL, "_blank", "noopener"); }));
  layer.append(makeObject(OBJECTS.deck, "Pick a card, any card.",
    (node) => {
      if (!shelved.length) return;
      const i = Math.floor(Math.random() * shelved.length);
      openDetail(node, shelved[i], shelved, i, true);
    }));
  layer.append(makeObject(OBJECTS.plane, "Is my shelf missing a gem?"));

  // the plant lives inside the Self-Help bay so it zooms with it
  const sh = state.bays.find((b) => b.genre === OBJECTS.plant.bay);
  if (sh) {
    const spec = { ...OBJECTS.plant, x: sh.w - OBJECTS.plant.inset, base: sh.base - sh.top + LIFT };
    sh.el.append(makeObject(spec, "Looks thirsty."));
  }
  const glow = $("lampGlow");
  // the lamp's light: the shade sits over the left of the image, the bulb about a third of the way down
  const L = OBJECTS.lamp;
  Object.assign(glow.style, { left: `${L.x - L.w / 2 + L.w * 0.3 - 260}px`, top: `${L.base - L.h + L.h * 0.34 - 170}px` });
}

// ---------- keys, resize, boot ----------
addEventListener("keydown", (e) => {
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
    if (state.zoom) {
      sizeBayBox(state.zoom);
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
    const [{ books, recs }] = await Promise.all([loadLibrary(), photoReady]);
    assignBooks(books, recs);
    buildRoom();
    const n = books.filter((b) => b.status !== "unfinished").length;
    $("volumes").textContent = `${n} ${n === 1 ? "volume" : "volumes"}`;
    state.books = books;
    if (SHOW_OBJECTS) buildObjects();
    document.body.classList.add("ready");
    setupTitle();
  } catch (err) {
    console.error(err);
    $("status").textContent = "The library is closed for a moment. Try again shortly.";
    $("status").classList.add("on");
  }
}
boot();
