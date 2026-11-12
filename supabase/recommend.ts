// Virtual Library — recommend
// Receives a visitor's recommendation from the paper-plane form and stores it as pending.
// Nothing shows on the site until it's approved in the Sheet.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    if (String(body.website ?? "").trim()) return json({ ok: true }); // bots fill the hidden field

    const recommender = text(body.recommender, 60);
    const title = text(body.title, 300);
    const author = text(body.author, 200);
    const note = text(body.note, 500) || null;
    if (!recommender) return json({ error: "Add your name so I know who to thank." }, 400);
    if (!title) return json({ error: "Pick a book first." }, 400);

    const cover = String(body.cover ?? "");
    const safeCover = cover.startsWith("https://covers.openlibrary.org/") ? cover : null;
    const year = Number.isInteger(body.year) ? body.year : null;
    const ol_key = /^\/works\/OL\w+$/.test(String(body.ol_key ?? "")) ? body.ol_key : null;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // simple flood guard: at most 40 recommendations an hour across the whole site
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("recommendations").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= 40) return json({ error: "The slot is full right now. Try again a little later." }, 429);

    // the same person recommending the same book twice counts once
    const { data: dupe } = await db.from("recommendations").select("id")
      .ilike("title", title).ilike("recommender", recommender).limit(1);
    if (dupe && dupe.length) return json({ ok: true });

    const { error } = await db.from("recommendations").insert({
      recommender, title, author, note, cover: safeCover, year, ol_key, status: "pending",
    });
    if (error) return json({ error: "Couldn't save it just now. Try again in a moment." }, 500);
    return json({ ok: true });
  } catch (_e) {
    return json({ error: "Something went wrong. Try again in a moment." }, 500);
  }
});
