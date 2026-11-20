import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Lock,
  Minus,
  RefreshCw,
  TrendingUp,
  Upload,
} from 'lucide-react';
import {
  PracticeTake,
  ProgressVerdict,
  SCORE_CATEGORIES,
  UserProfile,
  totalFillerCount,
} from '../types/softlaunch';
import { loadCachedVerdict, saveCachedVerdict } from '../lib/storage';
import { ReadinessText } from './ReadinessText';

interface ProgressSummaryProps {
  profile: UserProfile;
  takes: PracticeTake[];
  onUploadNext: () => void;
  onSelectTake: (takeId: string) => void;
}

function ScoreLineChart({
  takes,
  onSelectTake,
}: {
  takes: PracticeTake[];
  onSelectTake: (takeId: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number>(takes.length - 1);

  const width = 640;
  const height = 240;
  const padX = 44;
  const padTop = 24;
  const padBottom = 38;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  const points = takes.map((take, idx) => {
    const x =
      takes.length === 1
        ? padX + innerW / 2
        : padX + (idx / (takes.length - 1)) * innerW;
    const score = Math.max(0, Math.min(100, take.analysis.scores.vibe_check_score));
    const y = padTop + innerH - (score / 100) * innerH;
    return { x, y, score, take };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
      : '';

  const activePoint = points[Math.min(activeIndex, points.length - 1)];

  return (
    <div className="space-y-4">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[300px]"
          role="img"
          aria-label="Line chart of Vibe Check score across practice takes"
        >
          <defs>
            <linearGradient id="vibeAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal reference grid */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = padTop + innerH - (val / 100) * innerH;
            return (
              <g key={val}>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="#E8EEF5"
                  strokeWidth="1"
                />
                <text
                  x={padX - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#8A94A3] text-[11px] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#vibeAreaGrad)" />}

          <path
            d={linePath}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((pt, idx) => {
            const isActive = idx === activeIndex;
            const nodeColor =
              pt.score >= 78 ? '#16A34A' : pt.score >= 62 ? '#D97706' : '#DC2626';
            return (
              <g
                key={pt.take.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                className="cursor-pointer"
              >
                <circle cx={pt.x} cy={pt.y} r="18" fill="transparent" />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 7 : 5}
                  fill={isActive ? nodeColor : '#FFFFFF'}
                  stroke={nodeColor}
                  strokeWidth="3"
                />
                <text
                  x={pt.x}
                  y={pt.y - 14}
                  textAnchor="middle"
                  className={`font-mono text-[12px] font-semibold ${
                    isActive ? 'fill-[#0F172A]' : 'fill-[#526075]'
                  }`}
                >
                  {pt.score}
                </text>
                <text
                  x={pt.x}
                  y={height - 10}
                  textAnchor="middle"
                  className={`font-mono text-[11px] ${
                    isActive ? 'fill-[#0F172A] font-semibold' : 'fill-[#526075]'
                  }`}
                >
                  Take #{pt.take.takeNumber}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activePoint && (
        <div className="rounded-2xl bg-[#F7F9FC] border border-[#E2E8F0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#526075]">
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                Take #{activePoint.take.takeNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Vibe Check {activePoint.score}/100
              </span>
              <span aria-hidden="true">·</span>
              <ReadinessText
                label={activePoint.take.analysis.launch_estimate.readiness_label}
                size="sm"
              />
            </div>
            <p className="text-sm text-[#0F172A] truncate">
              &ldquo;{activePoint.take.analysis.vibe_check_summary}&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectTake(activePoint.take.id)}
            className="min-h-[44px] px-3 py-2 text-xs font-semibold text-[#1D4ED8] hover:text-[#1E40AF] inline-flex items-center gap-1 whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            <span>Open report</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProgressSummary({
  profile,
  takes,
  onUploadNext,
  onSelectTake,
}: ProgressSummaryProps) {
  const unlocked = takes.length >= 3;
  const [verdict, setVerdict] = useState<ProgressVerdict | null>(() =>
    unlocked ? loadCachedVerdict(takes) : null
  );
  const [loadingVerdict, setLoadingVerdict] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  async function fetchVerdict(force = false) {
    if (takes.length < 3) return;
    if (!force) {
      const cached = loadCachedVerdict(takes);
      if (cached) {
        setVerdict(cached);
        return;
      }
    }

    setLoadingVerdict(true);
    setVerdictError(null);
    try {
      const condensed = takes.map((t) => ({
        takeNumber: t.takeNumber,
        durationSeconds: t.durationSeconds,
        topic: t.topicNote || t.analysis.video_summary,
        scores: t.analysis.scores,
        approx_wpm: t.analysis.speaking_pace.approx_wpm,
        total_fillers: totalFillerCount(t.analysis),
        vibe_check_summary: t.analysis.vibe_check_summary,
        readiness_label: t.analysis.launch_estimate.readiness_label,
        strengths: t.analysis.strengths,
        focus_for_next_take: t.analysis.focus_for_next_take,
      }));

      const res = await fetch('/api/progress-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, takes: condensed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not load Launch Readiness verdict.');
      }
      setVerdict(data.verdict);
      saveCachedVerdict(takes, data.verdict);
    } catch (err) {
      setVerdictError(
        err instanceof Error ? err.message : 'Unable to generate your AI verdict right now.'
      );
    } finally {
      setLoadingVerdict(false);
    }
  }

  useEffect(() => {
    if (unlocked) {
      fetchVerdict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, takes.map((t) => t.id).join('|')]);

  if (!unlocked) {
    const remaining = Math.max(0, 3 - takes.length);
    return (
      <div className="max-w-2xl mx-auto py-8 sm:py-12">
        <div className="bg-white border border-[#E2E8F0] rounded-3xl p-8 sm:p-10 text-center space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] text-[#526075] flex items-center justify-center mx-auto">
            <Lock size={22} />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <p
              className={`font-mono text-xs font-semibold tabular-nums ${
                takes.length === 0 ? 'text-[#DC2626]' : 'text-[#B45309]'
              }`}
            >
              {takes.length === 0
                ? 'Not started · 0 of 3 practice videos uploaded'
                : `${takes.length} of 3 practice videos uploaded`}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              Progress Summary unlocks after 3 takes
            </h1>
            <p className="text-sm text-[#526075] leading-relaxed">
              Upload {remaining} more private practice {remaining === 1 ? 'video' : 'videos'} to unlock your score trend chart, first-vs-latest breakdown, and final Launch Readiness verdict.
            </p>
          </div>

          <div className="max-w-xs mx-auto grid grid-cols-3 gap-2 pt-1">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-2 rounded-full ${
                  takes.length === 0
                    ? step === 1
                      ? 'bg-[#FECACA]'
                      : 'bg-[#E2E8F0]'
                    : takes.length >= step
                      ? 'bg-[#D97706]'
                      : 'bg-[#E2E8F0]'
                }`}
              />
            ))}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onUploadNext}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors inline-flex items-center gap-2"
            >
              <Upload size={16} />
              <span>Upload Take #{takes.length + 1}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const firstTake = takes[0];
  const latestTake = takes[takes.length - 1];
  const scoreDelta =
    latestTake.analysis.scores.vibe_check_score -
    firstTake.analysis.scores.vibe_check_score;
  const firstFillers = totalFillerCount(firstTake.analysis);
  const latestFillers = totalFillerCount(latestTake.analysis);
  const fillerDelta = latestFillers - firstFillers;

  const categoryDeltas = SCORE_CATEGORIES.map(({ key, label }) => {
    const first = Math.round(firstTake.analysis.scores[key] ?? 0);
    const latest = Math.round(latestTake.analysis.scores[key] ?? 0);
    return { key, label, first, latest, delta: latest - first };
  });

  const biggestJump = [...categoryDeltas].sort((a, b) => b.delta - a.delta)[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[#1D4ED8] tabular-nums">
            Progress Summary · {takes.length} takes compared
          </p>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#0F172A]">
            Look how far your delivery has come.
          </h1>
        </div>

        <button
          type="button"
          onClick={onUploadNext}
          className="min-h-[48px] px-5 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Upload size={16} />
          <span>Upload Take #{takes.length + 1}</span>
        </button>
      </div>

      {/* Final Launch Readiness Verdict Card */}
      <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-semibold text-[#526075]">
              Launch Readiness verdict
            </span>
            <span aria-hidden="true" className="text-[#D0D5DD]">·</span>
            <ReadinessText
              label={
                verdict?.readiness_label ||
                latestTake.analysis.launch_estimate.readiness_label
              }
              size="lg"
            />
          </div>

          <button
            type="button"
            disabled={loadingVerdict}
            onClick={() => fetchVerdict(true)}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-[#526075] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw size={13} className={loadingVerdict ? 'animate-spin' : ''} />
            <span>{loadingVerdict ? 'Writing verdict...' : 'Refresh verdict'}</span>
          </button>
        </div>

        {loadingVerdict && !verdict ? (
          <div className="space-y-3 py-2 animate-pulse">
            <div className="h-6 bg-[#E8EEF5] rounded-lg w-2/3" />
            <div className="h-4 bg-[#F2F4F7] rounded-lg w-full" />
            <div className="h-4 bg-[#F2F4F7] rounded-lg w-5/6" />
          </div>
        ) : verdict ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A]">
              {verdict.headline}
            </h2>
            <p className="text-sm sm:text-[15px] text-[#526075] leading-relaxed max-w-3xl">
              {verdict.verdict_summary}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-5 space-y-1">
                <p className="text-xs font-semibold text-[#15803D]">Biggest win</p>
                <p className="text-sm text-[#0F172A] leading-relaxed">{verdict.biggest_win}</p>
              </div>
              <div className="rounded-2xl bg-[#F7F9FC] border border-[#E2E8F0] p-5 space-y-1">
                <p className="text-xs font-semibold text-[#0F172A]">Your next move</p>
                <p className="text-sm text-[#526075] leading-relaxed">{verdict.final_nudge}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm sm:text-[15px] text-[#0F172A] leading-relaxed">
              {latestTake.analysis.launch_estimate.summary}
            </p>
            {verdictError && (
              <p className="text-xs text-[#DC2626]">{verdictError}</p>
            )}
          </div>
        )}
      </section>

      {/* Score Trend Line Chart */}
      <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-[#0F172A] inline-flex items-center gap-2">
              <TrendingUp size={18} className="text-[#1D4ED8]" aria-hidden="true" />
              <span>Vibe Check score across takes</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#526075]">
              Tap any point to inspect that take&apos;s summary.
            </p>
          </div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            <span
              className={
                scoreDelta > 0
                  ? 'text-[#15803D]'
                  : scoreDelta < 0
                    ? 'text-[#DC2626]'
                    : 'text-[#526075]'
              }
            >
              {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts overall
            </span>
          </div>
        </div>

        <ScoreLineChart takes={takes} onSelectTake={onSelectTake} />
      </section>

      {/* Side-by-side First Take vs Latest Take */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A]">
            First take vs. latest take
          </h2>
          {biggestJump && biggestJump.delta > 0 && (
            <span className="text-xs font-medium text-[#15803D]">
              Biggest jump: {biggestJump.label} (+{biggestJump.delta})
            </span>
          )}
        </div>

        {/* High-level side-by-side cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* First take */}
          <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#526075]">
                <span className="font-mono font-semibold text-[#0F172A]">
                  First · Take #{firstTake.takeNumber}
                </span>
                <ReadinessText
                  label={firstTake.analysis.launch_estimate.readiness_label}
                  size="sm"
                />
              </div>

              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-4xl font-semibold text-[#0F172A] tabular-nums">
                  {firstTake.analysis.scores.vibe_check_score}
                </span>
                <span className="text-sm text-[#526075]">/ 100 Vibe Check</span>
              </div>

              <p className="text-sm text-[#526075] leading-relaxed">
                &ldquo;{firstTake.analysis.vibe_check_summary}&rdquo;
              </p>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[#526075]">Speaking pace</p>
                <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                  ~{firstTake.analysis.speaking_pace.approx_wpm} wpm
                </p>
              </div>
              <div>
                <p className="text-[#526075]">Filler words</p>
                <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                  {firstFillers} total
                </p>
              </div>
            </div>
          </div>

          {/* Latest take */}
          <div className="bg-white border border-[#1D4ED8]/35 rounded-3xl p-6 sm:p-7 flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#526075]">
                <span className="font-mono font-semibold text-[#1D4ED8]">
                  Latest · Take #{latestTake.takeNumber}
                </span>
                <ReadinessText
                  label={latestTake.analysis.launch_estimate.readiness_label}
                  size="sm"
                />
              </div>

              <div className="flex items-baseline gap-3">
                <span className="font-mono text-4xl font-semibold text-[#0F172A] tabular-nums">
                  {latestTake.analysis.scores.vibe_check_score}
                </span>
                <span className="text-sm text-[#526075]">/ 100 Vibe Check</span>
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    scoreDelta > 0
                      ? 'text-[#15803D]'
                      : scoreDelta < 0
                        ? 'text-[#DC2626]'
                        : 'text-[#526075]'
                  }`}
                >
                  {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                </span>
              </div>

              <p className="text-sm text-[#0F172A] leading-relaxed">
                &ldquo;{latestTake.analysis.vibe_check_summary}&rdquo;
              </p>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[#526075]">Speaking pace</p>
                <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                  ~{latestTake.analysis.speaking_pace.approx_wpm} wpm
                </p>
              </div>
              <div>
                <p className="text-[#526075]">Filler words</p>
                <p className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums mt-0.5">
                  {latestFillers} total{' '}
                  <span
                    className={
                      fillerDelta < 0
                        ? 'text-[#15803D]'
                        : fillerDelta > 0
                          ? 'text-[#DC2626]'
                          : 'text-[#526075]'
                    }
                  >
                    ({fillerDelta > 0 ? `+${fillerDelta}` : fillerDelta})
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Category-by-category comparison table */}
        <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between text-xs text-[#526075] pb-2 border-b border-[#E2E8F0]">
            <span>Category</span>
            <div className="flex items-center gap-6 font-mono tabular-nums">
              <span className="w-12 text-right">Take #{firstTake.takeNumber}</span>
              <span className="w-12 text-right text-[#0F172A] font-semibold">
                Take #{latestTake.takeNumber}
              </span>
              <span className="w-14 text-right">Change</span>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {categoryDeltas.map(({ key, label, first, latest, delta }) => (
              <div
                key={key}
                className="py-3.5 flex items-center justify-between gap-4 text-sm"
              >
                <span className="font-medium text-[#0F172A] truncate">{label}</span>
                <div className="flex items-center gap-6 font-mono tabular-nums shrink-0">
                  <span className="w-12 text-right text-[#526075]">{first}</span>
                  <span className="w-12 text-right font-semibold text-[#0F172A]">
                    {latest}
                  </span>
                  <span
                    className={`w-14 text-right inline-flex items-center justify-end gap-0.5 text-xs font-semibold ${
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
