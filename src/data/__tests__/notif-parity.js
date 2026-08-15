// Parity + crash guards for the notifications system.
//
// Two bugs shipped here before: the Activity screen crashed on any notification
// type it didn't know (coach_follow, written by the web), and the app wrote no
// notifications at all, so actions taken on the phone never reached the web or
// the email pipeline. Both are structural, so they're checked structurally.
//
//   node src/data/__tests__/notif-parity.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const MOBILE = path.join(__dirname, '../..');
const WEB = path.join(__dirname, '../../../../eyescout-site/social-app');

const read = (p) => fs.readFileSync(p, 'utf8');

// ── 1. Every type anyone writes must be renderable ──────────────────────────
// Collected from the real sources rather than hardcoded, so a new type added to
// the web or admin fails here instead of crashing a phone.
const webTypes = new Set();
for (const f of ['sb-data.js', 'profile.html']) {
  for (const m of read(path.join(WEB, f)).matchAll(/type:\s*'([a-z_]+)'/g)) webTypes.add(m[1]);
}
webTypes.add('post_removed');    // admin panel
webTypes.add('admin_message');   // admin panel

const activityTsx = read(path.join(MOBILE, '../app/(tabs)/activity.tsx'));
const activityTs = read(path.join(MOBILE, 'data/activity.ts'));

// The default arms are what make this safe for types nobody has invented yet.
const defaults = (activityTsx.match(/default:/g) || []).length;
assert.ok(defaults >= 2, `iconFor and bodyFor both need a default arm, found ${defaults}`);

// Types that reach the renderer must have real copy, not just the fallback.
const RENDERED_ELSEWHERE = new Set(['message', 'admin_message']); // built from threads
for (const t of webTypes) {
  if (RENDERED_ELSEWHERE.has(t)) continue;
  assert.ok(
    activityTsx.includes(`case '${t}'`),
    `notification type '${t}' is written but has no case in activity.tsx`,
  );
}
console.log(`types checked (${webTypes.size}): ${[...webTypes].join(', ')}`);

