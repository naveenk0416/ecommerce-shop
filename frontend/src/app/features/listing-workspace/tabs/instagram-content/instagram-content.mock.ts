import { FieldSection } from '../../models/field-section.model';
import { SeoCheck } from '../../ui/seo-score-card/seo-score.util';

/** Field layout for the Instagram tab — shared by the AI-driven /optimize variant. */
export const INSTAGRAM_CONTENT_SECTIONS: readonly FieldSection[] = [
  {
    title: 'Post Content',
    icon: 'photo_camera',
    description: 'Caption and call-to-action for your Instagram post.',
    fields: [
      { key: 'caption', label: 'Caption', maxLength: 2200, multiline: true },
      { key: 'cta', label: 'Call to Action', maxLength: 120 },
      { key: 'reelHook', label: 'Suggested Reel Hook', maxLength: 150 },
      { key: 'bestPostingTime', label: 'Best Posting Time', maxLength: 60 },
    ],
  },
  {
    title: 'Hashtags',
    icon: 'tag',
    description: 'Hashtag sets to maximize reach and discoverability.',
    fields: [
      { key: 'hashtags', label: 'Hashtags (max 20)', maxLength: 600, multiline: true },
      { key: 'trendingHashtags', label: 'Trending Hashtags', maxLength: 300, multiline: true },
    ],
  },
];

/** Deterministic checks used to score AI-generated Instagram content on /optimize. */
export const INSTAGRAM_SEO_CHECKS: readonly SeoCheck[] = [
  { label: 'Caption present', test: (get) => get('caption').length >= 40 },
  { label: 'Call to action included', test: (get) => get('cta').length > 0 },
  { label: 'Reel hook suggested', test: (get) => get('reelHook').length > 0 },
  { label: 'Posting time suggested', test: (get) => get('bestPostingTime').length > 0 },
  // Instagram allows at most 30 per post; 10–20 focused hashtags is the target.
  { label: '10–20 unique hashtags', test: (get) => { const n = get('hashtags').split(/\s+/).filter((h) => h.startsWith('#')).length; return n >= 10 && n <= 20; } },
];
