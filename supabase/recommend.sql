-- Recommendations go straight into the database through this function, the same address the
-- site already reads books from, so there's no Edge Function in the way.
-- Run once in Supabase → SQL Editor. Safe to run again.

create or replace function public.recommend_book(
  p_recommender text, p_title text, p_author text default '', p_note text default '',
  p_cover text default '', p_year int default null, p_ol_key text default '', p_website text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := left(btrim(coalesce(p_recommender, '')), 60);
  t text := left(btrim(coalesce(p_title, '')), 300);
  a text := left(btrim(coalesce(p_author, '')), 200);
  n text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  c text := case when coalesce(p_cover, '') like 'https://covers.openlibrary.org/%' then p_cover end;
  k text := case when coalesce(p_ol_key, '') ~ '^/works/OL\w+$' then p_ol_key end;
begin
  -- bots fill the hidden field: pretend it worked
  if btrim(coalesce(p_website, '')) <> '' then return json_build_object('ok', true); end if;
  if r = '' then return json_build_object('error', 'Add your name so I know who to thank.'); end if;
  if regexp_replace(lower(r), '[^a-z]', '', 'g')
     ~ '(fuck|shit|cunt|nigg|fag|bitch|whore|slut|rape|nazi|hitler|porn|dick|cock|pussy|retard|kys|http|www)' then
    return json_build_object('error', 'Try a different name.');
  end if;
  if t = '' then return json_build_object('error', 'Pick a book first.'); end if;
  -- flood guard: at most 40 an hour across the whole site
  if (select count(*) from recommendations where created_at > now() - interval '1 hour') >= 40 then
    return json_build_object('error', 'The slot is full right now. Try again a little later.');
  end if;
  -- the same person recommending the same book twice counts once
  if exists (select 1 from recommendations where lower(title) = lower(t) and lower(recommender) = lower(r)) then
    return json_build_object('ok', true);
  end if;
  insert into recommendations (recommender, title, author, note, pending_note, cover, year, ol_key, status)
  values (r, t, a, null, n, c, p_year, k, 'pending');
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.recommend_book(text, text, text, text, text, int, text, text) from public;
grant execute on function public.recommend_book(text, text, text, text, text, int, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
