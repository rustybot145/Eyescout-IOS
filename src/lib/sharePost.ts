import { Share } from 'react-native';
import { toast } from '../components/Overlays';

// Tap-to-share for a feed post.
//
// Ben's call (2026-07-30): share the plain site URL rather than a per-post link.
// So there is deliberately NO create_share_link RPC call here — nothing to mint,
// nothing to wait for, and none of the "link couldn't be created" failure modes.
// The share sheet opens instantly.
//
// The per-post machinery still exists server-side and is fully deployed
// (create_share_link / shared_post RPCs + the web's share.html), so switching
// back is a small change here rather than a rebuild: mint a token, then send
// `https://eyescoutsports.com/social-app/share.html?s=<token>` instead.
//
// postId is kept in the signature for exactly that reason — the call sites
// already pass it.
const SHARE_URL = 'https://eyescoutsports.com';
const SHARE_TEXT = 'Check out this highlight on EyeScout';

export async function sharePost(_postId: string): Promise<void> {
  try {
    // iOS puts `url` in its own field so apps can render a link preview;
    // Android only reads `message`, hence the URL in both.
    await Share.share(
      { message: `${SHARE_TEXT} ${SHARE_URL}`, url: SHARE_URL },
      { subject: 'A highlight on EyeScout' }
    );
  } catch {
    toast('Could not open the share sheet', 'err');
  }
}
