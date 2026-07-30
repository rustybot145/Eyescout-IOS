// EyeScout — account deletion (Apple App Store Guideline 5.1.1(v)).
//
// Deletes the AUTHENTICATED CALLER's own account: their profile + the Supabase
// Auth user (and any child rows you list below). It is scoped to the caller's
// own uid, so a user can only ever delete themselves.
//
// The app calls this via `supabase.functions.invoke('delete-user')` from
// Settings → Delete Account. It uses the SERVICE_ROLE key, which lives only in
// the deployed function's env — never in the mobile app.
//
// ── DEPLOY (one-time, Ben) ───────────────────────────────────────────────────
//   supabase functions deploy delete-user
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided
//    automatically to deployed functions.)
//   Verify the child-table cleanup below matches your schema before submitting.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Not authenticated' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their JWT.
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

  const uid = user.id;
  const admin = createClient(url, serviceKey);

  // Remove the caller's own data. Everything is scoped by their uid, so this can
  // never touch another user. Add/rename tables to match your schema (or rely on
  // ON DELETE CASCADE from `profiles`).
  const childTables: Array<[table: string, column: string]> = [
    // NOTE: `posts` is keyed by author_id (see src/data/feed.ts), not user_id.
    // Getting this wrong silently orphaned deleted users' photos/videos.
    ['posts', 'author_id'],
    ['blocks', 'blocker_id'],
    ['blocks', 'blocked_id'],
    ['own_photos', 'user_id'],
    ['own_clips', 'user_id'],
    ['delivered_photos', 'user_id'],
    ['hypes', 'user_id'],
    ['follows', 'follower_id'],
    ['notifications', 'user_id'],
    ['coach_saved', 'coach_id'],
    ['reports', 'reporter_id'],
    ['subscriptions', 'user_id'],
  ];
  // Ignore only "that table/column isn't in this schema" (42P01 / 42703) so a
  // schema mismatch can't block the deletion. Any OTHER failure means real user
  // data would survive the delete, so surface it instead of silently passing.
  const SCHEMA_MISMATCH = ['42P01', '42703'];
  const failed: string[] = [];
  for (const [table, column] of childTables) {
    const { error } = await admin.from(table).delete().eq(column, uid);
    if (error && !SCHEMA_MISMATCH.includes(error.code)) failed.push(`${table}.${column}`);
  }
  if (failed.length) return json({ error: `Could not delete: ${failed.join(', ')}` }, 500);

  await admin.from('profiles').delete().eq('id', uid);

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
