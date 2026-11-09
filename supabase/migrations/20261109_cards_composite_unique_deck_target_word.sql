-- Migration: Allow duplicate words across different decks.
-- Cards are uniquely identified within a deck (deck_id, targetWord) rather than globally.

-- 1. Remove global unique constraints on targetWord if any exist
do $$
declare
  r record;
begin
  for r in (
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = 'cards'
      and tc.constraint_type = 'UNIQUE'
      and ccu.column_name = 'targetWord'
  ) loop
    execute 'alter table public.cards drop constraint if exists ' || quote_ident(r.constraint_name);
  end loop;
end $$;

-- 2. Drop standalone unique indexes on targetWord if any exist
drop index if exists public.cards_targetword_key;
drop index if exists public.cards_target_word_unique;
drop index if exists public.cards_targetword_unique_idx;

-- 3. Ensure composite index on (deck_id, targetWord) exists for fast lookups
create index if not exists cards_deck_target_word_idx on public.cards(deck_id, "targetWord");
