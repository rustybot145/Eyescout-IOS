import { Linking, Platform } from 'react-native';
import { toast } from '../components/Overlays';

// ─────────────────────────────────────────────────────────────────────────────
// Store subscription plumbing — INERT as of 2026-08-25.
//
// EyeScout Sports is free. There is no paywall, no purchase, and no product.
// The RevenueCat SDK (`react-native-purchases`) has been REMOVED entirely, so
// StoreKit is no longer linked into the binary at all.
//
// WHY IT WAS REMOVED, when the earlier note here argued for keeping it:
//
//   That note said "people are still being charged" and the app therefore owed
//   legacy subscribers a cancel link under Guideline 3.1.2. On iOS that was
//   simply wrong. The app was never released and the subscription was never
//   approved — the App Store Connect API confirms it never left READY_TO_SUBMIT
//   — so there has never been a single Apple subscriber to owe anything to. The
//   PayPal subscribers on the website are a separate system RevenueCat never
//   touched.
//
//   Meanwhile App Review rejected the app three times under Guideline 2.1(b)
//   for an in-app purchase it could not find in the binary. Shipping a binary
//   that links StoreKit while offering nothing to buy is the ambiguity at the
//   centre of that. With the SDK gone there is no purchase machinery to find.
//
// The four exports below are kept as no-ops so the three call sites — auth.ts,
// app/_layout.tsx and app/settings.tsx — stay exactly as they were. If Pro ever
// comes back, reinstate the SDK behind these same signatures.
// ─────────────────────────────────────────────────────────────────────────────

/** No-op. Kept so auth-change handlers don't need to know the SDK is gone. */
export async function configurePurchases(_userId: string): Promise<void> {}

/** No-op. There is no store identity to detach on sign-out. */
export async function logOutPurchases(): Promise<void> {}

/**
 * Always false — there are no Apple subscribers and no way to become one.
 * Settings uses this to decide whether to show the legacy cancel row; false
 * means it shows to nobody, which is correct.
 */
export async function isProEntitled(): Promise<boolean> {
  return false;
}

/**
 * Send the user to the store's own Manage Subscriptions page.
 *
 * Unreachable while `isProEntitled()` returns false, but kept working: it needs
 * no SDK, only the platform's standard URL. If Pro ever returns, this is already
 * the Guideline 3.1.2 cancel link.
 */
export async function openManageSubscription(): Promise<void> {
  const url =
    Platform.OS === 'android'
      ? 'https://play.google.com/store/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions';
  try {
    await Linking.openURL(url);
  } catch {
    toast('Could not open your store subscription settings', 'err');
  }
}
