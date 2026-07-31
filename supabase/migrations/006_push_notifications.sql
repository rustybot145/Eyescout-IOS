-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — push notifications.
--
-- Scope, as decided: (1) a new message, (2) a coach follows you — specifically
-- NOT a player following you, and (3) a weekly broadcast when this week's
-- "Most Hyped" winner is decided, timed for Monday 7:00 AM Phoenix so it lands
-- when people are actually awake rather than at the literal midnight reset.
--
-- HOW SENDING WORKS. The app never talks to Apple directly for this. EAS
-- manages the APNs auth key automatically on build; the only thing this
-- database calls is Expo's push endpoint (exp.host), which is the same relay
-- expo-notifications uses on the client — it forwards to APNs/FCM for us. That
-- keeps this in plain SQL like every other migration here: no Edge Function
-- deploy, no second credential to manage.
--
-- Idempotent — safe to re-run. Requires the pg_net and pg_cron extensions,
-- enabled below (both are available on all Supabase projects; pg_cron may need
-- a one-time toggle in Database → Extensions in the dashboard if the CREATE
-- EXTENSION statement below reports insufficient privilege).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;
create extension if not exists pg_cron;


-- ── 1. Where device tokens live ──────────────────────────────────────────────
-- One row per (user, device) — a user with two devices gets two rows, both
-- notified. Re-registering the same device (every app launch) just updates
-- updated_at via the upsert the client already does (src/lib/push.ts).
create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;


