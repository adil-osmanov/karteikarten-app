-- ==============================================================================
-- Multi-language Lexicon & Deduplicated Mastered Words Matrix (DE / EN / RU)
-- Migration: 20261103_multilang_lexicon_matrix.sql
-- ==============================================================================

-- 1. Добавляем колонку language в global_lexicon
alter table public.global_lexicon add column if not exists language text not null default 'de';
alter table public.global_lexicon drop constraint if exists global_lexicon_pkey;
alter table public.global_lexicon add primary key (language, lemma);
create index if not exists idx_global_lexicon_lang_level on public.global_lexicon(language, cefr_level);

-- 2. Добавляем language в user_mastered_words
alter table public.user_mastered_words add column if not exists language text not null default 'de';
alter table public.user_mastered_words drop constraint if exists user_mastered_words_unique_lemma;
alter table public.user_mastered_words drop constraint if exists user_mastered_words_user_id_lemma_key;
alter table public.user_mastered_words add constraint user_mastered_words_unique_lang_lemma unique(user_id, language, lemma);
create index if not exists idx_user_mastered_lang_user on public.user_mastered_words(user_id, language, cefr_level);

-- 3. Обновляем View статистики с учетом языка
create or replace view public.view_user_cefr_stats as
select 
  user_id,
  language,
  cefr_level,
  count(distinct lemma)::int as mastered_count
from public.user_mastered_words
group by user_id, language, cefr_level;
