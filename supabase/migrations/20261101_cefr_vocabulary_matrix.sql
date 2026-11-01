-- ==============================================================================
-- CEFR Wortschatz-Matrix: Tables, Deduplication, Normalizer & Backfill
-- Migration: 20261101_cefr_vocabulary_matrix.sql
-- ==============================================================================

-- 1. Таблица глобального справочника лексики
create table if not exists public.global_lexicon (
  lemma text primary key,
  cefr_level text not null check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  pos text default 'other'
);

create index if not exists idx_global_lexicon_lemma on public.global_lexicon(lemma);

-- 2. Таблица уникальных выученных слов пользователя (дедуплицированная база)
create table if not exists public.user_mastered_words (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  lemma text not null,
  cefr_level text not null check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  first_mastered_at timestamptz default now(),
  source_book_id text, -- поддерживает как UUID, так и текстовые ID книг ('verbs-de', 'default-de')
  unique(user_id, lemma) -- ГАРАНТИЯ: Одно и то же слово ни при каких условиях не посчитается дважды
);

create index if not exists idx_user_mastered_words_user on public.user_mastered_words(user_id);
create index if not exists idx_user_mastered_words_level on public.user_mastered_words(user_id, cefr_level);

-- Настройка RLS (Row Level Security)
alter table public.global_lexicon enable row level security;
alter table public.user_mastered_words enable row level security;

-- Политики для global_lexicon (чтение доступно всем)
drop policy if exists "Global lexicon is readable by all users" on public.global_lexicon;
create policy "Global lexicon is readable by all users"
  on public.global_lexicon for select
  using (true);

-- Политики для user_mastered_words (пользователь видит и меняет только свои слова)
drop policy if exists "Users can manage their own mastered words" on public.user_mastered_words;
create policy "Users can manage their own mastered words"
  on public.user_mastered_words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. SQL-функция нормализации немецких слов (извлечение базовой леммы)
create or replace function public.normalize_german_lemma(raw_front text)
returns text as $$
declare
  cleaned text;
begin
  if raw_front is null then
    return '';
  end if;
  cleaned := lower(trim(raw_front));
  -- 1. Срезаем артикли
  cleaned := regexp_replace(cleaned, '^(der|die|das)\s+', '', 'i');
  -- 2. Срезаем разделители отделяемых приставок и спецсимволы
  cleaned := regexp_replace(cleaned, '[|•·\(\)\[\]\{\},;:\.!\?]', '', 'g');
  -- 3. Берем первое слово, если указано несколько вариантов через слэш
  cleaned := split_part(cleaned, '/', 1);
  return trim(cleaned);
end;
$$ language plpgsql immutable;

-- 4. Быстрый агрегирующий VIEW для статистики
create or replace view public.view_user_cefr_stats as
select 
  user_id,
  cefr_level,
  count(*)::int as count
from public.user_mastered_words
group by user_id, cefr_level;

-- 5. БЭКФИЛЛ (МИГРАЦИЯ УЖЕ ВЫУЧЕННЫХ СЛОВ)
-- Процедура поддерживает как схему с user_cards, так и схему с cards + decks + user_card_progress
do $$
begin
  -- Сценарий А: Если существует таблица user_cards (согласно заданию)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_cards') then
    insert into public.user_mastered_words (user_id, lemma, cefr_level, first_mastered_at, source_book_id)
    select distinct on (c.user_id, public.normalize_german_lemma(c.front))
      c.user_id,
      public.normalize_german_lemma(c.front) as lemma,
      coalesce(gl.cefr_level, b.level, 'B2') as cefr_level,
      coalesce(c.updated_at, now()) as first_mastered_at,
      c.book_id::text
    from public.user_cards c
    left join public.books b on b.id::text = c.book_id::text
    left join public.global_lexicon gl on gl.lemma = public.normalize_german_lemma(c.front)
    where (c.srs_stage >= 4 or c.is_mastered = true)
      and public.normalize_german_lemma(c.front) <> ''
    on conflict (user_id, lemma) do nothing;
  end if;

  -- Сценарий Б: Основная схема приложения (таблицы cards, decks, user_card_progress)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cards') then
    -- Бэкфилл через таблицу user_card_progress
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_card_progress') then
      insert into public.user_mastered_words (user_id, lemma, cefr_level, first_mastered_at, source_book_id)
      select distinct on (ucp.user_id, public.normalize_german_lemma(coalesce(c."targetWord", '')))
        ucp.user_id,
        public.normalize_german_lemma(coalesce(c."targetWord", '')) as lemma,
        coalesce(gl.cefr_level, 'B2') as cefr_level,
        coalesce(ucp.last_reviewed_at, now()) as first_mastered_at,
        d.book_id::text
      from public.user_card_progress ucp
      join public.cards c on c.id = ucp.card_id
      left join public.decks d on d.id = c.deck_id
      left join public.global_lexicon gl on gl.lemma = public.normalize_german_lemma(coalesce(c."targetWord", ''))
      where (c."masteryLevel" >= 4 or c."isArchived" = true or ucp.repetition_level >= 4)
        and public.normalize_german_lemma(coalesce(c."targetWord", '')) <> ''
      on conflict (user_id, lemma) do nothing;
    end if;

    -- Бэкфилл для всех пользователей из auth.users для карточек, помеченных как mastered/isArchived в базе
    insert into public.user_mastered_words (user_id, lemma, cefr_level, first_mastered_at, source_book_id)
    select distinct on (u.id, public.normalize_german_lemma(coalesce(c."targetWord", '')))
      u.id as user_id,
      public.normalize_german_lemma(coalesce(c."targetWord", '')) as lemma,
      coalesce(gl.cefr_level, 'B2') as cefr_level,
      now() as first_mastered_at,
      d.book_id::text
    from auth.users u
    cross join public.cards c
    left join public.decks d on d.id = c.deck_id
    left join public.global_lexicon gl on gl.lemma = public.normalize_german_lemma(coalesce(c."targetWord", ''))
    where (c."masteryLevel" >= 4 or c."isArchived" = true)
      and public.normalize_german_lemma(coalesce(c."targetWord", '')) <> ''
    on conflict (user_id, lemma) do nothing;
  end if;
