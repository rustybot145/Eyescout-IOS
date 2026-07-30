import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  BarlowCondensed_400Regular,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';

// The web uses Impact for headings and 'Arial Narrow' for the .cond class
// (tabs, role toggle, labels, button text). Neither is bundleable/free, so we
// substitute Anton (~Impact) and Barlow Condensed (~Arial Narrow) — the same
// brand-approved substitutes used across the platform.
export const fonts = {
  display: 'Anton_400Regular', //   ~ Impact
  cond: 'BarlowCondensed_600SemiBold', //   ~ Arial Narrow (semibold)
  condBold: 'BarlowCondensed_700Bold', //   ~ Arial Narrow (bold/black)
  condRegular: 'BarlowCondensed_400Regular',
} as const;

export function useAppFonts() {
  return useFonts({
    Anton_400Regular,
    BarlowCondensed_400Regular,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
}
