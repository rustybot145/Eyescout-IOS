import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { toast } from '../components/Overlays';

// ─────────────────────────────────────────────────────────────────────────────
// EyeScout Sports Pro — Apple In-App Purchase (StoreKit) / Google Play Billing.
//
// Both stores REQUIRE digital subscriptions to go through their own billing —
// PayPal / web checkout is rejected on iOS and violates Play's Payments policy.
// RevenueCat (`react-native-purchases`) wraps StoreKit + Play Billing, validates
// receipts server-side, and fires a webhook we point at the same Supabase that
// already gates everything.
//
// This module is the single seam the UI talks to (`purchasePro`, `restorePro`).
//
// ── KEYS ────────────────────────────────────────────────────────────────────
// The RevenueCat *public* SDK keys are safe to ship in the binary (that is what
// they are for), but they differ per platform. They are read from app.json →
// expo.extra so a key rotation doesn't need a code change.
//
// ── GO LIVE (one-time, needs Ben's accounts) ────────────────────────────────
//   1. Play Console → Monetize → Subscriptions → create `eyescout_sports_pro_monthly`
//      ($15/mo). App Store Connect → same product id, auto-renewable.
//   2. RevenueCat → project → add BOTH apps → attach each store product to one
//      entitlement called `pro` → copy the two public SDK keys.
//   3. Paste them into app.json → expo.extra.revenueCatIosKey / revenueCatAndroidKey.
//   4. RevenueCat webhook → a Supabase function that writes the caller's
//      `subscriptions` row (status active). The DB paywall then unlocks Pro
//      automatically — same source of truth the web uses.
//
// Until step 3 is done, `isIapAvailable()` is false and the paywall says so
// instead of showing a button that silently fails.
// ─────────────────────────────────────────────────────────────────────────────

export const PRO_PRODUCT_ID = 'eyescout_sports_pro_monthly';
export const PRO_ENTITLEMENT_ID = 'pro';
// Display fallback only. `proPriceLabel()` returns the store's own localized
// price once RevenueCat is live — Play requires the real localized price.
export const PRO_PRICE_LABEL = '$15';

export type PurchaseResult = 'success' | 'cancelled' | 'unavailable' | 'error';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
const SDK_KEY = Platform.select({
  ios: extra.revenueCatIosKey,
  android: extra.revenueCatAndroidKey,
});

// Expo Go reports 'storeClient' and cannot load the billing native module. Real
// EAS builds report 'standalone' (store build) or 'bare' (dev client).
// A missing SDK key also counts as unavailable — better an honest "not available
// yet" than a purchase button that can never complete.
export function isIapAvailable(): boolean {
  return Constants.executionEnvironment !== 'storeClient' && !!SDK_KEY;
}

let configured = false;
// Which account the RevenueCat SDK currently believes it is. Tracked because
// configure() can only run once per process, so switching accounts has to go
// through logIn() instead.
let currentAppUserId: string | null = null;

// Called on every auth change. Configures once, then switches identity.
//
// This used to bail out whenever `configured` was true, which meant the SDK
// kept the FIRST account that signed in on this device for the rest of the
// process. Sign out, sign in as someone else, and RevenueCat still reported the
// first user's entitlements — so a second account on the same phone inherited
// Pro that it never paid for.
export async function configurePurchases(userId: string): Promise<void> {
  if (!isIapAvailable() || !userId) return;

  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    await Purchases.configure({ apiKey: SDK_KEY!, appUserID: userId });
    configured = true;
    currentAppUserId = userId;
    return;
  }

  if (currentAppUserId !== userId) {
    await Purchases.logIn(userId);
    currentAppUserId = userId;
  }
}

// Detach the device from the account on sign-out, so the next account starts
// anonymous instead of inheriting these entitlements. Must be called BEFORE the
// Supabase sign-out, while we still know who is leaving.
export async function logOutPurchases(): Promise<void> {
  if (!isIapAvailable() || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Throws if the current user is already anonymous — nothing to detach.
  }
  currentAppUserId = null;
}

