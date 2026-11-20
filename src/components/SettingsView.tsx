import { useState } from 'react';
import { Check, Lock, Trash2 } from 'lucide-react';
import {
  CONFIDENCE_LABELS,
  CONTENT_NICHES,
  CREATOR_GOALS,
  ContentNiche,
  UserProfile,
} from '../types/softlaunch';

interface SettingsViewProps {
  profile: UserProfile;
  takesCount: number;
  onUpdateProfile: (profile: UserProfile) => void;
  onResetAll: () => void;
}

export function SettingsView({
  profile,
  takesCount,
  onUpdateProfile,
  onResetAll,
}: SettingsViewProps) {
  const [niche, setNiche] = useState<ContentNiche>(profile.niche);
  const [goal, setGoal] = useState<string>(profile.goal);
  const [confidence, setConfidence] = useState<number>(profile.initialConfidence);
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    onUpdateProfile({
      ...profile,
      niche,
      goal: goal.trim(),
      initialConfidence: confidence,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
          Your coaching profile
        </h1>
        <p className="text-sm text-[#526075]">
          Update your niche, goal, or privacy data anytime.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-6"
      >
        <div className="space-y-2.5">
          <label className="block text-sm font-semibold text-[#0F172A]">
            Content niche
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONTENT_NICHES.map((item) => {
              const selected = niche === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setNiche(item)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors ${
                    selected
                      ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F7F9FC]'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <label htmlFor="settings-goal" className="block text-sm font-semibold text-[#0F172A]">
            Main goal
          </label>
          <input
            id="settings-goal"
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={140}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[#D5DBE3] bg-white text-sm text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {CREATOR_GOALS.slice(0, 3).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setGoal(preset)}
                className="text-xs text-[#526075] hover:text-[#1D4ED8] underline underline-offset-4 py-1"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-sm font-semibold text-[#0F172A]">
            Camera confidence self-rating
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => setConfidence(rating)}
                className={`min-h-[48px] rounded-xl border font-mono text-sm font-semibold tabular-nums transition-colors ${
                  confidence === rating
                    ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                    : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F7F9FC]'
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#526075]">
            {CONFIDENCE_LABELS[confidence].title} — {CONFIDENCE_LABELS[confidence].note}
          </p>
        </div>

        <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between gap-4">
          {savedNotice ? (
            <span className="text-sm font-medium text-[#1D4ED8] inline-flex items-center gap-1.5">
              <Check size={16} />
              <span>Changes saved</span>
            </span>
          ) : (
            <span className="text-xs text-[#526075]">Stored locally in your browser</span>
          )}

          <button
            type="submit"
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0"
          >
            Save changes
          </button>
        </div>
      </form>

      {/* Privacy & Data control */}
      <section className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <Lock size={16} className="text-[#1D4ED8]" />
          <span>Privacy guarantee</span>
        </div>
        <p className="text-sm text-[#526075] leading-relaxed">
          Soft Launch is not a social network. Your practice videos and reports stay private on this device ({takesCount} {takesCount === 1 ? 'take' : 'takes'} saved locally). When you analyze a clip, it is processed securely for feedback and deleted immediately after your report is generated.
        </p>

        <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-[#C03A4A] hover:bg-[#FDF2F3] transition-colors inline-flex items-center gap-2"
            >
              <Trash2 size={15} />
              <span>Delete all local videos &amp; reset</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-[#526075]">
                Remove all {takesCount} takes and restart onboarding?
              </span>
              <button
                type="button"
                onClick={onResetAll}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C03A4A] text-white text-xs font-semibold hover:bg-[#A62D3B] transition-colors"
              >
                Yes, clear everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F172A] hover:bg-[#F7F9FC] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
