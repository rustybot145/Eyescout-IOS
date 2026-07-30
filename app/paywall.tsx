import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PaywallScreen } from '../src/components/Paywall';

// The full "GET RECRUITED" paywall, presented as a pop-up modal. It's the exact
// same PaywallScreen shown full-screen on the gated tabs (Activity, Scout, …);
// the compact "Upgrade to Pro" CTAs (feed card, coach news card, profile/settings
// rows) route here so tapping upgrade always opens the full sell page. The page's
// own "Upgrade to Pro" button runs the native Apple purchase.
export default function PaywallModal() {
  const router = useRouter();
  const { role, from } = useLocalSearchParams<{ role?: string; from?: string }>();
  const isSignup = from === 'signup'; // opened by the end of the signup quiz
  return (
    <PaywallScreen
      role={role === 'coach' ? 'coach' : 'player'}
      welcome={isSignup ? "You're in — your profile is live" : undefined}
      onClose={isSignup ? () => router.replace('/(tabs)/profile') : () => router.back()}
    />
  );
}
