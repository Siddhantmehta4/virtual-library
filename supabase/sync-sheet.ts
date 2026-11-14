// deno-lint-ignore-file no-explicit-any
// Virtual Library — sync-sheet
// Receives rows from the Google Sheet, enriches new books (cover, blurb, spine colors,
// physical size), suggests genre/themes/emotion for blank cells, saves to the database,
// and handles recommendation approvals.

import { createClient } from "npm:@supabase/supabase-js@2";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
let db: any = null;
const SYNC_TOKEN = Deno.env.get("SYNC_TOKEN") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const AI_MODEL = "claude-haiku-5-5";
const MAX_ENRICH = 8; // new books processed per run; the rest wait for the next sync
const UA = { "User-Agent": "VirtualLibrary/1.0 (personal bookshelf site)" };
// The bookcase has one bay per genre. Only these are allowed.
const GENRES = [
  "Philosophy", "Fiction", "History", "Self-Help", "Non-Fiction", "Biography",
  "Art & Creativity", "Sci-Fi", "Religion", "Comedy", "Finance",
];
const GENRE_ALIASES: Record<string, string> = {
  "nonfiction": "Non-Fiction", "non fiction": "Non-Fiction", "philosphy": "Philosophy",
  "self help": "Self-Help", "selfhelp": "Self-Help", "science fiction": "Sci-Fi", "scifi": "Sci-Fi",
  "art and creativity": "Art & Creativity", "art": "Art & Creativity", "creativity": "Art & Creativity",
  "humor": "Comedy", "humour": "Comedy", "money": "Finance", "personal finance": "Finance",
  "memoir": "Biography", "autobiography": "Biography", "spirituality": "Religion",
};
function canonGenre(v: unknown): string | null {
  const raw = clean(v);
  if (!raw) return null;
  const exact = GENRES.find((g) => g.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return GENRE_ALIASES[raw.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim()] ?? null;
}

// ---------- helpers ----------
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const clean = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const norm = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const keyOf = (r: any) => `${norm(r.title)}|${norm(r.author)}`;
const cleanIsbn = (v: unknown) => clean(v)?.replace(/[^0-9Xx]/g, "") || null;

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  if (h === 0) h = 1;
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}
const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function hslHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}
async function getJson(url: string) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ---------- Open Library ----------
const FIELDS = "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher";
async function lookup(isbn: string | null, title: string, author: string) {
  if (isbn) {
    const r = await getJson(`https://openlibrary.org/search.json?isbn=${isbn}&limit=1&fields=${FIELDS}`);
    if (r?.docs?.[0]) return r.docs[0];
  }
  const q = `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  const r = await getJson(`https://openlibrary.org/search.json?${q}&limit=5&fields=${FIELDS}`);
  return r?.docs?.find((d: any) => d.cover_i) ?? r?.docs?.[0] ?? null;
}
// ---------- Google Books (cover fallback when Open Library has none) ----------
async function googleCover(isbn: string | null, title: string, author: string) {
  const qs = [
    isbn ? `isbn:${isbn}` : null,
    `intitle:${title} inauthor:${author}`,
  ].filter(Boolean) as string[];
  for (const q of qs) {
    const r = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`);
    const hit = r?.items?.find((it: any) => it?.volumeInfo?.imageLinks?.thumbnail);
    const url: string | undefined = hit?.volumeInfo?.imageLinks?.thumbnail;
    if (url) return url.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/&zoom=\d/, "&zoom=1") + "&fife=w800";
  }
  return null;
}
const isAutoCover = (c: string) =>
  c.startsWith("https://covers.openlibrary.org") || c.startsWith("https://books.google.");

async function blurbFor(olKey: string | null) {
  if (!olKey) return null;
  const w = await getJson(`https://openlibrary.org${olKey}.json`);
  let d: string | undefined = typeof w?.description === "string" ? w.description : w?.description?.value;
  if (!d) return null;
  d = d.split(/-{3,}|\(\[source\]|\[source\]/i)[0].replace(/\s+/g, " ").trim();
  return d.length > 600 ? d.slice(0, 597).replace(/\s+\S*$/, "") + "…" : d;
}

// ---------- cover colors ----------
async function paletteOf(url: string) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const mod: any = await import("npm:jpeg-js@0.4.4");
    const jpeg = mod.default ?? mod;
    const img = jpeg.decode(new Uint8Array(await r.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
    const w = img.width, h = img.height, px = img.data;
    if (w < 4 || h < 4) return null;
    const step = Math.max(1, Math.floor(w / 80));
    const edge = Math.max(1, Math.round(w * 0.06));
    let R = 0, G = 0, B = 0, n = 0, bestSat = -1;
    let best: number[] | null = null;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += x < edge ? 1 : step) {
        const i = (y * w + x) * 4;
        const rr = px[i], gg = px[i + 1], bb = px[i + 2];
        if (x < edge) { R += rr; G += gg; B += bb; n++; }
        const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
        const L = lum(rr, gg, bb);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        if (L > 0.2 && L < 0.75 && sat > bestSat) { bestSat = sat; best = [rr, gg, bb]; }
      }
    }
    R /= n; G /= n; B /= n;
    return {
      spine: hex(R, G, B),
      band: best ? hex(best[0], best[1], best[2]) : null,
      ink: lum(R, G, B) > 0.55 ? "#241f19" : "#faf7f0",
    };
  } catch { return null; }
}

