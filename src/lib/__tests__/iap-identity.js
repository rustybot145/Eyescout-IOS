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

// ── 2. Every sign-out must go through the shared helper ─────────────────────
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
