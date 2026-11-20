import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  CONFIDENCE_LABELS,
  CONTENT_NICHES,
  CREATOR_GOALS,
  ContentNiche,
  UserProfile,
} from '../types/softlaunch';
import { ProcessIllustration } from './ProcessIllustration';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [niche, setNiche] = useState<ContentNiche | null>(null);
  const [goal, setGoal] = useState<string>('');
  const [customGoal, setCustomGoal] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(3);

  const effectiveGoal = goal === '__custom__' ? customGoal.trim() : goal;

  const canContinue =
    (step === 1 && niche !== null) ||
    (step === 2 && effectiveGoal.length > 0) ||
    step === 3;

  function handleNext() {
    if (step === 1 && niche) {
      setStep(2);
    } else if (step === 2 && effectiveGoal) {
      setStep(3);
    } else if (step === 3 && niche && effectiveGoal) {
      onComplete({
        niche,
        goal: effectiveGoal,
        initialConfidence: confidence,
        completedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#14181F] flex flex-col">
      <header className="w-full border-b border-[#E6E8EC] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-[#14181F] whitespace-nowrap shrink-0">
            Soft Launch
          </span>
          <span className="text-xs text-[#5A6270] tabular-nums whitespace-nowrap shrink-0">
            Step {step} of 3
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          {/* Left editorial illustrated walkthrough column */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#157A5E]">
                Private AI video coaching
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.6rem] font-bold tracking-tight leading-[1.12] text-[#14181F]">
                Practise privately. Launch confidently.
              </h1>
              <p className="text-[15px] text-[#5A6270] leading-relaxed max-w-md">
                A quiet practice room for camera-shy creators—built so you can get honest feedback long before hitting publish.
              </p>
            </div>

            <ProcessIllustration variant="onboarding" />
          </div>

          {/* Right interactive onboarding card */}
          <div className="lg:col-span-7 bg-white border border-[#E6E8EC] rounded-3xl p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
            <div>
              {/* Step progress bar */}
              <div className="grid grid-cols-3 gap-2 mb-8" aria-label={`Onboarding progress: step ${step} of 3`}>
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-colors duration-200 ${
                      idx <= step ? 'bg-[#157A5E]' : 'bg-[#E6E8EC]'
                    }`}
                  />
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#5A6270]">Step 1 of 3</p>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#14181F]">
                      What kind of videos do you want to make?
                    </h2>
                    <p className="text-sm text-[#5A6270]">
                      We&apos;ll tailor your hooks, tips, and coaching examples to your niche.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    {CONTENT_NICHES.map((item) => {
                      const selected = niche === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setNiche(item)}
                          className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left text-sm font-medium transition-all duration-150 flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E] ${
                            selected
                              ? 'border-[#157A5E] bg-[#ECF7F3] text-[#14181F]'
                              : 'border-[#E6E8EC] bg-white text-[#14181F] hover:border-[#B8C0CC] hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <span>{item}</span>
                          {selected && <Check size={16} className="text-[#157A5E] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#5A6270]">Step 2 of 3</p>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#14181F]">
                      What&apos;s your main goal right now?
                    </h2>
                    <p className="text-sm text-[#5A6270]">
                      No pressure to go viral—just pick what feels real for you today.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {CREATOR_GOALS.map((item) => {
                      const selected = goal === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setGoal(item)}
                          className={`w-full min-h-[52px] px-4 py-3 rounded-2xl border text-left text-sm font-medium transition-all duration-150 flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E] ${
                            selected
                              ? 'border-[#157A5E] bg-[#ECF7F3] text-[#14181F]'
                              : 'border-[#E6E8EC] bg-white text-[#14181F] hover:border-[#B8C0CC] hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <span>{item}</span>
                          {selected && <Check size={16} className="text-[#157A5E] shrink-0" />}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setGoal('__custom__')}
                      className={`w-full min-h-[52px] px-4 py-3 rounded-2xl border text-left text-sm font-medium transition-all duration-150 flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E] ${
                        goal === '__custom__'
                          ? 'border-[#157A5E] bg-[#ECF7F3] text-[#14181F]'
                          : 'border-[#E6E8EC] bg-white text-[#5A6270] hover:border-[#B8C0CC] hover:text-[#14181F]'
                      }`}
                    >
                      <span>Something else...</span>
                      {goal === '__custom__' && <Check size={16} className="text-[#157A5E] shrink-0" />}
                    </button>

                    {goal === '__custom__' && (
                      <div className="pt-1">
                        <label htmlFor="custom-goal-input" className="sr-only">
                          Write your own goal
                        </label>
                        <input
                          id="custom-goal-input"
                          type="text"
                          value={customGoal}
                          onChange={(e) => setCustomGoal(e.target.value)}
                          placeholder="e.g. Record a 60-second intro for my portfolio"
                          maxLength={120}
                          autoFocus
                          className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[#C8CFD9] bg-white text-sm text-[#14181F] placeholder:text-[#8A94A3] focus:outline-none focus:border-[#157A5E] focus:ring-2 focus:ring-[#157A5E]/15"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#5A6270]">Step 3 of 3</p>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#14181F]">
                      How comfortable do you feel on camera right now?
                    </h2>
                    <p className="text-sm text-[#5A6270]">
                      Be totally honest—this helps us celebrate your starting point and track your growth.
                    </p>
                  </div>

                  <div className="grid grid-cols-5 gap-2 sm:gap-3" role="radiogroup" aria-label="Camera confidence rating 1 to 5">
                    {[1, 2, 3, 4, 5].map((rating) => {
                      const selected = confidence === rating;
                      return (
                        <button
                          key={rating}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setConfidence(rating)}
                          className={`min-h-[60px] rounded-2xl border font-mono text-lg font-semibold tabular-nums transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E] ${
                            selected
                              ? 'border-[#157A5E] bg-[#157A5E] text-white'
                              : 'border-[#E6E8EC] bg-white text-[#14181F] hover:border-[#B8C0CC] hover:bg-[#F8F9FA]'
                          }`}
                        >
                          {rating}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#5A6270] px-1">
                    <span>1 · Totally camera-shy</span>
                    <span>5 · Pretty comfortable</span>
                  </div>

                  <div className="rounded-2xl bg-[#F8F9FA] border border-[#E6E8EC] p-5 space-y-1">
                    <p className="text-sm font-semibold text-[#14181F]">
                      {confidence}/5 — {CONFIDENCE_LABELS[confidence].title}
                    </p>
                    <p className="text-sm text-[#5A6270]">
                      {CONFIDENCE_LABELS[confidence].note}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer controls */}
            <div className="pt-8 mt-8 border-t border-[#E6E8EC] flex items-center justify-between gap-4">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-medium text-[#5A6270] hover:text-[#14181F] hover:bg-[#F3F5F7] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              ) : (
                <span className="text-xs text-[#5A6270]">Saved privately on your device</span>
              )}

              <button
                type="button"
                disabled={!canContinue}
                onClick={handleNext}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#157A5E] text-white text-sm font-semibold hover:bg-[#11644D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157A5E]"
              >
                <span>{step === 3 ? 'Enter my practice room' : 'Continue'}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
