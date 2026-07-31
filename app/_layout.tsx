import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAppFonts } from '../src/theme/fonts';
import { colors } from '../src/theme/colors';
import { OverlayHost } from '../src/components/Overlays';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { supabase } from '../src/lib/supabase';
import { configurePurchases } from '../src/lib/iap';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // RevenueCat needs the signed-in user id so entitlements follow the account
  // across devices (and so "Restore Purchases" can find them). No-ops until the
  // SDK keys are set in app.json → extra.
  useEffect(() => {
    const apply = (userId?: string) => {
      if (userId) configurePurchases(userId).catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      apply(session?.user?.id)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <ErrorBoundary>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(coach)" />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="coach-settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="coach-pending" />
            <Stack.Screen name="player/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="create-post" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        </ErrorBoundary>
        <OverlayHost />
      </View>
    </SafeAreaProvider>
  );
}