end $$;

-- 6. Стартовый базовый сид для global_lexicon (ключевые леммы A1 - C1)
insert into public.global_lexicon (lemma, cefr_level, pos) values
  -- A1
  ('sein', 'A1', 'verb'),
  ('haben', 'A1', 'verb'),
  ('werden', 'A1', 'verb'),
  ('machen', 'A1', 'verb'),
  ('sagen', 'A1', 'verb'),
  ('geben', 'A1', 'verb'),
  ('kommen', 'A1', 'verb'),
  ('gehen', 'A1', 'verb'),
  ('wissen', 'A1', 'verb'),
  ('sehen', 'A1', 'verb'),
  ('essen', 'A1', 'verb'),
  ('trinken', 'A1', 'verb'),
  ('haus', 'A1', 'noun'),
  ('kind', 'A1', 'noun'),
  ('mutter', 'A1', 'noun'),
  ('vater', 'A1', 'noun'),
  ('tag', 'A1', 'noun'),
  ('zeit', 'A1', 'noun'),
  ('gut', 'A1', 'adj'),
  ('neu', 'A1', 'adj'),
  ('gross', 'A1', 'adj'),
  ('klein', 'A1', 'adj'),
  -- A2
  ('beginnen', 'A2', 'verb'),
  ('verstehen', 'A2', 'verb'),
  ('bekommen', 'A2', 'verb'),
  ('schreiben', 'A2', 'verb'),
  ('arbeiten', 'A2', 'verb'),
  ('helfen', 'A2', 'verb'),
  ('treffen', 'A2', 'verb'),
  ('beruf', 'A2', 'noun'),
  ('urlaub', 'A2', 'noun'),
  ('wohnung', 'A2', 'noun'),
  ('stadt', 'A2', 'noun'),
  ('wetter', 'A2', 'noun'),
  ('einfach', 'A2', 'adj'),
  ('wichtig', 'A2', 'adj'),
  ('schnell', 'A2', 'adj'),
  -- B1
  ('erwarten', 'B1', 'verb'),
  ('erreichen', 'B1', 'verb'),
  ('entwickeln', 'B1', 'verb'),
  ('entscheiden', 'B1', 'verb'),
  ('erfahrung', 'B1', 'noun'),
  ('entscheidung', 'B1', 'noun'),
  ('beziehung', 'B1', 'noun'),
  ('meinung', 'B1', 'noun'),
  ('umwelt', 'B1', 'noun'),
  ('erfolg', 'B1', 'noun'),
  ('voraussetzung', 'B1', 'noun'),
  ('deutlich', 'B1', 'adj'),
  ('moeglich', 'B1', 'adj'),
  ('erfolgreich', 'B1', 'adj'),
  -- B2
  ('beruecksichtigen', 'B2', 'verb'),
  ('beurteilen', 'B2', 'verb'),
  ('begruenden', 'B2', 'verb'),
  ('verhandeln', 'B2', 'verb'),
  ('vermitteln', 'B2', 'verb'),
  ('zusammenhang', 'B2', 'noun'),
  ('massnahme', 'B2', 'noun'),
  ('auswirkung', 'B2', 'noun'),
  ('wirtschaft', 'B2', 'noun'),
  ('gesellschaft', 'B2', 'noun'),
  ('herausforderung', 'B2', 'noun'),
  ('wesentlich', 'B2', 'adj'),
  ('angemessen', 'B2', 'adj'),
  ('zuverlaessig', 'B2', 'adj'),
  -- C1
  ('hinterfragen', 'C1', 'verb'),
  ('bewaeltigen', 'C1', 'verb'),
  ('abwaegen', 'C1', 'verb'),
  ('veranschaulichen', 'C1', 'verb'),
  ('vorantreiben', 'C1', 'verb'),
  ('sachverhalt', 'C1', 'noun'),
  ('einwand', 'C1', 'noun'),
  ('schlussfolgerung', 'C1', 'noun'),
  ('plausibel', 'C1', 'adj'),
  ('fundiert', 'C1', 'adj'),
  ('differenziert', 'C1', 'adj'),
  ('facettenreich', 'C1', 'adj')
on conflict (lemma) do nothing;
