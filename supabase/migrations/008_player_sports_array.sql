-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — real support for a player playing more than one sport.
--
-- The web portal already lets a player check up to 2 sports at signup and
-- writes them into a `sports` array column (see eyescout-site/social-app/
-- login.html — the profiles.insert() there sends both `sport` and `sports`).
-- The mobile app only ever wrote the single `sport` column, so a mobile
-- signup could never carry a second sport.
--
-- This adds the same column mobile is about to start writing to. It is
-- additive — nothing existing changes shape, and every current reader of
-- `sport` (coach scouting, feed filtering, Stories) is untouched, because on
-- the web itself those all still match on the single primary `sport` column,
-- not `sports`. `sports` is only ever read for a player's OWN feed/story
-- personalization — never used to make someone discoverable to a coach.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists sports text[];

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (optional, run after):
--   select column_name from information_schema.columns
--    where table_name = 'profiles' and column_name = 'sports';
--   -- expect one row
-- ═══════════════════════════════════════════════════════════════════════════