// ---------- physical book ----------
function physical(key: string, pages: number | null) {
  const r = rng(key);
  const p = pages && pages > 20 ? pages : 300;
  const binding = p > 420 ? "hardcover" : p < 260 ? "mass" : "paperback";
  const finish = binding === "hardcover" ? "cloth" : r() < 0.5 ? "gloss" : "matte";
  const height = Math.round(
    binding === "hardcover" ? 236 + r() * 18 : binding === "mass" ? 196 + r() * 14 : 214 + r() * 16,
  );
  const width = Math.max(16, Math.min(58, Math.round(p * 0.055 + (r() - 0.5) * 4)));
  const lean = r() < 0.65 ? 0 : -Math.round(r() * 50) / 10;
  const depth = Math.round((r() * 14 - 7) * 10) / 10;
  const wear = Math.round(r() * 35) / 100;
  const fr = r();
  const face = fr < 0.6 ? "serif" : fr < 0.85 ? "sans" : "mono";
  const caps = r() < 0.3;
  return { binding, finish, height, width, lean, depth, wear, face, caps };
}

// ---------- AI suggestions for blank genre / themes / emotion ----------
async function suggest(rows: any[]) {
  const out = new Map<number, any>();
  const need = rows
    .filter((r) => !canonGenre(r.genre) || !clean(r.themes) || clean(r.emotion) === null)
    .slice(0, 25);
  if (!ANTHROPIC_KEY || need.length === 0) return out;
  const list = need.map((r) => `${r.row} :: ${r.title} :: ${r.author}`).join("\n");
  const prompt = `You tag books for a personal library website.
For each book below, return:
- "genre": exactly one of these, spelled exactly like this: ${GENRES.join(", ")}. Never use anything else.
- "themes": 2 to 4 short lowercase themes (1-2 words each) describing what the book is about. Reuse common theme words so books with shared ideas share themes.
- "emotion": an integer from -2 to 2 for the book's emotional temperature. -2 = cold, bleak, detached. 0 = neutral or balanced. 2 = warm, tender, hopeful.

Books (row :: title :: author):
${list}

Reply with ONLY a JSON array and no other text, like:
[{"row": 2, "genre": "Fiction", "themes": ["memory", "loss"], "emotion": -1}]`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return out;
    const j = await r.json();
    const text: string = j?.content?.find((c: any) => c.type === "text")?.text ?? "";
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    for (const s of arr) {
      const em = Math.round(Number(s.emotion));
      out.set(Number(s.row), {
        genre: canonGenre(s.genre) ?? undefined,
        themes: Array.isArray(s.themes)
          ? s.themes.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 4).join(", ")
          : undefined,
        emotion: Number.isFinite(em) ? Math.max(-2, Math.min(2, em)) : undefined,
      });
    }
  } catch { /* suggestions are optional */ }
  return out;
}

