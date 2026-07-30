import { supabase } from '../lib/supabase';

// A reported post — written to the SAME `reports` table the admin panel reviews.
// Row shape matches the web's _reportToRow / _sbSaveReport, so a report filed
// from the app is indistinguishable from one filed on the web. No schema change.

export const REPORT_REASONS = [
  "It's spam",
  'Nudity or sexual content',
  'Harassment or bullying',
  'Violence or dangerous content',
  'Hate speech or symbols',
  'False information',
  'Scam or fraud',
  'Something else',
];

export type ReportTarget = {
  postId: string;
  authorId: string;
  authorName: string;
  caption: string;
  mediaData: string;
  type: 'photo' | 'video';
};

export type Reporter = { id: string; name: string; role: string };

export async function submitReport(target: ReportTarget, reason: string, reporter: Reporter): Promise<void> {
  const row = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    post_id: target.postId,
    author_id: target.authorId || null,
    author_name: target.authorName || null,
    caption: target.caption || null,
    media_data: target.mediaData || null,
    media_type: target.type || 'photo',
    reason,
    reporter_id: reporter.id || null,
    reporter_name: reporter.name || null,
    reporter_role: reporter.role || 'player',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  await supabase.from('reports').upsert(row);
}
