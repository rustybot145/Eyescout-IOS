-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — OPTIONAL cleanup of legacy sport names.
--
-- ⚠️  READ THIS BEFORE RUNNING ANYTHING. This file touches LIVE user rows.
--     Run STEP 1 first and look at the results. Only run STEP 2 if the numbers
--     look right to you. Nothing here is required for the app update to work.
--
-- ── THE PROBLEM ────────────────────────────────────────────────────────────
-- The web portal splits several sports by gender ("Boys Basketball" / "Girls
-- Basketball"), but the mobile app was still offering the old combined names
-- ("Basketball"). That's now fixed in the app — but anyone who signed up on
-- mobile BEFORE this update still has the old value saved on their profile.
--
-- This matters because coach scouting matches on the sport string exactly:
--
--     a coach coaching "Boys Basketball"  ...will NOT see...
--     a player whose sport is "Basketball"
--
-- So legacy players are invisible to exactly the coaches meant to find them.
--
-- ── WHY THIS ISN'T AUTOMATIC ───────────────────────────────────────────────
-- "Basketball" doesn't say whether the athlete plays boys' or girls' ball, and
-- the database has no gender column to infer it from. Any automatic answer
-- would be a guess, and a wrong guess files an athlete into the wrong recruiting
-- pool. STEP 2 therefore only handles the sports where the rename is
-- unambiguous, and leaves the genuinely ambiguous ones for a human.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── STEP 1: LOOK FIRST (safe, read-only — run this on its own) ──────────────
-- How many players are on a sport name the app no longer offers?
select sport, count(*) as players
  from public.profiles
 where role = 'player'
   and sport is not null
   and sport not in (
     'Football','Boys Basketball','Girls Basketball','Baseball','Softball',
     'Boys Soccer','Girls Soccer','Boys Volleyball','Girls Volleyball',
     'Track & Field','Wrestling','Boys Lacrosse','Girls Lacrosse',
     'Tennis','Swimming','Cross Country','Other'
   )
 group by sport
 order by players desc;

-- Do the same for coaches (their list allows 'Multiple Sports' instead of 'Other'):
select sport, count(*) as coaches
  from public.profiles
 where role = 'coach'
   and sport is not null
   and sport not in (
     'Football','Boys Basketball','Girls Basketball','Baseball','Softball',
     'Boys Soccer','Girls Soccer','Boys Volleyball','Girls Volleyball',
     'Track & Field','Wrestling','Boys Lacrosse','Girls Lacrosse',
     'Tennis','Swimming','Cross Country','Multiple Sports'
   )
 group by sport
 order by coaches desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- ── STEP 2: THE AMBIGUOUS ONES — DECIDE, DON'T GUESS ───────────────────────
--
-- Basketball / Soccer / Volleyball / Lacrosse each split into Boys and Girls.
-- There is no safe automatic mapping. Two ways to handle them:
--
--   (a) Move them by hand in the admin panel (best if the counts are small —
--       check STEP 1 first, it's often only a handful of rows).
--
--   (b) Park them so coaches aren't matching against a stale value, then let
--       each athlete re-pick their sport. To do that, uncomment ONE line at a
--       time and run it:
--
--   update public.profiles set sport = 'Boys Basketball'  where role='player' and sport='Basketball';
--   update public.profiles set sport = 'Girls Basketball' where role='player' and sport='Basketball';
--   update public.profiles set sport = 'Boys Soccer'      where role='player' and sport='Soccer';
--   update public.profiles set sport = 'Girls Soccer'     where role='player' and sport='Soccer';
--   update public.profiles set sport = 'Boys Volleyball'  where role='player' and sport='Volleyball';
--   update public.profiles set sport = 'Girls Volleyball' where role='player' and sport='Volleyball';
--   update public.profiles set sport = 'Boys Lacrosse'    where role='player' and sport='Lacrosse';
--   update public.profiles set sport = 'Girls Lacrosse'   where role='player' and sport='Lacrosse';
--
-- To fix ONE specific athlete instead of a whole sport at once (safest):
--   update public.profiles set sport = 'Girls Basketball' where email = 'her@email.com';
--
-- ⚠️  Each line above rewrites EVERY legacy row for that sport in one direction.
--     Running the Boys line then the Girls line would sweep everyone into Girls.
--     Pick one, or use the per-athlete form.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── VERIFY (after any change) ──────────────────────────────────────────────
-- Re-run STEP 1. An empty result means every profile is on a current sport name
-- and no athlete is hidden from their coaches.
