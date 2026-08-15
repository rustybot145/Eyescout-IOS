import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { toast } from '../components/Overlays';

// ─────────────────────────────────────────────────────────────────────────────
// Store subscription plumbing — READ-ONLY as of 2026-08-15.
//
// EyeScout Sports Pro is no longer sold. This app buys nothing: `purchasePro`,
// `proPriceLabel` and `restorePro` are gone along with the paywall, and there is
// no code path left that can open Apple's purchase sheet.
//
// WHY THE REVENUECAT SDK IS STILL HERE, rather than ripped out:
//
//   1. People are still being charged. Anyone who subscribed before the switch
//      keeps renewing through Apple until THEY cancel — removing a product from
//      sale never cancels an existing subscriber. `isProEntitled()` is how the
//      app knows to show that person the cancel link, and
//      `openManageSubscription()` is the link. Deleting this file would leave a
//      paying user with no way out from inside the app, which is both hostile
//      and an Apple 3.1.2 problem.
//   2. `configurePurchases()` / `logOutPurchases()` are identity, not sales.
//      They stop one account's entitlement leaking to the next account on a
//      shared phone (the bug fixed in 4367bce). Still needed while any live
//      entitlement exists.
//   3. Pulling a native module out is a real native-build change. Keeping it
//      dormant costs nothing and makes turning Pro back on a UI job.
//
// The public SDK keys are safe in the binary — that is what they are for — and
// are read from app.json → expo.extra.
// ─────────────────────────────────────────────────────────────────────────────

export const PRO_ENTITLEMENT_ID = 'pro';

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

// Does the store still have a live subscription for this user?
//
// This no longer gates anything — access is free. Its only job now is to spot a
// LEGACY SUBSCRIBER: someone who bought Pro before the switch and whose Apple
// subscription is still renewing. Settings uses it to show that person the
// cancel link, and shows nothing to everyone else.
//
// Receipt-backed truth: RevenueCat validates the Apple receipt on their servers,
// so this reflects what Apple is actually still billing — not what our database
// happens to say.
//
// Never throws: any failure (offline, SDK not configured, Expo Go) reads as
// "no live subscription", which correctly shows the row to nobody.
export async function isProEntitled(): Promise<boolean> {
  if (!isIapAvailable()) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[PRO_ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

// Send the user to the store's own Manage Subscriptions page to cancel.
//
// There is no way to cancel an auto-renewing subscription from inside the app.
// Apple and Google both refuse to expose an API for it — cancellation happens in
// the store UI, on purpose, and Apple's Guideline 3.1.2 requires the app to link
// there. Anything we "cancelled" locally would be a lie: the card still gets
// charged next period.
//
// RevenueCat hands back the exact per-store URL (for Play it carries the sku and
// package, landing on THIS subscription rather than the generic list). The
// platform defaults are the fallback for when the SDK can't answer — Expo Go,
// offline, or a user whose purchase was made outside this device.
//
// Afterwards Apple/Google notify RevenueCat, which posts CANCELLATION to our
// webhook → `subscriptions.status = 'cancelled'` with `expires_at` untouched, so
// access correctly runs to the end of the paid period on both web and mobile.
export async function openManageSubscription(): Promise<void> {
  let url =
    Platform.OS === 'android'
      ? 'https://play.google.com/store/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions';

  if (isIapAvailable()) {
    try {
      const info = await Purchases.getCustomerInfo();
      if (info.managementURL) url = info.managementURL;
    } catch {
      // Keep the platform default — it reaches the right page either way.
    }
  }

  try {
    await Linking.openURL(url);
  } catch {
    toast('Could not open your store subscription settings', 'err');
  }
}
