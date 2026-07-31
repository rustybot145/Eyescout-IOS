-- EyeScout — real age assurance for player signup.
--
-- Apple flagged this as the weakest point of the submission: the app connects
-- minors with adult coaches via direct messaging, and had no birth-date field
-- anywhere — only a self-attested "I confirm 13+" checkbox, which proves
-- nothing. This adds a real column the signup flow now writes to and enforces
-- a hard under-13 block against (see src/components/SignupQuiz.tsx).
--
-- Run in the Supabase SQL editor BEFORE shipping the app update that writes to
-- this column — signUpPlayer() inserts birth_date unconditionally, so an
-- un-migrated database would fail every new player signup.
--
-- Idempotent — safe to re-run.

alter table public.profiles
  add column if not exists birth_date date;

-- Nothing else reads this column client-side beyond the owner's own row
-- (already governed by the existing profiles RLS policies), so no new policy
-- is needed — this is additive to a table that's already locked down.

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (optional, run after):
--   select column_name from information_schema.columns
--    where table_name = 'profiles' and column_name = 'birth_date';
--   -- expect one row
-- ═══════════════════════════════════════════════════════════════════════════