// The store's localized price string (e.g. "£12.99"), falling back to the
// hardcoded label if the offering can't be read.
export async function proPriceLabel(): Promise<string> {
  if (!isIapAvailable()) return PRO_PRICE_LABEL;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages?.[0]?.product?.priceString || PRO_PRICE_LABEL;
  } catch {
    return PRO_PRICE_LABEL;
  }
}

// Kick off the native purchase sheet for Pro. Returns how it ended so the
// checkout screen can play the unlock reveal on success.
// Why the last purchase attempt failed, in words, for the UI to show inline.
// Every failure here used to report ONLY via toast(), and toasts fired from a
// screen presented with presentation:'modal' were invisible — so all four
// failure modes looked identical to a button that did nothing. The UI now shows
// this on the paywall itself, which cannot be swallowed by a presentation layer.
export let lastPurchaseError = '';

export async function purchasePro(): Promise<PurchaseResult> {
  lastPurchaseError = '';
  if (!isIapAvailable()) {
    // Distinguishes the two very different causes: running in Expo Go (no
    // billing module) vs a real build whose RevenueCat key never made it in.
    lastPurchaseError = SDK_KEY
      ? 'In-app purchases need a real build (not Expo Go).'
      : 'Store key missing from this build — RevenueCat is not configured.';
    toast(lastPurchaseError, 'err');
    return 'unavailable';
  }
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) {
      // The single most common setup miss: a product attached to an entitlement
      // but never put in an Offering marked Current, so `current` is empty.
      const all = Object.keys(offerings.all || {}).length;
      lastPurchaseError = all
        ? `Store returned ${all} offering(s) but none is set as Current in RevenueCat.`
        : 'Store returned no offerings. Check the RevenueCat Offering and the App Store Paid Applications agreement.';
      toast('Subscription unavailable right now', 'err');
      return 'unavailable';
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]) return 'success';
    // Bought, but the entitlement did not come back — almost always the
    // app-specific shared secret missing in RevenueCat, so the receipt can't
    // be validated.
    lastPurchaseError = 'Purchase completed but Pro did not unlock. Check the App-Specific Shared Secret in RevenueCat.';
    toast(lastPurchaseError, 'err');
    return 'error';
  } catch (e: any) {
    // RevenueCat sets userCancelled for a dismissed sheet — not an error state.
    if (e?.userCancelled) return 'cancelled';
    // RevenueCat puts the useful part in readableErrorCode and, for StoreKit
    // failures, underlyingErrorMessage — `message` is often empty, which is why
    // this read as a bare "could not be completed" with nothing to act on.
    const parts = [
      e?.readableErrorCode,
      e?.code != null ? `code ${e.code}` : null,
      e?.underlyingErrorMessage,
      e?.message,
    ].filter(Boolean);
    lastPurchaseError = parts.length
      ? String(parts.join(' · ')).slice(0, 300)
      : 'Purchase could not be completed (store gave no reason)';
    toast(lastPurchaseError, 'err');
    return 'error';
  }
}

// Does the store itself say this user is entitled to Pro right now?
//
// This is the receipt-backed truth: RevenueCat validates the Apple/Google receipt
// on THEIR servers and caches the verdict in the SDK, so a purchase unlocks the
// app the instant it completes — with no dependency on our webhook having landed
// yet. `fetchHasPro()` ORs this with the database answer, which is what keeps a
// paying user from staring at a paywall they already bought through.
//
// Never throws: any failure (offline, SDK not configured) reads as "not entitled"
// and we fall back to the DB, which is the durable cross-platform record.
export async function isProEntitled(): Promise<boolean> {
  if (!isIapAvailable()) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[PRO_ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

// Both stores REQUIRE a "Restore Purchases" path on every subscription paywall.
export async function restorePro(): Promise<PurchaseResult> {
  if (!isIapAvailable()) {
    toast('Subscriptions are not available in this build', 'err');
    return 'unavailable';
  }
  try {
    const info = await Purchases.restorePurchases();
    if (info.entitlements.active[PRO_ENTITLEMENT_ID]) return 'success';
    toast('Nothing to restore');
    return 'error';
  } catch {
    toast('Could not restore purchases', 'err');
    return 'error';
  }
}
