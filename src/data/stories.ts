import { supabase } from '../lib/supabase';

// Story rules, ported from the web portal (feed.html). Two separate clocks, and
// conflating them is what made the mobile story row feel like it never expired:
//
//   • A PLAYER's story ring holds only their posts from the last 24 HOURS.
//     (feed.html → getFollowedStoryPlayers / openPlayerStory, both cut at 24h.)
//
//   • The MOST HYPED ring is a FROZEN WEEKLY WINNER. Every Monday 12:00 AM
//     Phoenix time the top hyped-that-week post is locked in and held all week,
//     regardless of what happens to hype counts afterward.
//     (feed.html → mostHypedRingsHTML, backed by get_weekly_hype_winners().)

export const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WeeklyWinner = {
  category: string; // 'global', or a lowercased sport name
  postId: string | null;
  weekStart: string;
  hypeCount: number;
};

// The instant the current week began: Monday 00:00 in Phoenix.
//
// Arizona does not observe daylight saving, so Phoenix is UTC-7 all year and
// the reset is simply Monday 07:00 UTC — no timezone library needed, and no
// twice-a-year drift where the reset silently moves by an hour.
export function currentWeekStart(now: Date = new Date()): Date {
  const phoenix = new Date(now.getTime() - 7 * 3600_000);
  const daysSinceMonday = (phoenix.getUTCDay() + 6) % 7; // getUTCDay: 0 = Sunday
  const midnightMonday = Date.UTC(
    phoenix.getUTCFullYear(),
    phoenix.getUTCMonth(),
    phoenix.getUTCDate() - daysSinceMonday
  );
  return new Date(midnightMonday + 7 * 3600_000); // back to a real UTC instant
}

// This week's frozen winners, straight from the same RPC the web reads.
// Returns null when the RPC isn't deployed — callers fall back rather than
// error, matching _sbWeeklyHypeWinners() in the web's sb-data.js.
export async function fetchWeeklyHypeWinners(): Promise<WeeklyWinner[] | null> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_hype_winners');
    if (error || !Array.isArray(data)) return null;
    return data.map((r: any) => ({
      category: r.category,
      postId: r.post_id ?? null,
      weekStart: r.week_start,
      hypeCount: r.hype_count || 0,
    }));
  } catch {
    return null;
  }
}
