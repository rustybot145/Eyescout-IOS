// Guards the signup path against Supabase's "Confirm email" setting.
//
// The bug (cause of the 2026-08-16 App Store rejection): with confirmation ON,
// supabase.auth.signUp() returns a user but NO session, so `profiles` could not
// be written — and the app just showed "check your email" and dropped the row on
// the floor. The account existed in auth and nowhere else. Signing in afterwards
// then read no profile, assumed role 'player', and told every mobile-signed-up
// coach "That's a player account" forever.
//
// The web portal already solved this in login.html; these checks keep the mobile
// port of it from being refactored away. Structural, because the failure was an
// absent call and absent calls are what a rewrite reintroduces.
//
//   node src/lib/__tests__/signup-confirm-email.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '../../..');
const auth = fs.readFileSync(path.join(ROOT, 'src/lib/auth.ts'), 'utf8');

// ── 1. The profile row must ride along in user_metadata ─────────────────────
// It has to survive the round trip through the confirmation email, which is very
// often opened on a different device — so it cannot live in component state.
assert.ok(
  /supabase\.auth\.signUp\(\{[\s\S]*?options:\s*\{\s*data:\s*\{\s*es_signup/.test(auth),
  'signUp() must park the profile row in options.data.es_signup — with email ' +
    'confirmation ON there is no session to insert it with, and nothing else ' +
    'carries it across the confirmation link',
);

// ── 2. Sign-in must be able to recover it ───────────────────────────────────
assert.ok(
  /await ensureProfile\(/.test(auth),
  'signIn() must call ensureProfile() — it is the only thing that writes the ' +
    'profile row for an account created while email confirmation was on',
);
assert.ok(
  auth.indexOf('await ensureProfile(') > auth.indexOf('export async function signIn'),
  'the ensureProfile() call must be inside signIn(), which is the single path ' +
    'every sign-in in the app goes through',
);

// ── 3. A missing profile must never be papered over with a guessed role ─────
assert.ok(
  !/role\s*\|\|\s*'player'/.test(auth),
  "signIn() must not default a missing profile to role 'player' — that is what " +
    'locked coaches out; with no row it must fail loudly instead',
);

// ── 4. Inserting twice is normal, not an error ──────────────────────────────
// The web confirm handler and the app can both reach the insert for one account.
assert.ok(
  /'23505'/.test(auth),
  'insertProfile() must treat 23505 (duplicate key) as success — the web ' +
    "portal's confirm handler may have already created the row",
);

// ── 5. The parked copy must be cleared once the row exists ──────────────────
// It holds a minor's phone, zip and parent contact details, and user_metadata
// stays in auth.users forever.
assert.ok(
  /updateUser\(\{\s*data:\s*\{\s*es_signup:\s*null/.test(auth),
  'the es_signup copy must be cleared after a successful insert — it carries ' +
    "a minor's contact details and user_metadata is permanent",
);

console.log('signup-confirm-email: 5 checks passed');
