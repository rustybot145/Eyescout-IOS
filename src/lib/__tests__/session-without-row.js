// Guards the recovery path for a session that exists before its profiles row.
//
// The bug (2026-08-29, TestFlight build 2): the eyescout:// confirm handoff
// calls setSession() and THEN inserts the profiles row. If that insert failed
// once (app backgrounded mid-handoff, network blip), the device held a live
// session with no row — and nothing ever retried. Entry then defaulted the
// role to 'player' and routed to a feed that read no identity: empty feed, no
// stories, and a profile tab that bounced straight back. The waiting screen's
// poll made it worse by seeing the session and stopping forever.
//
// Structural checks, because the failure was an absent retry and absent calls
// are what a refactor reintroduces.
//
//   node src/lib/__tests__/session-without-row.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '../../..');
const entry = fs.readFileSync(path.join(ROOT, 'app/index.tsx'), 'utf8');
const quiz = fs.readFileSync(path.join(ROOT, 'src/components/SignupQuiz.tsx'), 'utf8');
const feed = fs.readFileSync(path.join(ROOT, 'src/data/feed.ts'), 'utf8');
const user = fs.readFileSync(path.join(ROOT, 'src/data/user.ts'), 'utf8');

// ── 1. Entry must NOT guess a role for a missing row ────────────────────────
assert.ok(
  !/prof\?\.role \|\| 'player'/.test(entry),
  "Entry.routeByRole must not default a missing profiles row to 'player' — " +
    'that routed people into an app with no identity',
);

// ── 2. Entry must retry the profile insert before routing ───────────────────
const routeBody = entry.slice(entry.indexOf('routeByRole'), entry.indexOf('useEffect('));
assert.ok(
  /ensureProfile\(/.test(routeBody),
  'Entry.routeByRole must call ensureProfile() when the row is missing — it is ' +
    'the only self-heal for a session adopted before its row was written',
);

// ── 3. …and give up honestly, not half-signed-in ────────────────────────────
assert.ok(
  /signOutEverywhere\(/.test(routeBody),
  'Entry.routeByRole must sign out when no row exists and none is recoverable — ' +
    'a signed-out start beats an app where every tab is quietly broken',
);

// ── 4. Confirmation happens IN the screen, via the emailed code ─────────────
// The old flow handed off to Safari and back (four hops, each with a way to
// fail). The code flow must verify right here and then walk the person in.
const confirmBody = quiz.slice(quiz.indexOf('function ConfirmEmailView'), quiz.indexOf('function LoginView'));
assert.ok(
  /verifyOtp\(\{\s*email,\s*token,\s*type:\s*'signup'\s*\}\)/.test(confirmBody),
  "ConfirmEmailView must confirm with verifyOtp({ email, token, type: 'signup' }) — " +
    'the 6-digit code from the email, no browser handoff',
);
assert.ok(
  /ensureProfile\(/.test(confirmBody) && /router\.replace\(/.test(confirmBody),
  'ConfirmEmailView must ensure the profiles row exists and route the person ' +
    'in after a successful verify — a session without its row is the bug this ' +
    'file exists to prevent',
);
assert.ok(
  !/if \(sess\.session\) return true/.test(confirmBody),
  'ConfirmEmailView must never stop dead on a bare session — finish the walk-in instead',
);

// ── 5. Feed filter must be multi-sport, like the web ────────────────────────
assert.ok(
  /mySports: string\[\]/.test(feed),
  'fetchFeed must take the full sports list — the web feed filters on ' +
    "getPlayerSports(), and filtering on one sport hid half a two-sport athlete's feed",
);
assert.ok(
  /sports/.test(user) && /select\([^)]*sports/.test(user),
  'getCurrentUser must select the sports array so the feed can match the web',
);

console.log('session-without-row: 5 checks passed');
