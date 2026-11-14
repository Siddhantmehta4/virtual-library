import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Spines are widened ~1.6x for the screen so books are easy to point at.
// Proportions are kept, so thin books still look thin next to thick ones.
const spineWidth = (raw) => Math.round(Math.max(24, Math.min(86, (raw || 30) * 1.6)));

function normalizeBook(b) {
  return {
    kind: "book",
    id: b.id,
    title: b.title,
    author: b.author,
    genre: b.genre || "Unsorted",
    status: b.status || "read",
    finished: b.date_finished,
    rating: b.rating || 0,
    thoughts: b.thoughts || "",
    themes: b.themes || [],
    emotion: b.emotion,
    favorite: !!b.favorite,
    recommendedBy: b.recommended_by || "",
    cover: b.cover || "",
    isbn: b.isbn || "",
    year: b.year || null,
    blurb: b.blurb || "",
    pages: b.pages || null,
    binding: b.binding || "paperback",
    finish: b.finish || "matte",
    spine: b.spine || "#584f46",
    band: b.band || "",
    ink: b.ink || "#faf7f0",
    face: b.face || "serif",
    caps: !!b.caps,
    width: spineWidth(b.width),
    height: b.height || 220,
    lean: b.lean || 0,
    depth: b.depth || 0,
    wear: b.wear || 0,
  };
}

export function normalizeRec(r) {
  const h = hash(r.id + r.title);
  return {
    kind: "rec",
    id: r.id,
    title: r.title,
    author: r.author || "",
    genre: "Recommended to me",
    status: "unread",
    recommender: r.recommender,
    thoughts: r.note || "",
    themes: [],
    cover: r.cover || "",
    year: r.year || null,
    blurb: "",
    rating: 0,
    binding: "paperback",
    finish: "matte",
    spine: r.spine || `hsl(${h % 360} 28% 34%)`,
    band: r.band || "",
    ink: r.ink || "#faf7f0",
    face: "serif",
    caps: false,
    width: spineWidth(r.width || 22 + (h % 16)),
    height: r.height || 206 + (h % 30),
    lean: 0,
    depth: 0,
    wear: 0,
  };
}

export async function loadLibrary() {
  const [books, recs] = await Promise.all([
    get("books?select=*&order=date_finished.desc.nullslast,title.asc"),
    get("recommendations?select=id,created_at,recommender,note,title,author,cover,ol_key,year,spine,band,ink,width,height,status&status=in.(pending,approved)&order=created_at.desc").catch(() => []),
  ]);
  return { books: books.map(normalizeBook), recs: recs.map(normalizeRec) };
}
