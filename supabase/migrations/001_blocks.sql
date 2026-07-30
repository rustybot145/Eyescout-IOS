-- User blocking. Google Play's User Generated Content policy requires social
-- apps to offer BOTH reporting and blocking; EyeScout already had reports, so
-- this is the missing half. Run in the Supabase SQL editor.

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- The feed filters by "authors I blocked", so look-ups are always by blocker.
create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
-- Messages hide both directions, so the reverse look-up needs an index too.
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- A row is only ever readable/writable by the person who created it. Nobody can
-- see who blocked them, which is the point.
create policy blocks_select_own on public.blocks
  for select using (auth.uid() = blocker_id);

create policy blocks_insert_own on public.blocks
  for insert with check (auth.uid() = blocker_id);

create policy blocks_delete_own on public.blocks
  for delete using (auth.uid() = blocker_id);
