import * as ImagePicker from 'expo-image-picker';

export type Picked = { uri: string; mime: string; kind: 'photo' | 'video'; durationMs?: number | null };

// Upload cap: no videos longer than 15 minutes may be added to the app.
export const MAX_VIDEO_MINUTES = 15;
const MAX_VIDEO_MS = MAX_VIDEO_MINUTES * 60 * 1000;

// Launch the OS media picker, requesting library permission first. Returns [] if
// the user cancels. `videos` allows video selection (Highlights); `multiple`
// permits picking several at once (Add Photos). Any picked video longer than the
// 15-minute cap is rejected with a clear error (callers catch + toast it).
export async function pickMedia(opts?: { videos?: boolean; multiple?: boolean }): Promise<Picked[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library access is needed to add media.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts?.videos ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts?.multiple,
    selectionLimit: opts?.multiple ? 10 : 1,
    quality: 0.85,
  });

  if (result.canceled) return [];
  const picked: Picked[] = (result.assets || []).map((a) => ({
    uri: a.uri,
    mime: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    kind: a.type === 'video' ? 'video' : 'photo',
    durationMs: a.duration ?? null,
  }));

  // Enforce the 15-minute video cap (duration is OS-reported, in ms; null = unknown → allow).
  const tooLong = picked.some((m) => m.kind === 'video' && m.durationMs != null && m.durationMs > MAX_VIDEO_MS);
  if (tooLong) throw new Error(`Videos must be ${MAX_VIDEO_MINUTES} minutes or shorter.`);

  return picked;
}
