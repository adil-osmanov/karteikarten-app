-- ==============================================================================
-- Cross-Browser Sync, Persistent Mistakes & Book Exclusion Columns
-- Migration: 20261113_cross_browser_sync_and_exclusions.sql
-- ==============================================================================

-- 1. Exclusion flags on books and decks
alter table if exists public.books
  add column if not exists exclude_from_review boolean not null default false;

alter table if exists public.decks
  add column if not exists exclude_from_review boolean not null default false;

-- 2. Persistent mistake flag & delta sync timestamp on cards
alter table if exists public.cards
  add column if not exists has_mistake boolean not null default false;

alter table if exists public.cards
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_cards_updated_at on public.cards(updated_at);
create index if not exists idx_cards_has_mistake on public.cards(has_mistake) where has_mistake = true;

-- Backfill trigger so updated_at auto-updates on any card mutation
create or replace function public.set_cards_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cards_updated_at on public.cards;
create trigger trg_cards_updated_at
  before update on public.cards
  for each row
  execute function public.set_cards_updated_at();

-- 3. Persistent daily stats table (local YYYY-MM-DD scoped)
create table if not exists public.user_daily_stats (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default',
  language text not null default 'DE',
  date text not null,
  cards_done integer not null default 0,
  correct_count integer not null default 0,
  mistakes_count integer not null default 0,
  focus_minutes integer not null default 0,
  words_learned_today integer not null default 0,
  cards_reviewed_today integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, language, date)
);

create index if not exists idx_user_daily_stats_lookup
  on public.user_daily_stats(user_id, language, date);

alter table public.user_daily_stats enable row level security;
drop policy if exists "Public access to user_daily_stats" on public.user_daily_stats;
create policy "Public access to user_daily_stats"
  on public.user_daily_stats for all
  using (true)
  with check (true);

-- 4. Persistent mistakes pool table
create table if not exists public.user_mistakes (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default',
  language text not null default 'DE',
  card_id text not null,
  deck_id text,
  target_word text,
  sentence text,
  translation text,
  card_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, language, card_id)
);

create index if not exists idx_user_mistakes_lookup
  on public.user_mistakes(user_id, language);

alter table public.user_mistakes enable row level security;
drop policy if exists "Public access to user_mistakes" on public.user_mistakes;
create policy "Public access to user_mistakes"
  on public.user_mistakes for all
  using (true)
  with check (true);
