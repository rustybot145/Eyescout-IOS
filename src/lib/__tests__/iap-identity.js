// Guards against Pro leaking between accounts on one device.
//
// The bug: configurePurchases() bailed out whenever it had already run, so the
// RevenueCat SDK kept the FIRST account to sign in for the whole process. Log
// out, log in as someone else, and the second account inherited the first one's
// entitlements. Nothing called Purchases.logOut() either, so signing out left
// the device still attached to the paying account.
//
// These are structural checks: the failure was an absent call, and absent calls
// are what a new screen or a refactor reintroduces.
//
//   node src/lib/__tests__/iap-identity.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── 1. Switching accounts must switch RevenueCat identity ───────────────────
const iap = read('src/lib/iap.ts');

assert.ok(
  iap.includes('Purchases.logIn('),
  'configurePurchases must call Purchases.logIn() — configure() only works once per process, ' +
    'so without it a second account keeps the first account\'s entitlements',
);
assert.ok(
  /currentAppUserId !== userId/.test(iap),
  'the switch must be guarded on the user actually changing',
);
assert.ok(
  iap.includes('export async function logOutPurchases'),
  'a logOut path must exist so sign-out detaches the device from the account',
);
assert.ok(
  iap.includes('Purchases.logOut()'),
  'logOutPurchases must actually call Purchases.logOut()',
);
console.log('identity switch + logout present in iap.ts');

// ── 2. Cancelling must go to the store, never fake it locally ───────────────
// Apple requires a link to Manage Subscriptions (3.1.2) and gives no API to
// cancel in-app. Writing status='cancelled' ourselves would stop billing in our
// UI while the card kept getting charged.
assert.ok(
  iap.includes('export async function openManageSubscription'),
  'iap.ts must expose openManageSubscription()',
);
assert.ok(
  /managementURL/.test(iap) && /apps\.apple\.com\/account\/subscriptions/.test(iap),
  'cancel must open the store page — RevenueCat managementURL with a platform fallback',
);

const settings = read('app/settings.tsx');
assert.ok(
  settings.includes('openManageSubscription'),
  'settings must offer the cancel path — it is the only place a user can reach it',
);
// Since 2026-08-15 nothing is sold, but people who subscribed BEFORE that are
// still being billed by Apple until they cancel. The row that tells them so is
// the only thing standing between them and a silent recurring charge for a
// product everyone else now gets free — so it stays tested.
assert.ok(
  settings.includes('<LegacySubscriptionRow'),
  'settings must render LegacySubscriptionRow — without it a legacy subscriber has no in-app way to cancel',
);
// Placement, checked in RENDER order — the component is declared below the
// screen, so raw source positions say nothing about where it appears.
assert.ok(
  settings.indexOf('<LegacySubscriptionRow') < settings.indexOf('Profile Photo'),
  'the legacy-subscriber notice belongs above the Profile Photo section, not buried at the bottom',
);
const legacyRow = settings.slice(settings.indexOf('function LegacySubscriptionRow'));
assert.ok(
  legacyRow.indexOf("You're still subscribed") < legacyRow.indexOf('Cancel Subscription'),
  'the cancel button belongs under the explanation, not above it',
);
// It must key off the STORE, not our database: the subscriptions row can be
// stale or missing while Apple is still charging.
assert.ok(
  /isProEntitled\(\)/.test(legacyRow) && !/getSubscription\(/.test(legacyRow),
  'the row must read the store entitlement (isProEntitled), not the database row',
);
// And it must show for nobody else — every non-subscriber sees no trace of Pro.
assert.ok(
  /if \(!stillSubscribed\) return null;/.test(legacyRow),
  'the row must render nothing at all for users with no live subscription',
);
// Nothing in the app may write a subscription status — only the webhook may.
assert.ok(
  !/from\('subscriptions'\)[\s\S]{0,80}\.(update|upsert|insert)/.test(settings),
  'the app must never write subscriptions itself; the store is the source of truth',
);
console.log('legacy-subscriber cancel path intact: store-driven, above Profile Photo');

// ── 3. Every sign-out must go through the shared helper ─────────────────────
const auth = read('src/lib/auth.ts');
assert.ok(
  auth.includes('export async function signOutEverywhere'),
  'auth.ts must expose signOutEverywhere()',
);
assert.ok(
  auth.indexOf('logOutPurchases') < auth.indexOf('supabase.auth.signOut'),
  'RevenueCat must be detached BEFORE the Supabase sign-out, while the user is still known',
);

// No screen may sign out directly — that is how the RevenueCat step gets skipped.
const appDir = path.join(ROOT, 'app');
const offenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      if (fs.readFileSync(full, 'utf8').includes('supabase.auth.signOut(')) {
        offenders.push(path.relative(ROOT, full));
      }
    }
  }
})(appDir);

assert.deepStrictEqual(
  offenders, [],
  'these screens sign out directly and so skip the RevenueCat detach:\n  ' + offenders.join('\n  '),
);
console.log('all sign-out paths route through signOutEverywhere');

console.log('\nall IAP identity checks passed');
