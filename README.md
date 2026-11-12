# Sid's Library

A personal library: every book I've read, on one walnut bookcase.

## How it works

- **Google Sheet** is where books are logged (title, author, rating, thoughts…).
- **Apps Script** in the Sheet syncs every 5 minutes to a Supabase function.
- **Supabase** stores the enriched books (cover, spine colors, size, blurb).
- **This site** reads the books straight from Supabase on every visit, so new
  books appear without redeploying.

## Files

- `index.html` – page structure
- `assets/room.jpg` – the room photo the bookcase is built on
- `js/layout.js` – where each bay sits in the photo, and which genre lives there
- `styles.css` – the room, bookcase and books
- `js/config.js` – Supabase URL and public key
- `js/data.js` – loads books and approved recommendations
- `js/main.js` – bookcase, shelf zoom, hover and pull-out
- `supabase/sync-sheet.ts` – the sync function deployed in Supabase
- `apps-script/Library Sync.gs` – the script inside the Google Sheet