-- ── 2. The actual sender ─────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read every recipient's tokens regardless of whose
-- request triggered it (a message trigger fires as the sender, who has no RLS
-- visibility into the recipient's tokens). `p_screen` becomes `data.screen`,
-- which src/lib/push.ts reads to route a tapped notification to the right tab.
--
-- Fire-and-forget: pg_net queues the HTTP call and returns immediately, the
-- same async style every other write in this app already uses (see feed.ts's
-- toggleHype/toggleFollow). A failed push should never roll back or block
-- whatever DB write triggered it.
create or replace function public._es_send_push(
  p_user_ids uuid[],
  p_title    text,
  p_body     text,
  p_screen   text default null,
  p_data     jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tokens  text[];
  v_data    jsonb := p_data || jsonb_build_object('screen', p_screen);
  v_message jsonb;
begin
  select array_agg(distinct token) into v_tokens
    from public.push_tokens
   where user_id = any(p_user_ids);

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return; -- nobody in the list has a registered device
  end if;

  -- One POST per token — Expo's batch form takes an array of {to,...}, but
  -- building that array (jsonb_agg) makes one malformed token fail the WHOLE
  -- batch. A handful of individual requests is a fair trade for that not being
  -- able to happen on a notification that's supposed to reach several people.
  foreach v_message in array (
    select jsonb_build_object('to', t, 'title', p_title, 'body', p_body, 'data', v_data)
      from unnest(v_tokens) as t
  )
  loop
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      body    := v_message
    );
  end loop;
end;
$$;

revoke all on function public._es_send_push(uuid[], text, text, text, jsonb) from public, anon, authenticated;


-- ── 3. New message ────────────────────────────────────────────────────────
-- `messages` is one row per coach↔player pair with the whole conversation in a
-- `thread` jsonb array (see src/data/messages.ts). The SAME upsert path is used
-- to mark messages read (flips `read` on existing entries), so the only safe
-- signal for "a message was actually just sent" is the array getting LONGER —
-- a read-flag flip changes existing elements without changing the count.
create or replace function public._es_notify_new_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_len  int := coalesce(jsonb_array_length(old.thread), 0);
  v_new_len  int := coalesce(jsonb_array_length(new.thread), 0);
  v_last     jsonb;
  v_from     text;
  v_recipient uuid;
  v_sender_name text;
begin
  if v_new_len <= v_old_len or new.coach_id is null then
    return new; -- no new message appended, or thread has no coach yet
  end if;

  v_last := new.thread -> (v_new_len - 1);
  v_from := v_last ->> 'from';
  v_recipient := case when v_from = 'coach' then new.player_id else new.coach_id end;
  if v_recipient is null then
    return new;
  end if;

  select trim(coalesce(athlete_first, '') || ' ' || coalesce(athlete_last, ''))
    into v_sender_name
    from public.profiles
   where id = (case when v_from = 'coach' then new.coach_id else new.player_id end);

  perform public._es_send_push(
    array[v_recipient],
    'New message' || case when v_sender_name > '' then ' from ' || v_sender_name else '' end,
    left(coalesce(v_last ->> 'text', ''), 120),
    case when v_from = 'coach' then 'player-messages' else 'coach-inbox' end
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert or update on public.messages
  for each row execute function public._es_notify_new_message();


-- ── 4. Coach follows you (players are deliberately NOT notified on follow —
--      only when the follower is a coach) ──────────────────────────────────
create or replace function public._es_notify_coach_follow()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_follower_name text;
begin
  select trim(coalesce(athlete_first, '') || ' ' || coalesce(athlete_last, ''))
    into v_follower_name
    from public.profiles
   where id = new.follower_id
     and role = 'coach';

  if v_follower_name is null then
    return new; -- follower isn't a coach — not in scope
  end if;

  perform public._es_send_push(
    array[new.followee_id],
    'New follower',
    (case when v_follower_name > '' then v_follower_name else 'A coach' end) || ' is now following you'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_coach_follow on public.follows;
create trigger trg_notify_coach_follow
  after insert on public.follows
  for each row execute function public._es_notify_coach_follow();


-- ── 5. Weekly "Most Hyped" broadcast ─────────────────────────────────────────
-- Reads the SAME frozen weekly winner the Stories rail reads
-- (get_weekly_hype_winners() — see src/data/stories.ts). Guarded with
-- to_regprocedure so this degrades to "nothing sent" instead of a cron error
-- if that function isn't deployed on this project yet.
--
-- week_start dedupe: the cron could in principle fire twice (a manual re-run,
-- a retry) — this table makes a second attempt for the same week a no-op
-- instead of a second blast to every user.
create table if not exists public._es_weekly_hype_push_log (
  week_start date primary key,
  sent_at    timestamptz not null default now()
);

create or replace function public._es_broadcast_most_hyped()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_post_id    text;
  v_week_start date;
  v_recipients uuid[];
begin
  if to_regprocedure('public.get_weekly_hype_winners()') is null then
    return; -- weekly-winner feature not deployed on this project
  end if;

  execute
    'select post_id, week_start from public.get_weekly_hype_winners() where category = ''global'' limit 1'
    into v_post_id, v_week_start;

  if v_post_id is null then
    return; -- nobody has been hyped yet this week — nothing to announce
  end if;

  insert into public._es_weekly_hype_push_log (week_start) values (v_week_start)
    on conflict (week_start) do nothing;
  if not found then
    return; -- already sent for this week
  end if;

  select array_agg(distinct user_id) into v_recipients from public.push_tokens;
  if v_recipients is null then
    return;
  end if;

  perform public._es_send_push(
    v_recipients,
    'New Most Hyped post is out! 🔥',
    'See who''s on top this week.',
    'most-hyped'
  );
end;
$$;

-- Monday 14:00 UTC = Monday 7:00 AM Phoenix. Arizona doesn't observe DST, so
-- this stays correct year-round with no seasonal adjustment (see
-- currentWeekStart() in src/data/stories.ts for the same reasoning).
select cron.schedule(
  'weekly-most-hyped-push',
  '0 14 * * 1',
  $$select public._es_broadcast_most_hyped();$$
)
where not exists (select 1 from cron.job where jobname = 'weekly-most-hyped-push');


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (optional, run after):
--   select proname from pg_proc
--    where proname in ('_es_send_push','_es_notify_new_message',
--                       '_es_notify_coach_follow','_es_broadcast_most_hyped');
--   -- expect all four
--
--   select jobname, schedule from cron.job where jobname = 'weekly-most-hyped-push';
--   -- expect one row, schedule = '0 14 * * 1'
--
--   -- after a real device registers (open the app signed in on a real build):
--   select user_id, platform, updated_at from public.push_tokens;
-- ═══════════════════════════════════════════════════════════════════════════
