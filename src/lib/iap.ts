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

// Call once after the user logs in. Safe to call repeatedly.
export async function configurePurchases(userId: string): Promise<void> {
  if (!isIapAvailable() || configured) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  await Purchases.configure({ apiKey: SDK_KEY!, appUserID: userId || undefined });
  configured = true;
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
export async function purchasePro(): Promise<PurchaseResult> {
  if (!isIapAvailable()) {
    toast('Subscriptions are not available in this build', 'err');
    return 'unavailable';
  }
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) {
      toast('Subscription unavailable right now', 'err');
      return 'unavailable';
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] ? 'success' : 'error';
  } catch (e: any) {
    // RevenueCat sets userCancelled for a dismissed sheet — not an error state.
    if (e?.userCancelled) return 'cancelled';
    toast('Purchase could not be completed', 'err');
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
