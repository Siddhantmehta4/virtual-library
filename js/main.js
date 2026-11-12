import { loadLibrary } from "./data.js";

// ---------- small helpers ----------
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

const BASE_H = 256; // tallest possible book, in unscaled px
const COVER_RATIO = 0.66; // cover width / height
const state = { shelves: [], zoomIndex: -1, detail: null };

// ---------- shelves ----------
function buildShelves(books, recs) {
  const byGenre = new Map();
  for (const b of books) {
    if (!byGenre.has(b.genre)) byGenre.set(b.genre, []);
    byGenre.get(b.genre).push(b);
  }
  const shelves = [...byGenre]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, list]) => ({ name, books: list, kind: "genre" }));
  shelves.push({ name: "Recommended to me", books: recs, kind: "rec" });
  return shelves;
}

// ---------- one book ----------
function spineFaces(b, k) {
  const spine = el("span", `spine f-${b.face} fin-${b.finish}`);
  if (b.cover) {
    const strip = el("span", "strip");
    strip.style.backgroundImage = `url("${b.cover}")`;
    spine.append(strip);
  }
  spine.append(el("span", "band top"), el("span", "band bot"));
  const t = el("span", "t" + (b.caps ? " caps" : ""), b.title);
  spine.append(t);
  if (b.width >= 44) {
    spine.classList.add("has-author");
    spine.append(el("span", "a", b.author));
  }
  spine.append(el("span", "sheen"), el("span", "wear"));
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

function bookEl(b, k, list, index) {
  const btn = el("button", "book");
  btn.type = "button";
  btn.setAttribute("aria-label", `${b.title} by ${b.author}`);
  applyBookVars(btn, b, k);
  const body = el("span", "b3d");
  body.append(spineFaces(b, k), el("span", "pages" + (b.binding === "hardcover" ? " hard" : "")));
  if (b.status === "reading") body.append(el("span", "ribbon"));
  if (b.kind === "rec" && b.recommender) body.append(el("span", "tag", b.recommender));
  btn.append(body);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.dataset.dragged === "1") return;
    hideCard();
    openDetail(btn, b, list, index);
  });
  if (canHover) {
    btn.addEventListener("pointerenter", () => showCard(btn, b));
    btn.addEventListener("pointerleave", hideCard);
  }
  btn.addEventListener("focus", () => { if (canHover && btn.matches(":focus-visible")) showCard(btn, b); });
  btn.addEventListener("blur", hideCard);
  return btn;
}

// ---------- hover card ----------
let cardTimer = 0;
function showCard(anchor, b) {
  clearTimeout(cardTimer);
  const card = $("hoverCard");
  card.innerHTML = "";
  const meta = [];
  if (b.kind === "rec") meta.push(`Recommended by ${b.recommender}`);
  else if (b.status === "reading") meta.push("Currently reading");
  else if (b.finished) meta.push(`Finished ${fmtDate(b.finished)}`);
  card.append(el("p", "hc-meta", meta.join("")));
  card.append(el("p", "hc-title", b.title));
  card.append(el("p", "hc-author", b.author));
  const bits = [b.year, b.kind === "book" ? b.genre : null, b.rating ? "★".repeat(b.rating) : null].filter(Boolean);
  if (bits.length) card.append(el("p", "hc-bits", bits.join("  ·  ")));
  cardTimer = setTimeout(() => {
    const r = anchor.getBoundingClientRect();
    card.classList.add("on");
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = clamp(r.left + r.width / 2 - cw / 2, 10, innerWidth - cw - 10);
    let top = r.top - ch - 14;
    if (top < 10) top = r.bottom + 14;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }, 90);
}
function hideCard() {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => $("hoverCard").classList.remove("on"), 60);
}

// ---------- the bookcase (overview) ----------
const FRAME = 16; // side stile width
const LIP = 14; // front edge of each shelf plank

