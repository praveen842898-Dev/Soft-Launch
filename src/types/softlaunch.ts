export type ContentNiche =
  | 'Technology'
  | 'Education'
  | 'Business'
  | 'Finance'
  | 'Design'
  | 'Fitness'
  | 'Lifestyle'
  | 'Other';

export const CONTENT_NICHES: ContentNiche[] = [
  'Technology',
  'Education',
  'Business',
  'Finance',
  'Design',
  'Fitness',
  'Lifestyle',
  'Other',
];

export const CREATOR_GOALS: string[] = [
  'Post my first video',
  'Grow my personal brand',
  'Feel less awkward on camera',
  'Speak more clearly and concisely',
  'Build a consistent posting habit',
];

export const CONFIDENCE_LABELS: Record<number, { title: string; note: string }> = {
  1: {
    title: 'Camera-shy starter',
    note: 'I usually delete every take before anyone sees it.',
  },
  2: {
    title: 'Warming up',
    note: 'I can hit record, but hearing my own voice feels weird.',
  },
  3: {
    title: 'Getting there',
    note: 'Okay filming alone, still nervous about actually posting.',
  },
  4: {
    title: 'Mostly comfortable',
    note: 'Decent on camera, want tighter hooks and smoother pacing.',
  },
  5: {
    title: 'Ready to sharpen',
    note: 'Comfortable speaking, looking for honest delivery polish.',
  },
};

export interface UserProfile {
  niche: ContentNiche;
  goal: string;
  initialConfidence: number; // 1-5
  completedAt: string;
}

export type ReadinessLabel = 'Not ready yet' | 'Almost there' | 'Ready to launch';

export interface FillerWordEntry {
  word: string;
  count: number;
  timestamps: string[];
}

export interface SpeakingPace {
  approx_wpm: number;
  pace_label: string;
  pacing_notes: string;
}

export interface HookAnalysis {
  time_to_main_point_seconds: number;
  effectiveness_notes: string;
  rewritten_hook: string;
}

export interface CameraPresence {
  eye_contact_notes: string;
  facial_expressions_notes: string;
  body_language_and_posture_notes: string;
  is_ai_estimate_note: string;
}

export interface DeliveryDetails {
  energy_and_enthusiasm_notes: string;
  voice_clarity_notes: string;
}

export interface ContentStructure {
  opening_notes: string;
  middle_notes: string;
  close_and_cta_notes: string;
}

export interface ScoreBreakdown {
  confidence: number;
  clarity: number;
  pacing: number;
  hook: number;
  eye_contact: number;
  energy: number;
  structure: number;
  vibe_check_score: number;
}

export interface ImprovementItem {
  timestamp_range: string;
  start_seconds: number;
  what_happened: string;
  why_it_matters: string;
  concrete_fix: string;
}

export interface TipItem {
  title: string;
  advice: string;
}

export interface RetentionRiskMoment {
  timestamp: string;
  seconds: number;
  reason: string;
}

export interface LaunchEstimate {
  readiness_label: ReadinessLabel;
  summary: string;
  expected_retention_note: string;
}

export interface VideoAnalysis {
  video_summary: string;
  filler_words: FillerWordEntry[];
  speaking_pace: SpeakingPace;
  hook_analysis: HookAnalysis;
  camera_presence: CameraPresence;
  delivery_details: DeliveryDetails;
  content_structure: ContentStructure;
  overall_confidence_impression: string;
  scores: ScoreBreakdown;
  vibe_check_summary: string;
  strengths: string[];
  improvements: ImprovementItem[];
  focus_for_next_take: string;
  tips_and_tricks: TipItem[];
  retention_risk_moments: RetentionRiskMoment[];
  launch_estimate: LaunchEstimate;
}

export interface PracticeTake {
  id: string;
  takeNumber: number;
  createdAt: string;
  fileName: string;
  durationSeconds: number;
  topicNote: string;
  analysis: VideoAnalysis;
}

export interface ProgressVerdict {
  readiness_label: ReadinessLabel;
  headline: string;
  verdict_summary: string;
  biggest_win: string;
  final_nudge: string;
}

export type ScoreCategoryKey = Exclude<keyof ScoreBreakdown, 'vibe_check_score'>;

export const SCORE_CATEGORIES: { key: ScoreCategoryKey; label: string }[] = [
  { key: 'confidence', label: 'Confidence' },
  { key: 'clarity', label: 'Voice clarity' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'hook', label: 'Hook' },
  { key: 'eye_contact', label: 'Eye contact (AI est.)' },
  { key: 'energy', label: 'Energy' },
  { key: 'structure', label: 'Structure' },
];

export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const cleaned = ts.trim().split(/[–\-to]/)[0].trim();
  const parts = cleaned.split(':').map((p) => Number.parseInt(p.replace(/[^\d]/g, ''), 10));
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && !Number.isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const single = Number.parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(single) ? 0 : single;
}

export function totalFillerCount(analysis: VideoAnalysis): number {
  return (analysis.filler_words || []).reduce((sum, item) => sum + (item.count || 0), 0);
}
