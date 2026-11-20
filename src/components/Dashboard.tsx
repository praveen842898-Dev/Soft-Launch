import {
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Upload,
  Video,
} from 'lucide-react';
import {
  PracticeTake,
  UserProfile,
  formatSeconds,
} from '../types/softlaunch';
import { ReadinessText } from './ReadinessText';
import { ProcessIllustration } from './ProcessIllustration';

interface DashboardProps {
  profile: UserProfile;
  takes: PracticeTake[];
  onUploadClick: () => void;
  onSelectTake: (takeId: string) => void;
  onOpenProgress: () => void;
}

export function Dashboard({
  profile,
  takes,
  onUploadClick,
  onSelectTake,
  onOpenProgress,
}: DashboardProps) {

  const totalTakes = takes.length;
  const clampedProgress = Math.min(totalTakes, 5);
  const progressUnlocked = totalTakes >= 3;
  const takesRemainingForSummary = Math.max(0, 3 - totalTakes);
  const latestTake = totalTakes > 0 ? takes[totalTakes - 1] : null;
  const firstTake = totalTakes > 0 ? takes[0] : null;
  const overallDelta =
    latestTake && firstTake && totalTakes > 1
      ? latestTake.analysis.scores.vibe_check_score - firstTake.analysis.scores.vibe_check_score
      : null;

  return (
    <div className="space-y-8">
      {/* Hero / Progress Card */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-[#E6E8EC] rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5A6270]">
              <span>{profile.niche}</span>
              <span aria-hidden="true">·</span>
              <span>{profile.goal}</span>
              <span aria-hidden="true">·</span>
              <span>Private to you</span>
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-2xl sm:text-3xl lg:text-[2.15rem] font-bold tracking-tight text-[#14181F] leading-tight">
                {totalTakes === 0
                  ? 'Soft launch your first video.'
                  : progressUnlocked
                    ? 'Your Progress Summary is unlocked.'
                    : `Soft Launch Progress: Video ${clampedProgress} of 5`}
              </h1>
              <p className="text-sm sm:text-[15px] text-[#5A6270] leading-relaxed max-w-xl">
                {totalTakes === 0
                  ? 'Upload at least 3 (up to 5) practice videos to unlock your full Progress Summary and Launch Readiness verdict. Take as many takes as you need.'
                  : progressUnlocked
                    ? 'Compare your first take against your latest, review your score trend, and see your Launch Readiness verdict—or keep recording takes.'
                    : `Upload ${takesRemainingForSummary} more practice ${takesRemainingForSummary === 1 ? 'video' : 'videos'} (up to 5 total) to unlock your full Progress Summary and Launch Readiness verdict.`}
              </p>
            </div>

            {/* 5-take milestone rail */}
            <div className="pt-2 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#14181F] tabular-nums">
                  Soft Launch Progress: Video {clampedProgress} of 5
                </span>
                <span className="text-[#5A6270] tabular-nums">
                  {progressUnlocked ? 'Summary unlocked' : `${totalTakes}/3 to unlock summary`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2" aria-label={`Completed ${clampedProgress} of 5 practice videos`}>
                {[1, 2, 3, 4, 5].map((slot) => {
                  const completed = totalTakes >= slot;
                  const isUnlockMilestone = slot === 3;
                  return (
                    <div key={slot} className="space-y-1">
                      <div
                        className={`h-2.5 rounded-full transition-colors ${
                          completed ? 'bg-[#157A5E]' : 'bg-[#E6E8EC]'
                        }`}
                      />
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#5A6270]">
                        <span>#{slot}</span>
                        {isUnlockMilestone && (
                          <span className="font-sans text-[10px] text-[#157A5E] font-medium">
                            Unlock
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onUploadClick}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[#157A5E] text-white text-sm font-semibold hover:bg-[#11644D] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E]"
            >
              <Upload size={17} />
              <span>Upload a practice video</span>
            </button>

            <button
              type="button"
              onClick={onOpenProgress}
              className={`min-h-[48px] px-5 py-3 rounded-xl border text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E] ${
                progressUnlocked
                  ? 'border-[#157A5E]/30 bg-[#ECF7F3] text-[#157A5E] hover:bg-[#DEF2EA]'
                  : 'border-[#E6E8EC] bg-white text-[#5A6270] hover:text-[#14181F] hover:bg-[#F8F9FA]'
              }`}
            >
              <TrendingUp size={16} />
              <span>
                {progressUnlocked
                  ? 'View Progress Summary'
                  : `Progress Summary (${totalTakes}/3)`}
              </span>
            </button>
          </div>
        </div>

        {/* Right contextual card: Next focus cue if takes exist, otherwise serene studio card */}
        <div className="lg:col-span-5 bg-white border border-[#E6E8EC] rounded-3xl overflow-hidden flex flex-col justify-between">
          {latestTake ? (
            <div className="p-6 sm:p-8 flex flex-col justify-between h-full gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#5A6270]">
                  <span>Latest take · Take #{latestTake.takeNumber}</span>
                  <ReadinessText label={latestTake.analysis.launch_estimate.readiness_label} size="sm" />
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-4xl sm:text-5xl font-semibold tracking-tight text-[#14181F] tabular-nums">
                    {latestTake.analysis.scores.vibe_check_score}
                  </span>
                  <span className="text-sm text-[#5A6270]">/ 100 Vibe Check</span>
                  {overallDelta !== null && (
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        overallDelta > 0
                          ? 'text-[#157A5E]'
                          : overallDelta < 0
                            ? 'text-[#C03A4A]'
                            : 'text-[#5A6270]'
                      }`}
                    >
                      {overallDelta > 0 ? `+${overallDelta}` : overallDelta} since Take 1
                    </span>
                  )}
                </div>

                <p className="text-sm text-[#14181F] leading-relaxed">
                  &ldquo;{latestTake.analysis.vibe_check_summary}&rdquo;
                </p>
              </div>

              <div className="pt-5 border-t border-[#E6E8EC] space-y-2">
                <p className="text-xs font-semibold text-[#157A5E]">
                  Your focus for the next take
                </p>
                <p className="text-sm text-[#14181F] leading-relaxed">
                  {latestTake.analysis.focus_for_next_take}
                </p>
                <button
                  type="button"
                  onClick={() => onSelectTake(latestTake.id)}
                  className="pt-2 text-sm font-medium text-[#157A5E] hover:text-[#11644D] inline-flex items-center gap-1.5 min-h-[44px]"
                >
                  <span>Open full Take #{latestTake.takeNumber} report</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <ProcessIllustration variant="dashboard" />
          )}
        </div>
      </section>

      {/* Past takes list */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#14181F]">
            Your practice takes
          </h2>
          <span className="text-xs text-[#5A6270] tabular-nums">
            {totalTakes === 0
              ? 'No takes yet'
              : `${totalTakes} ${totalTakes === 1 ? 'take' : 'takes'} saved locally`}
          </span>
        </div>

        {totalTakes === 0 ? (
          <div className="bg-white border border-[#E6E8EC] rounded-3xl p-8 sm:p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#ECF7F3] text-[#157A5E] flex items-center justify-center mx-auto">
              <Video size={22} />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="font-display text-lg font-semibold text-[#14181F]">
                Your first take doesn&apos;t have to be good
              </h3>
              <p className="text-sm text-[#5A6270] leading-relaxed">
                Record yourself talking about one idea in {profile.niche.toLowerCase()} for under 3 minutes. Nobody sees it but you, and you can delete it anytime.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={onUploadClick}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#14181F] text-white text-sm font-semibold hover:bg-[#272E3A] transition-colors inline-flex items-center gap-2"
              >
                <Upload size={16} />
                <span>Upload Take #1</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#E6E8EC] rounded-3xl divide-y divide-[#E6E8EC] overflow-hidden">
            {[...takes].reverse().map((take, reversedIndex) => {
              const originalIndex = takes.length - 1 - reversedIndex;
              const prevTake = originalIndex > 0 ? takes[originalIndex - 1] : null;
              const delta = prevTake
                ? take.analysis.scores.vibe_check_score -
                  prevTake.analysis.scores.vibe_check_score
                : null;

              const dateLabel = new Date(take.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });

              return (
                <button
                  key={take.id}
                  type="button"
                  onClick={() => onSelectTake(take.id)}
                  className="w-full text-left px-5 sm:px-6 py-5 hover:bg-[#F8F9FA] active:bg-[#F2F4F7] transition-colors flex items-center justify-between gap-4 min-h-[76px] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#157A5E]"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5A6270]">
                      <span className="font-mono font-semibold text-[#14181F] tabular-nums">
                        Take #{take.takeNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatSeconds(take.durationSeconds)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <ReadinessText
                        label={take.analysis.launch_estimate.readiness_label}
                        size="sm"
                      />
                    </div>
                    <p className="text-sm sm:text-[15px] font-semibold text-[#14181F] truncate">
                      {take.topicNote || take.analysis.video_summary}
                    </p>
                    <p className="text-xs sm:text-sm text-[#5A6270] truncate">
                      {take.analysis.vibe_check_summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="font-mono text-xl font-semibold text-[#14181F] tabular-nums">
                        {take.analysis.scores.vibe_check_score}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums">
                        {delta !== null ? (
                          <span
                            className={
                              delta > 0
                                ? 'text-[#157A5E] font-medium'
                                : delta < 0
                                  ? 'text-[#C03A4A] font-medium'
                                  : 'text-[#5A6270]'
                            }
                          >
                            {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : `${delta}`}
                          </span>
                        ) : (
                          <span className="text-[#5A6270]">Baseline</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-[#8A94A3]" aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