function renderOverview() {
  const caseEl = $("bookcase");
  caseEl.innerHTML = "";
  const shelves = state.shelves;
  const n = shelves.length;
  const caseW = Math.min(1000, innerWidth - 20);
  const innerW = caseW - FRAME * 2;
  const topSpace = innerHeight * 0.16;
  const fitH = (innerHeight * 0.84 - topSpace - 40) / n - LIP - 8;
  const s = clamp(Math.min(innerW / 1450, fitH / BASE_H), 0.22, 0.56);
  const cavH = Math.round(BASE_H * s + 16 + 18 * s);
  const depth = Math.round(170 * s + 30);

  caseEl.style.width = `${caseW}px`;
  caseEl.style.setProperty("--depth", `${depth}px`);

  const top = el("div", "case-top");
  top.style.height = `${Math.round(depth * 0.55)}px`;
  top.append(el("div", "case-top-surface"));
  caseEl.append(top);

  const body = el("div", "case-body");
  caseEl.append(body);

  shelves.forEach((shelf, i) => {
    const sec = el("section", "shelf");
    sec.setAttribute("aria-label", shelf.name);
    sec.style.height = `${cavH + LIP}px`;
    const cavity = el("div", "cavity");
    const stage3d = el("div", "stage3d");
    stage3d.append(el("div", "back"), el("div", "floor-plank"));
    const row = el("div", "row");

    // pack books until the shelf is full, then leave room for a stack
    const gap = 1;
    const widths = shelf.books.map((b) => b.width * s + gap);
    const total = widths.reduce((a, x) => a + x, 0);
    const room = innerW - 16;
    let fit = shelf.books.length;
    const stackW = Math.round(245 * s * 0.92) + 10;
    if (total > room) {
      let used = 0;
      fit = 0;
      for (const w of widths) {
        if (used + w > room - stackW) break;
        used += w;
        fit++;
      }
    }
    shelf.books.slice(0, fit).forEach((b, j) => row.append(bookEl(b, s, shelf.books, j)));
    const hidden = shelf.books.length - fit;
    if (hidden > 0) {
      const stack = el("button", "stack");
      stack.type = "button";
      stack.setAttribute("aria-label", `${hidden} more on this shelf`);
      stack.style.width = `${stackW}px`;
      shelf.books.slice(fit, fit + 3).forEach((b, j) => {
        const lying = el("span", "lying");
        lying.style.width = `${b.height * s * 0.92}px`;
        lying.style.height = `${Math.max(6, b.width * s)}px`;
        lying.style.background = b.spine;
        lying.style.marginRight = `${(j % 2) * 4 * s}px`;
        stack.append(lying);
      });
      stack.addEventListener("click", (e) => { e.stopPropagation(); openZoom(i); });
      row.append(stack);
    }
    if (shelf.books.length === 0) row.append(el("span", "empty-note", shelf.kind === "rec" ? "" : "Empty"));

    stage3d.append(row);
    cavity.append(stage3d);
    sec.append(cavity);

    const lip = el("div", "lip");
    const plate = el("button", "plate");
    plate.type = "button";
    plate.dataset.hint = "Click to look closer";
    plate.append(el("span", "plate-name", shelf.name));
    if (hidden > 0) plate.append(el("span", "plate-more", `+${hidden}`));
    plate.addEventListener("click", (e) => { e.stopPropagation(); openZoom(i); });
    lip.append(plate);
    sec.append(lip);

    sec.addEventListener("click", () => openZoom(i));
    body.append(sec);
  });

  caseEl.append(el("div", "plinth"));

  // one camera for the whole case: eye above and in front, looking slightly down
  requestAnimationFrame(() => {
    const caseRect = caseEl.getBoundingClientRect();
    const eyeY = caseRect.top - innerHeight * 0.38;
    caseEl.querySelectorAll(".cavity, .case-top").forEach((c) => {
      const r = c.getBoundingClientRect();
      c.style.perspectiveOrigin = `50% ${eyeY - r.top}px`;
    });
  });
}

