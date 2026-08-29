// Guards that no in-app-purchase machinery comes back into the binary.
//
// Replaces iap-identity.js, whose premise no longer exists. That file guarded a
// bug where one account's RevenueCat entitlement leaked to the next account on a
// shared phone. There are no entitlements now: `react-native-purchases` was
// removed on 2026-08-25 and StoreKit is no longer linked at all.
//
// Why this matters enough to test: App Review rejected version 1.0 three times
// under Guideline 2.1(b) for an in-app purchase it could not find in the binary.
// A binary that links StoreKit while selling nothing is the ambiguity at the
// centre of that. Re-adding the SDK casually would reintroduce it.
//
//   node src/lib/__tests__/iap-absent.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── 1. The SDK must stay out of the build ───────────────────────────────────
const pkg = JSON.parse(read('package.json'));
assert.ok(
  !pkg.dependencies['react-native-purchases'],
  'react-native-purchases must not be a dependency — linking StoreKit into an app ' +
    'that sells nothing is what Guideline 2.1(b) kept rejecting',
);

const iap = read('src/lib/iap.ts');
assert.ok(
  !/from 'react-native-purchases'/.test(iap),
  'iap.ts must not import react-native-purchases',
);
assert.ok(
  !/\bPurchases\./.test(iap),
  'iap.ts must not call the Purchases SDK',
);

const appJson = JSON.parse(read('app.json'));
assert.ok(
  !JSON.stringify(appJson).includes('revenueCat'),
  'app.json must not carry RevenueCat SDK keys',
);
assert.ok(
  !(appJson.expo.android?.permissions || []).includes('com.android.vending.BILLING'),
  'the Android BILLING permission must be gone — Play questions a billing ' +
    'permission on an app that sells nothing',
);
console.log('no purchase SDK in the binary');

// ── 2. The call sites must keep working ─────────────────────────────────────
// iap.ts keeps its four exports as no-ops precisely so auth.ts, _layout.tsx and
// settings.tsx did not have to change. If an export goes missing they break.
for (const fn of ['configurePurchases', 'logOutPurchases', 'isProEntitled', 'openManageSubscription']) {
  assert.ok(
    iap.includes(`export async function ${fn}`),
    `iap.ts must keep exporting ${fn}() — three screens import it`,
  );
}
assert.ok(
  /apps\.apple\.com\/account\/subscriptions/.test(iap),
  'openManageSubscription must still point at the store page — it needs no SDK, ' +
    'and it is the Guideline 3.1.2 cancel link if Pro ever returns',
);
console.log('call sites intact: four exports still present');

// ── 3. Every sign-out still goes through the shared helper ──────────────────
// Unchanged from the original test and still worth keeping: a screen calling
// supabase.auth.signOut() directly skips whatever signOutEverywhere does, which
// is how the entitlement-leak bug happened in the first place.
const auth = read('src/lib/auth.ts');
assert.ok(
  auth.includes('export async function signOutEverywhere'),
  'auth.ts must expose signOutEverywhere()',
);

const offenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name) && fs.readFileSync(full, 'utf8').includes('supabase.auth.signOut(')) {
      offenders.push(path.relative(ROOT, full));
    }
  }
})(path.join(ROOT, 'app'));

assert.deepStrictEqual(
  offenders, [],
  'these screens sign out directly instead of via signOutEverywhere:\n  ' + offenders.join('\n  '),
);
console.log('all sign-out paths route through signOutEverywhere');

console.log('\nall IAP-absence checks passed');
