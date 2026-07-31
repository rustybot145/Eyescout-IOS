import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptics, deliberately rationed.
//
// The failure mode with haptics is buzzing on EVERY tap until the whole app
// feels noisy and people turn the setting off. The rule used here: feedback
// fires when something CHANGED — a hype landed, a follow saved, a message sent,
// an error needs attention. Plain navigation (opening a tab, a profile, a
// story) stays silent, because nothing happened that the user needs confirmed.
//
// Every call is best-effort. Older Androids and any device with system haptics
// disabled will reject these; a failed buzz must never surface as an error.

const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

// The big one: hyping a post. Medium (not Light) so it reads as a real,
// satisfying "landed" — this is the app's signature interaction.
export const hapticHype = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

// Secondary confirmations: follow/unfollow, save-to-recruit-list, story tap
// through to the next item. Light so it never competes with the hype buzz.
export const hapticTap = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

// Something completed successfully — message sent, photo uploaded, profile
// saved, purchase unlocked.
export const hapticSuccess = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

// Something failed and the user has to react to it.
export const hapticError = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

// Destructive confirmation (delete account, block a user). Warning rather than
// Error: the action hasn't gone wrong, it just deserves a beat of hesitation.
export const hapticWarn = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

// Android's selection tick is far subtler than iOS's; using impact there
// instead keeps the two platforms feeling roughly equivalent.
export const hapticSelect = () =>
  safe(() =>
    Platform.OS === 'ios'
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  );