// ---------- zoom into one shelf ----------
function openZoom(i) {
  const shelf = state.shelves[i];
  state.zoomIndex = i;
  hideCard();
  $("room").classList.add("blurred");
  const zoom = $("zoom");
  zoom.classList.add("on");
  zoom.setAttribute("aria-hidden", "false");
  $("zoomPlate").textContent = shelf.name;
  $("zoomCount").textContent = `${shelf.books.length} ${shelf.books.length === 1 ? "book" : "books"}`;
  renderRail();
  $("zoomBack").focus({ preventScroll: true });
}

function closeZoom() {
  if (state.zoomIndex < 0) return;
  state.zoomIndex = -1;
  hideCard();
  $("room").classList.remove("blurred");
  const zoom = $("zoom");
  zoom.classList.remove("on");
  zoom.setAttribute("aria-hidden", "true");
}

function renderRail() {
  const shelf = state.shelves[state.zoomIndex];
  const rail = $("rail");
  const wrap = $("railWrap");
  rail.innerHTML = "";
  const k = clamp((innerHeight * 0.5) / BASE_H, 0.55, 1);
  const cavH = Math.round(BASE_H * k + 70 * k);
  const shelfEl = el("div", "zshelf");
  shelfEl.style.height = `${cavH + 14}px`;
  shelfEl.style.setProperty("--depth", `${Math.round(190 * k)}px`);
  const cavity = el("div", "cavity");
  const stage3d = el("div", "stage3d");
  stage3d.append(el("div", "back"), el("div", "floor-plank"));
  const row = el("div", "row");
  shelf.books.forEach((b, j) => row.append(bookEl(b, k, shelf.books, j)));
  if (!shelf.books.length) {
    row.append(el("span", "empty-note big", shelf.kind === "rec" ? "Nothing here yet." : "Empty shelf."));
  }
  stage3d.append(row);
  cavity.append(stage3d);
  shelfEl.append(cavity, el("div", "lip"));
  rail.append(shelfEl);

  const contentW = shelf.books.reduce((a, b) => a + b.width * k + 2, 0) + 120;
  shelfEl.style.width = `${Math.max(contentW, wrap.clientWidth)}px`;
  wrap.scrollLeft = 0;
  syncRail();
}

function syncRail() {
  const wrap = $("railWrap");
  const cavity = wrap.querySelector(".cavity");
  if (!cavity) return;
  const max = wrap.scrollWidth - wrap.clientWidth;
  wrap.classList.toggle("fade-l", wrap.scrollLeft > 4);
  wrap.classList.toggle("fade-r", wrap.scrollLeft < max - 4);
  cavity.style.perspectiveOrigin = `${wrap.scrollLeft + wrap.clientWidth / 2}px -40%`;
}

function setupRail() {
  const wrap = $("railWrap");
  wrap.addEventListener("scroll", syncRail, { passive: true });
  wrap.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      wrap.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
  let drag = null;
  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: wrap.scrollLeft, moved: false };
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    if (drag.moved) {
      wrap.scrollLeft = drag.left - dx;
      wrap.classList.add("dragging");
    }
  });
  addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    wrap.classList.remove("dragging");
    if (moved) {
      wrap.querySelectorAll(".book").forEach((b) => (b.dataset.dragged = "1"));
      setTimeout(() => wrap.querySelectorAll(".book").forEach((b) => delete b.dataset.dragged), 0);
    }
  });
  $("zoomBack").addEventListener("click", closeZoom);
}

// ---------- pull a book out ----------
function coverFace(b, k, faceW) {
  const face = el("div", "fcover");
  face.style.fontSize = `${faceW * 0.12}px`;
  if (b.cover) {
    const img = el("img");
    img.src = b.cover;
    img.alt = `Cover of ${b.title}`;
    img.decoding = "async";
    img.onerror = () => { img.remove(); face.append(typesetCover(b)); };
    face.append(img);
  } else {
    face.append(typesetCover(b));
  }
  return face;
}
function typesetCover(b) {
  const c = el("div", "typeset");
  c.style.background = b.spine;
  c.style.color = b.ink;
  c.append(el("span", "ts-title", b.title), el("span", "ts-author", b.author));
  return c;
}