// ---------- sheet row -> database fields you own ----------
function userFields(b: any) {
  const rating = Number(b.rating);
  const em = Math.round(Number(b.emotion));
  const date = String(b.date_finished ?? "").trim();
  return {
    sheet_key: b.key,
    title: clean(b.title),
    author: clean(b.author),
    genre: canonGenre(b.genre),
    status: ["reading", "unfinished"].includes(clean(b.status)?.toLowerCase() ?? "")
      ? clean(b.status)!.toLowerCase()
      : "read",
    date_finished: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    thoughts: clean(b.thoughts),
    themes: (clean(b.themes) ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    emotion: clean(b.emotion) === null || !Number.isFinite(em) ? null : Math.max(-2, Math.min(2, em)),
    favorite: String(b.favorite ?? "").trim().toLowerCase() === "yes",
    recommended_by: clean(b.recommended_by),
    isbn: cleanIsbn(b.isbn),
    updated_at: new Date().toISOString(),
  };
}

function needsEnrich(b: any, e: any) {
  if (!e || !e.spine) return true;
  if ((e.isbn ?? null) !== cleanIsbn(b.isbn)) return true;
  const ov = clean(b.cover_override);
  if (ov && e.cover !== ov) return true;
  if (!ov && e.cover && !isAutoCover(e.cover)) return true;
  // null = looked before the Google Books fallback existed; "" = looked everywhere, nothing found
  if (!ov && e.cover === null) return true;
  return false;
}

// ---------- main ----------
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error(e);
    return json({ error: "Crash: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});

async function handle(req: Request) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SYNC_TOKEN) return json({ error: "SYNC_TOKEN secret is not set in Supabase" }, 500);
  if (req.headers.get("x-sync-token") !== SYNC_TOKEN) {
    return json({ error: "unauthorized: SYNC_TOKEN in the Sheet doesn't match Supabase" }, 401);
  }
  if (!SERVICE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not available to the function" }, 500);
  db ??= createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const rows: any[] = (body.books ?? []).filter((r: any) => clean(r.title) && clean(r.author));
  const approvals: any[] = body.approvals ?? [];
  const results = new Map<number, any>();

  // de-duplicate (first row wins)
  const seen = new Set<string>();
  const books: any[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) { results.set(r.row, { sync_status: "⚠ duplicate of another row" }); continue; }
    seen.add(k);
    books.push({ ...r, key: k });
  }

  const { data: existingRaw, error: exErr } = await db.from("books").select("sheet_key, isbn, cover, spine");
  if (exErr) return json({ error: exErr.message }, 500);
  const existing = existingRaw ?? [];
  const ex = new Map(existing.map((e: any) => [e.sheet_key, e]));

  // fix genre spellings, then fill blank or unknown genre / themes / emotion with suggestions
  const fixed = new Map<number, Record<string, unknown>>();
  for (const b of books) {
    const g = canonGenre(b.genre);
    if (g && g !== clean(b.genre)) { b.genre = g; fixed.set(b.row, { genre: g }); }
  }
  const sugg = await suggest(books);
  for (const b of books) {
    const s = sugg.get(b.row);
    const filled: Record<string, unknown> = {};
    if (fixed.has(b.row)) results.set(b.row, { replace: fixed.get(b.row) });
    if (!s) continue;
    if (!canonGenre(b.genre) && s.genre) {
      const had = clean(b.genre);
      b.genre = s.genre;
      if (had) results.set(b.row, { replace: { genre: s.genre } });
      else filled.genre = s.genre;
    }
    if (!clean(b.themes) && s.themes) { b.themes = s.themes; filled.themes = s.themes; }
    if (clean(b.emotion) === null && s.emotion !== undefined) { b.emotion = s.emotion; filled.emotion = s.emotion; }
    if (Object.keys(filled).length) results.set(b.row, { ...(results.get(b.row) ?? {}), suggested: filled });
  }

  // enrich new / changed books
  const keep: any[] = [];
  const fresh: any[] = [];
  let budget = MAX_ENRICH;
  for (const b of books) {
    const status = results.get(b.row) ?? {};
    results.set(b.row, status);
    const base = userFields(b);
    const shelfNote = !base.genre ? "⚠ pick a genre from the list" : base.status === "unfinished" ? "✓ in the secret shelf" : "✓ on shelf";
    if (!needsEnrich(b, ex.get(b.key))) { keep.push(base); status.sync_status = shelfNote; continue; }
    if (budget <= 0) { status.sync_status = "⏳ queued for next sync"; continue; }
    budget--;

    const doc = await lookup(base.isbn, base.title!, base.author!);
    const ov = clean(b.cover_override);
    const olCover = doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;
    const gbCover = ov || olCover ? null : await googleCover(base.isbn, base.title!, base.author!);
    const cover = ov ?? olCover ?? gbCover;
    const pal = ov ? await paletteOf(ov)
      : olCover ? await paletteOf(olCover.replace("-L.jpg", "-M.jpg"))
      : gbCover ? await paletteOf(gbCover.replace("&fife=w800", ""))
      : null;
    const r = rng(b.key + "|palette");
    const fallback = hslHex(Math.floor(r() * 360), 25 + r() * 20, 28 + r() * 14);
    const pages = doc?.number_of_pages_median ?? null;

    fresh.push({
      ...base,
      cover: cover ?? "",
      ol_key: doc?.key ?? null,
      year: doc?.first_publish_year ?? null,
      blurb: await blurbFor(doc?.key ?? null),
      pages,
      publisher: doc?.publisher?.[0] ?? null,
      spine: pal?.spine ?? fallback,
      band: pal?.band ?? null,
      ink: pal?.ink ?? "#faf7f0",
      ...physical(b.key, pages),
    });
    status.sync_status = !doc && !ov
      ? "⚠ not found, add ISBN or cover_override"
      : !cover
      ? "✓ on shelf (no cover found)"
      : ov && !pal
      ? "⚠ couldn't read cover_override image"
      : shelfNote;
  }

  if (keep.length) {
    const { error } = await db.from("books").upsert(keep, { onConflict: "sheet_key" });
    if (error) return json({ error: error.message }, 500);
  }
  if (fresh.length) {
    const { error } = await db.from("books").upsert(fresh, { onConflict: "sheet_key" });
    if (error) return json({ error: error.message }, 500);
  }

  // remove books deleted from the sheet
  if (books.length > 0) {
    const keys = new Set(books.map((b) => b.key));
    const gone = existing.map((e: any) => e.sheet_key).filter((k: string) => !keys.has(k));
    if (gone.length) await db.from("books").delete().in("sheet_key", gone);
  }

  // recommendation approvals from the sheet
  for (const a of approvals) {
    const v = String(a.approved ?? "").trim().toLowerCase();
    if (!a.rec_id || (v !== "yes" && v !== "no")) continue;
    if (v === "yes") {
      // approving publishes the note too
      const { data: row } = await db.from("recommendations").select("pending_note").eq("id", a.rec_id).single();
      await db.from("recommendations")
        .update({ status: "approved", note: row?.pending_note ?? null })
        .eq("id", a.rec_id)
        .in("status", ["pending", "approved", "rejected"]);
    } else {
      await db.from("recommendations").update({ status: "rejected" }).eq("id", a.rec_id)
        .in("status", ["pending", "approved", "rejected"]);
    }
  }

  // recommendations you've since read
  const libTitles = new Set(books.map((b) => norm(b.title)));
  const { data: recs } = await db.from("recommendations")
    .select("id, created_at, recommender, title, author, note, pending_note, status")
    .order("created_at");
  const readIds = (recs ?? [])
    .filter((r: any) => r.status !== "read" && libTitles.has(norm(r.title)))
    .map((r: any) => r.id);
  if (readIds.length) await db.from("recommendations").update({ status: "read" }).in("id", readIds);

  return json({
    rows: [...results].map(([row, v]) => ({ row, ...v })),
    recommendations: (recs ?? []).map((r: any) => ({
      ...r,
      note: r.note ?? r.pending_note,
      status: readIds.includes(r.id) ? "read" : r.status,
    })),
  });
}
