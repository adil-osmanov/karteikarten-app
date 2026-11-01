-- Ensure cards table has updated_at column
alter table if exists public.cards add column if not exists updated_at timestamptz default now();

-- Ensure RLS on cards allows updates for authenticated users
alter table if exists public.cards enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'Users can update cards'
  ) then
    create policy "Users can update cards" on public.cards for update using (true) with check (true);
  end if;
end $$;