function layoutTarget(rect) {
  const narrow = innerWidth < 760;
  const coverH = narrow ? Math.min(innerHeight * 0.36, 300) : Math.min(innerHeight * 0.64, 500);
  const coverW = coverH * COVER_RATIO;
  const scale = coverH / rect.height;
  if (narrow) {
    return { scale, x: (innerWidth - coverW) / 2, y: 22 + coverH / 2, narrow, coverH, coverW };
  }
  const panelW = Math.min(440, innerWidth * 0.4);
  const startX = (innerWidth - (coverW + 48 + panelW)) / 2;
  return { scale, x: startX, y: innerHeight / 2, narrow, coverH, coverW, panelW };
}

function openDetail(btn, b, list, index) {
  const rect = btn.getBoundingClientRect();
  const fly = $("fly");
  fly.innerHTML = "";
  fly.className = "fly";
  fly.style.transition = "none";
  fly.style.left = `${rect.left}px`;
  fly.style.top = `${rect.top}px`;
  fly.style.width = `${rect.width}px`;
  fly.style.height = `${rect.height}px`;
  const k = rect.height / b.height;
  applyBookVars(fly, b, k);
  const faceW = rect.height * COVER_RATIO;
  const face = coverFace(b, k, faceW);
  face.style.width = `${faceW}px`;
  fly.append(spineFaces(b, k), face);
  fly.style.transform = "none";

  const t = layoutTarget(rect);
  const hingeX = rect.right, hingeY = rect.top + rect.height / 2;
  const final = `translate(${t.x - hingeX}px, ${t.y - hingeY}px) scale(${t.scale}) rotateY(-90deg)`;

  state.detail = { btn, b, list, index, final, swapped: false };
  btn.classList.add("away");
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
  const oldFace = fly.querySelector(".fcover");
  const k = parseFloat(fly.style.getPropertyValue("--k")) || 1;
  const face = coverFace(nb, k, parseFloat(oldFace.style.width));
  face.style.width = oldFace.style.width;
  oldFace.replaceWith(face);
  d.b = nb;
  d.index = ni;
  d.swapped = true;
  renderPanel(nb, d.list, ni, layoutTarget({ height: parseFloat(fly.style.height) }));
}

function closeDetail() {
  const d = state.detail;
  if (!d) return;
  state.detail = null;
  const detail = $("detail");
  const fly = $("fly");
  detail.classList.remove("out");
  if (d.swapped || reduceMotion) {
    fly.classList.add("fade");
  } else {
    fly.style.transform = "none";
  }
  setTimeout(() => {
    detail.classList.remove("on");
    detail.setAttribute("aria-hidden", "true");
    d.btn.classList.remove("away");
    fly.innerHTML = "";
    d.btn.focus({ preventScroll: true });
  }, 640);
}

// ---------- keys, resize, boot ----------
addEventListener("keydown", (e) => {
  if (state.detail) {
    if (e.key === "Escape") closeDetail();
    else if (e.key === "ArrowLeft") swapDetail(-1);
    else if (e.key === "ArrowRight") swapDetail(1);
    return;
  }
  if (state.zoomIndex >= 0) {
    if (e.key === "Escape") closeZoom();
    else if (e.key === "ArrowLeft") $("railWrap").scrollBy({ left: -320, behavior: "smooth" });
    else if (e.key === "ArrowRight") $("railWrap").scrollBy({ left: 320, behavior: "smooth" });
  }
});
$("detailDim").addEventListener("click", closeDetail);

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.shelves.length) return;
    renderOverview();
    if (state.zoomIndex >= 0) renderRail();
  }, 150);
});

async function boot() {
  setupRail();
  try {
    const { books, recs } = await loadLibrary();
    state.shelves = buildShelves(books, recs);
    $("status").remove();
    renderOverview();
  } catch (err) {
    console.error(err);
    $("status").textContent = "The library is closed for a moment. Try again shortly.";
  }
}
boot();
