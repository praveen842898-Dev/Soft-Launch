import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock,
  Eye,
  Film,
  Info,
  Lightbulb,
  Minus,
  Play,
  Sparkles,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ContentNiche,
  PracticeTake,
  SCORE_CATEGORIES,
  formatSeconds,
  parseTimestampToSeconds,
  totalFillerCount,
} from '../types/softlaunch';
import { getVideoBlob } from '../lib/storage';
import { ReadinessText } from './ReadinessText';

interface ReportScreenProps {
  take: PracticeTake;
  previousTake: PracticeTake | null;
  niche: ContentNiche;
  onBack: () => void;
  onUploadNext: () => void;
  onDelete: (takeId: string) => void;
}

interface TimelineMoment {
  id: string;
  seconds: number;
  label: string;
  kind: 'Improvement' | 'Retention risk' | 'Hook' | 'Filler word';
  title: string;
  detail: string;
}

function VibeRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const ringColor =
    clamped >= 78 ? '#16A34A' : clamped >= 62 ? '#D97706' : '#DC2626';

  return (
    <div className="relative w-36 h-36 sm:w-40 sm:h-40 shrink-0 flex items-center justify-center">
      <svg
        className="w-full h-full -rotate-90"
        viewBox="0 0 132 132"
        aria-label={`Vibe Check score ${clamped} out of 100`}
      >
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke="#E8EEF5"
          strokeWidth="9"
        />
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-4xl font-semibold tracking-tight text-[#0F172A] tabular-nums leading-none">
          {clamped}
        </span>
        <span className="text-[11px] font-medium text-[#526075] mt-1">
          out of 100
        </span>
      </div>
    </div>
  );
}