// ── 2. Message rows must not double up ──────────────────────────────────────
// The screen builds message items from threads; the table rows exist for the
// email webhook. Showing both means every message appears twice.
assert.ok(
  /SYNTHESIZED_FROM_THREADS[\s\S]{0,120}filter\(/.test(activityTs),
  'activity.ts must filter thread-synthesized types out of the notification rows',
);
console.log('duplicate-message guard present');

// ── 3. The app must write what the web writes ───────────────────────────────
const notify = read(path.join(MOBILE, 'data/notify.ts'));
assert.ok(notify.includes('coach_follow'), 'notify.ts must distinguish coach_follow from follow');
assert.ok(!/text:|body:/.test(notify), 'message notifications must not carry message text');

const wired = [
  ['data/feed.ts', 'notifyNewFollow', 'follow'],
  ['data/messages.ts', 'notifyNewMessage', 'coach sends a message'],
  ['../app/(tabs)/messages.tsx', 'notifyNewMessage', 'player replies'],
  ['../app/(coach)/inbox.tsx', 'notifyNewMessage', 'coach replies'],
];
for (const [file, fn, what] of wired) {
  assert.ok(read(path.join(MOBILE, file)).includes(fn), `${what}: ${file} never calls ${fn}`);
}
console.log(`write parity wired at ${wired.length} sites`);

// ── 4. The web renders coach_follow too ─────────────────────────────────────
const webActivity = read(path.join(WEB, 'activity.html'));
assert.ok(
  webActivity.includes("n.type === 'coach_follow'"),
  "activity.html must render coach_follow — the follow email links here",
);
console.log('web renders coach_follow');

// ── 5. The email opt-out keys must agree on all four surfaces ───────────────
// The toggles are only real because one key name is shared by the player web
// page, the coach web page, both mobile screens and the edge function that
// reads the row. A rename in one place is a switch that silently stops working,
// which is indistinguishable from the bug this feature was built to fix.
const PLAYER_KEYS = ['notif_message', 'notif_coach_follow', 'notif_admin_message'];
const COACH_KEYS = ['notif_message', 'notif_admin_message'];

const surfaces = [
  [path.join(WEB, 'settings.html'), PLAYER_KEYS, 'web player settings'],
  [path.join(WEB, 'coach-settings.html'), COACH_KEYS, 'web coach settings'],
  [path.join(MOBILE, '../app/settings.tsx'), PLAYER_KEYS, 'mobile player settings'],
  [path.join(MOBILE, '../app/coach-settings.tsx'), COACH_KEYS, 'mobile coach settings'],
];
for (const [file, keys, what] of surfaces) {
  const src = read(file);
  for (const k of keys) assert.ok(src.includes(k), `${what}: no toggle for ${k}`);
  // A coach can never receive coach_follow — offering the switch implies an
  // email that will never arrive whatever they do with it.
  if (keys === COACH_KEYS) {
    assert.ok(!src.includes('notif_coach_follow'), `${what}: coaches can't receive coach_follow`);
  }
  // The two toggles that were never wired to anything.
  assert.ok(!/notif-photos|Photos Ready/.test(src), `${what}: "Photos Ready" has no backing email`);
  assert.ok(!/notif-events|Tournament Announcements/.test(src), `${what}: "Tournament Announcements" has no backing email`);
}
console.log(`pref keys agree across ${surfaces.length} settings screens`);

// Mobile has no runnable UI test here, so the round trip is asserted
// structurally instead: the screens must SELECT prefs on the way in and include
// prefs in the patch on the way out. A toggle that reads but never writes (or
// writes but never reads) looks fine on screen and loses the setting on reload.
for (const [file, what] of [
  ['data/settings.ts', 'player'],
  ['data/coach.ts', 'coach'],
]) {
  assert.ok(/prefs/.test(read(path.join(MOBILE, file))), `mobile ${what}: ${file} never selects prefs`);
}
for (const [file, what] of [
  ['../app/settings.tsx', 'player'],
  ['../app/coach-settings.tsx', 'coach'],
]) {
  assert.ok(/prefs: [pc]\.prefs/.test(read(path.join(MOBILE, file))), `mobile ${what}: save patch omits prefs`);
}
console.log('mobile reads and writes prefs on both screens');

// ── 6. Absent must mean ON, everywhere ──────────────────────────────────────
// Every existing account has none of these keys. Anything other than an
// explicit `false` has to keep sending, or one deploy unsubscribes the whole
// user base at once and nobody finds out until the support mail arrives.
for (const [file, , what] of surfaces) {
  assert.ok(
    /!== false|!= false|=== false \? false : true|prefDefaults/.test(read(file)),
    `${what}: must read a missing key as ON, not as off`,
  );
}
// The edge function is the half that actually suppresses mail. It lives outside
// both repos and is not tracked by git, so it may legitimately be absent.
const EDGE = path.join(WEB, '../../supabase/functions/notify-email/index.ts');
if (fs.existsSync(EDGE)) {
  const edge = read(EDGE);
  assert.ok(edge.includes("'prefs'") || edge.includes(', prefs'), 'notify-email must select prefs');
  assert.ok(
    /PREF_KEY\[record\.type\]\] === false/.test(edge),
    'notify-email must suppress on an explicit false ONLY (absent = send)',
  );
  for (const k of PLAYER_KEYS) assert.ok(edge.includes(k), `notify-email has no mapping for ${k}`);
  assert.ok(
    edge.includes('email_notifications === false'),
    'the email_notifications master switch must still be honoured',
  );
  console.log('edge function honours per-type prefs + master switch');
} else {
  console.log('edge function not present locally — per-type suppression NOT checked');
}

// ── 7. A player's phone must not reach another user ─────────────────────────
// Client-side half only; the server half is player_contact() in
// supabase-phase11-notification-prefs.sql, which this cannot see.
const sbData = read(path.join(WEB, 'sb-data.js'));
const contactFn = sbData.slice(sbData.indexOf('async function _sbPlayerContact'), sbData.indexOf('_sbUploadImage'));
assert.ok(!/phone/i.test(contactFn), '_sbPlayerContact must not map phone or parent_phone');
assert.ok(
  !/\['Phone'/.test(read(path.join(WEB, 'profile.html'))),
  "profile.html must not render a Phone row — other users can see the Info tab",
);
console.log('no player phone on the profile info tab');

console.log('\nall notification parity checks passed');
