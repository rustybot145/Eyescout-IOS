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

console.log('\nall notification parity checks passed');