export function ReportScreen({
  take,
  previousTake,
  niche,
  onBack,
  onUploadNext,
  onDelete,
}: ReportScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [activeSeekNote, setActiveSeekNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { analysis } = take;
  const fillerTotal = totalFillerCount(analysis);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setVideoUrl(null);
    setVideoLoaded(false);

    getVideoBlob(take.id).then((blob) => {
      if (!active) return;
      if (blob) {
        createdUrl = URL.createObjectURL(blob);
        setVideoUrl(createdUrl);
      }
      setVideoLoaded(true);
    });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [take.id]);

  function seekTo(seconds: number, label: string) {
    const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    setActiveSeekNote(`Jumped to ${label}`);

    if (videoRef.current) {
      videoRef.current.currentTime = safeSec;
      videoRef.current.play().catch(() => {});
    }

    // On mobile / narrow viewports, smoothly bring the player into view
    if (window.innerWidth < 1024 && playerContainerRef.current) {
      playerContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const timelineMoments = useMemo<TimelineMoment[]>(() => {
    const items: TimelineMoment[] = [];

    if (analysis.hook_analysis) {
      const sec = Math.max(0, analysis.hook_analysis.time_to_main_point_seconds || 0);
      items.push({
        id: 'hook-point',
        seconds: sec,
        label: formatSeconds(sec),
        kind: 'Hook',
        title: `Main point lands around ${formatSeconds(sec)}`,
        detail: analysis.hook_analysis.effectiveness_notes,
      });
    }

    (analysis.improvements || []).forEach((imp, idx) => {
      const sec =
        typeof imp.start_seconds === 'number' && Number.isFinite(imp.start_seconds)
          ? imp.start_seconds
          : parseTimestampToSeconds(imp.timestamp_range);
      items.push({
        id: `imp-${idx}`,
        seconds: sec,
        label: imp.timestamp_range || formatSeconds(sec),
        kind: 'Improvement',
        title: imp.what_happened,
        detail: imp.concrete_fix,
      });
    });

    (analysis.retention_risk_moments || []).forEach((risk, idx) => {
      const sec =
        typeof risk.seconds === 'number' && Number.isFinite(risk.seconds)
          ? risk.seconds
          : parseTimestampToSeconds(risk.timestamp);
      items.push({
        id: `risk-${idx}`,
        seconds: sec,
        label: risk.timestamp || formatSeconds(sec),
        kind: 'Retention risk',
        title: 'Viewer drop-off risk',
        detail: risk.reason,
      });
    });

    return items.sort((a, b) => a.seconds - b.seconds);
  }, [analysis]);

  const sortedFillers = useMemo(() => {
    return [...(analysis.filler_words || [])]
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [analysis.filler_words]);

  const maxFillerCount = sortedFillers.length > 0 ? sortedFillers[0].count : 1;

  const overallDelta = previousTake
    ? analysis.scores.vibe_check_score - previousTake.analysis.scores.vibe_check_score
    : null;

  const dateLabel = new Date(take.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Top breadcrumb & metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3 -ml-3 rounded-xl text-sm font-medium text-[#526075] hover:text-[#0F172A] hover:bg-[#E8EEF5] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <ArrowLeft size={16} />
          <span>All takes</span>
        </button>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526075]">
          <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
            Take #{take.takeNumber}
          </span>
          <span aria-hidden="true">·</span>
          <span>{dateLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{formatSeconds(take.durationSeconds)}</span>
          <span aria-hidden="true">·</span>
          <span>Private</span>
        </div>
      </div>

      {/* Main responsive 2-column layout: Sticky video player left on desktop, full report right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left column: Private video player + Quick stats */}
        <div
          ref={playerContainerRef}
          className="lg:col-span-5 lg:sticky lg:top-20 space-y-4 scroll-mt-6"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-3xl overflow-hidden">
            <div className="bg-[#11151B] relative">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  className="w-full max-h-[420px] object-contain mx-auto"
                />
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center p-6 text-center text-[#A0AAB8] space-y-2">
                  <Film size={24} />
                  <p className="text-xs">
                    {videoLoaded
                      ? 'Video preview is no longer cached in this browser session, but your full report is saved.'
                      : 'Loading your private video...'}
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-[#526075]">
                <span className="truncate font-medium text-[#0F172A]">
                  {take.topicNote || take.fileName}
                </span>
                {activeSeekNote && (
                  <span className="font-mono text-[#1D4ED8] shrink-0 tabular-nums">
                    {activeSeekNote}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-[#526075] leading-relaxed">
                {analysis.video_summary}
              </p>

              <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-3 gap-3 text-left">
                <div>
                  <p className="text-[11px] text-[#526075]">Speaking pace</p>
                  <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    ~{analysis.speaking_pace.approx_wpm} wpm
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#526075]">Hook timing</p>
                  <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    {analysis.hook_analysis.time_to_main_point_seconds}s in
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#526075]">Filler words</p>
                  <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                    {fillerTotal} total
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Highlighted Focus for Next Take also visible in left rail on desktop */}
          <div className="hidden lg:block bg-[#EFF6FF] border border-[#BFDBFE] rounded-3xl p-6 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8]">
              <Target size={15} aria-hidden="true" />
              <span>Your focus for the next take</span>
            </div>
            <p className="text-[15px] font-medium text-[#0F172A] leading-relaxed">
              {analysis.focus_for_next_take}
            </p>
          </div>
        </div>

        {/* Right column: Full Coaching Report */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Top: Your Vibe Check */}
          <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <VibeRing score={analysis.scores.vibe_check_score} />

              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs font-semibold text-[#526075]">
                    Your Vibe Check
                  </span>
                  <span aria-hidden="true" className="text-[#D0D5DD]">·</span>
                  <ReadinessText label={analysis.launch_estimate.readiness_label} />
                </div>

                <h1 className="font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight text-[#0F172A] leading-snug">
                  &ldquo;{analysis.vibe_check_summary}&rdquo;
                </h1>

                {overallDelta !== null && (
                  <p className="text-xs font-mono tabular-nums text-[#526075]">
                    {overallDelta > 0
                      ? `+${overallDelta} points higher than Take #${previousTake?.takeNumber}`
                      : overallDelta < 0
                        ? `${overallDelta} points vs Take #${previousTake?.takeNumber} — totally normal while experimenting`
                        : `Same overall score as Take #${previousTake?.takeNumber}`}
                  </p>
                )}

                <p className="text-sm text-[#526075] leading-relaxed">
                  {analysis.overall_confidence_impression}
                </p>
              </div>
            </div>
          </section>

          {/* 2. What you nailed & What to work on */}
          <section className="grid grid-cols-1 gap-6">
            {/* What you nailed */}
            <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-4">
              <h2 className="font-display text-xl font-bold text-[#0F172A]">
                What you nailed
              </h2>
              <ul className="space-y-3">
                {(analysis.strengths || []).map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm sm:text-[15px] text-[#0F172A] leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* What to work on */}
            <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-5">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-xl font-bold text-[#0F172A]">
                  What to work on
                </h2>
                <span className="text-xs text-[#526075]">Tap a timestamp to jump</span>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                {(analysis.improvements || []).map((item, idx) => {
                  const seekSec =
                    typeof item.start_seconds === 'number'
                      ? item.start_seconds
                      : parseTimestampToSeconds(item.timestamp_range);

                  return (
                    <div key={idx} className="py-5 first:pt-0 last:pb-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => seekTo(seekSec, item.timestamp_range)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#EFF6FF] text-[#0F172A] hover:text-[#1D4ED8] font-mono text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Play size={11} className="fill-current" />
                          <span>{item.timestamp_range}</span>
                        </button>
                        <p className="text-sm sm:text-[15px] font-semibold text-[#0F172A]">
                          {item.what_happened}
                        </p>
                      </div>

                      <p className="text-sm text-[#526075] leading-relaxed">
                        <span className="font-medium text-[#0F172A]">Why it matters: </span>
                        {item.why_it_matters}
                      </p>

                      <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm text-[#0F172A] leading-relaxed">
                        <span className="font-semibold text-[#1D4ED8]">Try this next time: </span>
                        {item.concrete_fix}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 3. Timestamped moments list */}
          {timelineMoments.length > 0 && (
            <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-xl font-bold text-[#0F172A]">
                  Timestamped moments
                </h2>
                <span className="text-xs text-[#526075]">Click any moment to play</span>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                {timelineMoments.map((moment) => (
                  <button
                    key={moment.id}
                    type="button"
                    onClick={() => seekTo(moment.seconds, moment.label)}
                    className="w-full text-left py-4 first:pt-1 last:pb-1 hover:bg-[#F7F9FC] -mx-3 px-3 rounded-xl transition-colors flex items-start gap-4 min-h-[56px] group"
                  >
                    <span className="font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums pt-0.5 inline-flex items-center gap-1.5 shrink-0 w-24">
                      <Play size={11} className="fill-current opacity-80 group-hover:opacity-100" />
                      <span>{moment.label}</span>
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#526075]">
                        <span className="font-medium text-[#0F172A]">{moment.kind}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{moment.title}</span>
                      </div>
                      <p className="text-sm text-[#526075] leading-relaxed">
                        {moment.detail}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 4. Score breakdown with horizontal bars & +/- arrows vs previous take */}
          <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-[#0F172A]">
                Score breakdown
              </h2>
              <span className="text-xs text-[#526075]">
                {previousTake
                  ? `Compared to Take #${previousTake.takeNumber}`
                  : 'Baseline take (0–100)'}
              </span>
            </div>

            <div className="space-y-4">
              {SCORE_CATEGORIES.map(({ key, label }) => {
                const value = Math.max(0, Math.min(100, Math.round(analysis.scores[key] ?? 0)));
                const prevVal = previousTake
                  ? Math.round(previousTake.analysis.scores[key] ?? 0)
                  : null;
                const delta = prevVal !== null ? value - prevVal : null;

                const barColor =
                  value >= 78
                    ? 'bg-[#16A34A]'
                    : value >= 62
                      ? 'bg-[#D97706]'
                      : 'bg-[#DC2626]';

                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[#0F172A]">{label}</span>
                      <div className="flex items-center gap-2.5 font-mono tabular-nums">
                        {delta !== null && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                              delta > 0
                                ? 'text-[#15803D]'
                                : delta < 0
                                  ? 'text-[#DC2626]'
                                  : 'text-[#526075]'
                            }`}
                          >
                            {delta > 0 ? (
                              <ArrowUp size={12} aria-hidden="true" />
                            ) : delta < 0 ? (
                              <ArrowDown size={12} aria-hidden="true" />
                            ) : (
                              <Minus size={12} aria-hidden="true" />
                            )}
                            <span>{delta > 0 ? `+${delta}` : delta}</span>
                          </span>
                        )}
                        <span className="font-semibold text-[#0F172A] w-8 text-right">
                          {value}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[#E8EEF5] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-500`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detailed coaching breakdown */}
            <div className="pt-6 border-t border-[#E2E8F0] space-y-5">
              {/* Hook rewrite */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Hook effectiveness · Main point at {analysis.hook_analysis.time_to_main_point_seconds}s
                </h3>
                <p className="text-sm text-[#526075] leading-relaxed">
                  {analysis.hook_analysis.effectiveness_notes}
                </p>
                <div className="rounded-2xl bg-[#F7F9FC] p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#1D4ED8]">
                    Stronger opening line you could try
                  </p>
                  <p className="text-sm font-medium text-[#0F172A] leading-relaxed">
                    &ldquo;{analysis.hook_analysis.rewritten_hook}&rdquo;
                  </p>
                </div>
              </div>

              {/* Pacing & Voice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#0F172A]">
                    Pacing · ~{analysis.speaking_pace.approx_wpm} WPM ({analysis.speaking_pace.pace_label})
                  </h3>
                  <p className="text-sm text-[#526075] leading-relaxed">
                    {analysis.speaking_pace.pacing_notes}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#0F172A]">
                    Energy &amp; voice clarity
                  </h3>
                  <p className="text-sm text-[#526075] leading-relaxed">
                    {analysis.delivery_details.energy_and_enthusiasm_notes}{' '}
                    {analysis.delivery_details.voice_clarity_notes}
                  </p>
                </div>
              </div>

              {/* Camera presence (explicitly noted as AI estimates) */}
              <div className="pt-4 border-t border-[#E2E8F0] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#0F172A] inline-flex items-center gap-1.5">
                    <Eye size={15} className="text-[#526075]" aria-hidden="true" />
                    <span>Camera presence &amp; body language</span>
                  </h3>
                  <span className="text-xs text-[#526075]">AI visual estimate</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#526075] leading-relaxed">
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Eye contact</p>
                    <p>{analysis.camera_presence.eye_contact_notes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Expressions</p>
                    <p>{analysis.camera_presence.facial_expressions_notes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Posture &amp; movement</p>
                    <p>{analysis.camera_presence.body_language_and_posture_notes}</p>
                  </div>
                </div>
                <p className="text-xs text-[#526075] flex items-start gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {analysis.camera_presence.is_ai_estimate_note ||
                      'Eye contact, facial expressions, and posture observations are AI visual estimates and can vary with camera angle and lighting.'}
                  </span>
                </p>
              </div>

              {/* Content structure */}
              <div className="pt-4 border-t border-[#E2E8F0] space-y-2.5">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Storytelling &amp; structure
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#526075] leading-relaxed">
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Opening</p>
                    <p>{analysis.content_structure.opening_notes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Middle</p>
                    <p>{analysis.content_structure.middle_notes}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">Close &amp; CTA</p>
                    <p>{analysis.content_structure.close_and_cta_notes}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Filler words bar chart */}
          <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-[#0F172A]">
                Filler words
              </h2>
              <span className="font-mono text-xs text-[#526075] tabular-nums">
                {fillerTotal} detected
              </span>
            </div>

            {sortedFillers.length === 0 ? (
              <p className="text-sm text-[#15803D] font-medium">
                Super clean delivery — no noticeable filler words stood out in this take.
              </p>
            ) : (
              <div className="space-y-4">
                {sortedFillers.map((entry) => {
                  const pct = Math.max(8, Math.round((entry.count / maxFillerCount) * 100));
                  return (
                    <div key={entry.word} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-[#0F172A]">
                          &ldquo;{entry.word}&rdquo;
                        </span>
                        <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
                          {entry.count}×
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-[#E8EEF5] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0F172A] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {entry.timestamps && entry.timestamps.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-[#526075]">Heard around:</span>
                          {entry.timestamps.slice(0, 6).map((ts, i) => (
                            <button
                              key={`${entry.word}-${ts}-${i}`}
                              type="button"
                              onClick={() => seekTo(parseTimestampToSeconds(ts), ts)}
                              className="font-mono text-[#1D4ED8] hover:underline tabular-nums py-1"
                            >
                              {ts}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 6. Your focus for the next take (mobile + prominent section) */}
          <section className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-3xl p-6 sm:p-7 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8]">
              <Target size={16} aria-hidden="true" />
              <span>Your focus for the next take</span>
            </div>
            <p className="font-display text-lg sm:text-xl font-bold text-[#0F172A] leading-snug">
              {analysis.focus_for_next_take}
            </p>
            <p className="text-xs sm:text-sm text-[#334E7A]">
              Ignore everything else on your next run—just nail this one adjustment.
            </p>
          </section>

          {/* 7. Tips & tricks for your niche */}
          <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-[#0F172A]">
                Tips &amp; tricks for {niche}
              </h2>
              <Lightbulb size={18} className="text-[#D97706] shrink-0" aria-hidden="true" />
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {(analysis.tips_and_tricks || []).map((tip, idx) => (
                <div key={idx} className="py-4 first:pt-0 last:pb-0 space-y-1">
                  <h3 className="text-sm sm:text-[15px] font-semibold text-[#0F172A]">
                    {String(idx + 1).padStart(2, '0')}. {tip.title}
                  </h3>
                  <p className="text-sm text-[#526075] leading-relaxed">{tip.advice}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 8. If you launched this today */}
          <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-[#0F172A]">
                If you launched this today
              </h2>
              <ReadinessText label={analysis.launch_estimate.readiness_label} />
            </div>

            <div className="space-y-2.5 text-sm sm:text-[15px] text-[#0F172A] leading-relaxed">
              <p>{analysis.launch_estimate.summary}</p>
              <p className="text-[#526075]">{analysis.launch_estimate.expected_retention_note}</p>
            </div>

            {analysis.retention_risk_moments && analysis.retention_risk_moments.length > 0 && (
              <div className="pt-4 border-t border-[#E2E8F0] space-y-3">
                <p className="text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-[#D97706]" aria-hidden="true" />
                  <span>Retention-risk moments (tap to inspect)</span>
                </p>

                <div className="space-y-2.5">
                  {analysis.retention_risk_moments.map((risk, idx) => {
                    const sec =
                      typeof risk.seconds === 'number'
                        ? risk.seconds
                        : parseTimestampToSeconds(risk.timestamp);
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 text-sm"
                      >
                        <button
                          type="button"
                          onClick={() => seekTo(sec, risk.timestamp)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#F7F9FC] hover:bg-[#EFF6FF] border border-[#E2E8F0] font-mono text-xs font-semibold text-[#0F172A] hover:text-[#1D4ED8] tabular-nums inline-flex items-center gap-1 shrink-0"
                        >
                          <Clock size={11} />
                          <span>{risk.timestamp}</span>
                        </button>
                        <p className="text-[#526075] leading-relaxed pt-1">{risk.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="pt-4 border-t border-[#E2E8F0] text-xs text-[#526075] leading-relaxed">
              This is an estimate based on your delivery quality. It does not predict views or reach, which depend on the platform, your audience and timing.
            </p>
          </section>

          {/* 9. Bottom actions: Upload next take + Delete this video */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 pb-4">
            <button
              type="button"
              onClick={onUploadNext}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              <Upload size={16} />
              <span>Upload next take</span>
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[48px] px-4 py-3 rounded-xl text-sm font-medium text-[#C03A4A] hover:bg-[#FDF2F3] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Trash2 size={16} />
                <span>Delete this video</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#526075]">Delete permanently?</span>
                <button
                  type="button"
                  onClick={() => onDelete(take.id)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C03A4A] text-white text-xs font-semibold hover:bg-[#A62D3B] transition-colors whitespace-nowrap shrink-0"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F7F9FC] transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
