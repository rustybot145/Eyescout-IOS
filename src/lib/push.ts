import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

// Push notifications. Apple-side setup is EAS's problem, not ours: EAS manages
// the APNs auth key automatically on build, and Expo's push service is the only
// thing this app ever talks to directly — it proxies to APNs (and FCM on
// Android) so there's no direct Apple API integration in this codebase at all.
//
// This is a NATIVE module (expo-notifications has native code + an Info.plist
// entry via its config plugin in app.json), so it ships in a real build/
// TestFlight submission — it can't go out as an OTA update like the rest of
// this week's changes.

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
