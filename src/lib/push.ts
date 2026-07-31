import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

// Push notifications. Expo's push service is the only thing this app talks to
// directly — it proxies to APNs (and FCM on Android), so there is no direct
// Apple API integration in this codebase.
//
// This is a NATIVE module, so it ships in a real build/TestFlight submission —
// it can't go out as an OTA update.
//
// ⚠️  BUILDS FAIL UNTIL THE APP ID HAS PUSH ENABLED — READ THIS FIRST.
//
// Builds 10, 11 and 12 all failed at the Xcode step with:
//
//     Provisioning profile "...AppStore..." doesn't include the
//     Push Notifications capability / the aps-environment entitlement
//
// The App ID com.eyescoutsports.mobile has never had Push Notifications
// enabled, so no provisioning profile can carry `aps-environment`, which this
// package requires.
//
// Do NOT try to fix this by removing "expo-notifications" from app.json's
// plugins array — that was tried in build 12 and changed nothing. Expo SDK 57
// AUTO-APPLIES the config plugin of any installed package that ships one, so
// the entitlement is written whether or not it's listed. Verified with
// `npx expo config --type introspect`, which still reported
// `entitlements: { 'aps-environment': 'development' }` with the entry deleted.
// The only way to drop it is to uninstall the package outright.
//
// THE FIX (one step, ~60 seconds, and it must be done by an Apple account
// holder because enabling a capability requires an authenticated 2FA session):
//
//   developer.apple.com → Certificates, IDs & Profiles → Identifiers →
//   com.eyescoutsports.mobile → tick "Push Notifications" → Save
//
// That invalidates the stale profile, which is exactly what makes EAS generate
// a correct one on the next build. Nothing in this file or app.json needs to
// change, and the build then works non-interactively again.
//
// The server half (006_push_notifications.sql) is already live and starts
// delivering the moment real tokens land in push_tokens.

// Notifications that arrive while the app is OPEN still show a banner + sound —
// without this, foreground pushes are silently swallowed, which reads as "push
// doesn't work" during testing even when it does.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

// Ask for permission, grab the device's Expo push token, and save it against
// the signed-in user. Safe to call every launch — a stale token for the same
// device just gets overwritten (see the migration's upsert).
//
// Never throws: a denied permission or a simulator (no push capability) should
// degrade to "no push for this device," not break app startup.
export async function registerForPushNotifications(uid: string): Promise<void> {
  if (!Device.isDevice) return; // simulators/emulators have no push capability
  if (!projectId) return;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      { user_id: uid, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );
  } catch {
    // Permission dialogs, simulators without push entitlements, and offline
    // saves all land here — none of them should be fatal to app startup.
  }
}

// Drop this device's token on sign-out so a shared/resold device stops
// receiving a signed-out user's notifications.
export async function unregisterPushToken(uid: string): Promise<void> {
  try {
    if (!Device.isDevice || !projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('user_id', uid).eq('token', token);
  } catch {
    // Best-effort — a leftover token is a minor annoyance, not a crash.
  }
}

// Tapping a notification should open the relevant screen, not just the app.
// `data.screen` is set server-side per notification type (see the SQL
// migration) — this just maps that string to a route.
function routeForNotification(data: Record<string, unknown>): string | null {
  switch (data.screen) {
    case 'player-messages':
      return '/(tabs)/messages';
    case 'coach-inbox':
      return '/(coach)/inbox';
    case 'most-hyped':
      return '/(tabs)/feed';
    default:
      return null;
  }
}

// Wire tap-to-navigate. Call once near the root of the app (see app/_layout.tsx)
// — it needs the router, so it can't live at module scope like the functions
// above.
export function useNotificationRouting() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    // Cold start: the app was opened BY tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((res) => {
      const route = res && routeForNotification(res.notification.request.content.data || {});
      if (route) routerRef.current.push(route as any);
    });

    // Warm: the app was already running (foreground or background) when tapped.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const route = routeForNotification(res.notification.request.content.data || {});
      if (route) routerRef.current.push(route as any);
    });
    return () => sub.remove();
  }, []);
}
