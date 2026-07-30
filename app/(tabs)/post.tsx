// Placeholder route for the center "+" tab. The tab's press is intercepted in
// (tabs)/_layout.tsx to open the Create Post modal, so this never actually
// renders — it only exists so Expo Router can register the tab.
export default function PostTabPlaceholder() {
  return null;
}
