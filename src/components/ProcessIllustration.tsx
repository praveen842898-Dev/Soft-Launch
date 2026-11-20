import { useState } from 'react';
import { Lock } from 'lucide-react';

interface ProcessIllustrationProps {
  variant: 'onboarding' | 'dashboard';
}

interface StepItem {
  num: string;
  title: string;
  summary: string;
  detail: string;
}

const PROCESS_STEPS: StepItem[] = [
  {
    num: '01',
    title: 'Record & upload privately',
    summary: 'Drop a rough clip under 3 minutes. Nobody sees it but you.',
    detail: 'MP4, MOV, or WebM — kept private on your device and never posted anywhere.',
  },
  {
    num: '02',
    title: 'Get your honest Vibe Check',
    summary: 'See what you nailed, clickable timestamps, and one fix to try.',
    detail: 'Scores your hook, pacing, filler words, clarity, and structure without harsh judgment.',
  },
  {
    num: '03',
    title: 'Practise 3–5 takes & launch',
    summary: 'Watch your score climb and unlock your Launch Readiness verdict.',
    detail: 'Compare Take 1 vs. your latest take so you only hit post when you genuinely feel ready.',
  },
];

function StepSceneRecord({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 88 72"
      className="w-[76px] h-[62px] sm:w-[84px] sm:h-[68px] shrink-0"
      fill="none"
      aria-hidden="true"
    >
      {/* Soft backdrop shape */}
      <rect
        x="4"
        y="4"
        width="80"
        height="64"
        rx="16"
        fill={active ? '#DBEAFE' : '#F1F5F9'}
      />
      {/* Phone body */}
      <rect
        x="24"
        y="12"
        width="32"
        height="48"
        rx="7"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeWidth="1.75"
      />
      {/* Camera dot */}
      <circle cx="40" cy="17" r="1.5" fill="#0F172A" />
      {/* Friendly speaker silhouette inside screen */}
      <circle cx="40" cy="29" r="5" fill="#1D4ED8" fillOpacity="0.22" stroke="#1D4ED8" strokeWidth="1.5" />
      <path
        d="M31.5 44C32.5 39 35.8 36.5 40 36.5C44.2 36.5 47.5 39 48.5 44"
        stroke="#1D4ED8"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Record button */}
      <circle cx="40" cy="52" r="3" fill="#C03A4A" />
      {/* Soundwaves */}
      <path
        d="M62 28C64.5 30.5 64.5 35.5 62 38"
        stroke="#1D4ED8"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M66.5 24.5C70.5 28.5 70.5 37.5 66.5 41.5"
        stroke="#1D4ED8"
        strokeOpacity="0.55"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Privacy lock charm */}
      <rect
        x="10"
        y="42"
        width="18"
        height="16"
        rx="5"
        fill="#1D4ED8"
      />
      <path
        d="M16 48V46.5C16 44.8 17.3 43.5 19 43.5C20.7 43.5 22 44.8 22 46.5V48"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="14.5" y="48" width="9" height="6.5" rx="1.75" fill="#FFFFFF" />
    </svg>
  );
}

function StepSceneFeedback({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 88 72"
      className="w-[76px] h-[62px] sm:w-[84px] sm:h-[68px] shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="80"
        height="64"
        rx="16"
        fill={active ? '#DBEAFE' : '#F1F5F9'}
      />
      {/* Mini report card */}
      <rect
        x="12"
        y="12"
        width="64"
        height="48"
        rx="9"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeWidth="1.75"
      />
      {/* Vibe ring */}
      <circle cx="29" cy="30" r="10" stroke="#E2E8F0" strokeWidth="3" />
      <path
        d="M29 20 A10 10 0 1 1 20.5 35.2"
        stroke="#16A34A"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="29"
        y="33"
        textAnchor="middle"
        fill="#0F172A"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        78
      </text>
      {/* Horizontal breakdown bars */}
      <rect x="45" y="23" width="23" height="3.5" rx="1.75" fill="#E2E8F0" />
      <rect x="45" y="23" width="18" height="3.5" rx="1.75" fill="#16A34A" />
      <rect x="45" y="30" width="23" height="3.5" rx="1.75" fill="#E2E8F0" />
      <rect x="45" y="30" width="14" height="3.5" rx="1.75" fill="#D97706" />
      <rect x="45" y="37" width="23" height="3.5" rx="1.75" fill="#E2E8F0" />
      <rect x="45" y="37" width="9" height="3.5" rx="1.75" fill="#DC2626" />
      {/* Clickable timestamp bar at bottom of mini card */}
      <rect x="19" y="47" width="50" height="6" rx="3" fill="#F1F5F9" />
      <circle cx="32" cy="50" r="2.2" fill="#16A34A" />
      <circle cx="52" cy="50" r="2.2" fill="#D97706" />
    </svg>
  );
}

function StepSceneLaunch({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 88 72"
      className="w-[76px] h-[62px] sm:w-[84px] sm:h-[68px] shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="80"
        height="64"
        rx="16"
        fill={active ? '#DBEAFE' : '#F1F5F9'}
      />
      {/* Chart frame */}
      <rect
        x="12"
        y="12"
        width="64"
        height="48"
        rx="9"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeWidth="1.75"
      />
      {/* Subtle horizontal grid */}
      <line x1="19" y1="48" x2="69" y2="48" stroke="#E2E8F0" strokeWidth="1.25" />
      <line x1="19" y1="36" x2="69" y2="36" stroke="#F0F2F5" strokeWidth="1.25" />
      <line x1="19" y1="24" x2="69" y2="24" stroke="#F0F2F5" strokeWidth="1.25" />
      {/* Rising progression curve */}
      <path
        d="M22 45 C31 44, 34 37, 43 34 C51 31, 55 24, 64 22"
        stroke="#1D4ED8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Take 1 (red/start), Take 2 (yellow/progress), Take 3+ (green/goal) nodes */}
      <circle cx="22" cy="45" r="3" fill="#FFFFFF" stroke="#DC2626" strokeWidth="2" />
      <circle cx="43" cy="34" r="3" fill="#FFFFFF" stroke="#D97706" strokeWidth="2" />
      {/* Launch-ready checkmark node */}
      <circle cx="64" cy="22" r="6.5" fill="#16A34A" />
      <path
        d="M61.2 22.1L63.1 24L67 20"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tiny take ticks */}
      <text
        x="22"
        y="55"
        textAnchor="middle"
        fill="#526075"
        fontSize="6.5"
        fontFamily="JetBrains Mono, monospace"
      >
        #1
      </text>
      <text
        x="43"
        y="55"
        textAnchor="middle"
        fill="#526075"
        fontSize="6.5"
        fontFamily="JetBrains Mono, monospace"
      >
        #2
      </text>
      <text
        x="64"
        y="55"
        textAnchor="middle"
        fill="#15803D"
        fontSize="6.5"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        #3+
      </text>
    </svg>
  );
}

function PanoramicJourneyIllustration() {
  return (
    <svg
      viewBox="0 0 460 154"
      className="w-full h-auto block"
      fill="none"
      role="img"
      aria-label="Illustration showing the 3-step Soft Launch process: 1. Record privately, 2. Get AI Vibe Check feedback, 3. Track progress across takes until ready to launch"
    >
      {/* Clean tinted studio canvas */}
      <rect width="460" height="154" fill="#F1F6FC" />

      {/* Subtle dotted editorial background grid */}
      <pattern id="slDots" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.9" fill="#BFD0E6" fillOpacity="0.55" />
      </pattern>
      <rect width="460" height="154" fill="url(#slDots)" />

      {/* Connecting curved dashed arrows between steps */}
      <path
        d="M132 76 C148 56, 160 56, 174 74"
        stroke="#1D4ED8"
        strokeWidth="1.75"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <path
        d="M170 69 L175 75 L168 77"
        stroke="#1D4ED8"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M286 76 C302 96, 314 96, 328 78"
        stroke="#1D4ED8"
        strokeWidth="1.75"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <path
        d="M322 79 L329 77 L327 84"
        stroke="#1D4ED8"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* STAGE 1: Private Recording */}
      <g transform="translate(22, 22)">
        <rect
          width="106"
          height="104"
          rx="18"
          fill="#FFFFFF"
          stroke="#D5E2F1"
          strokeWidth="1.5"
        />
        {/* Phone frame */}
        <rect
          x="33"
          y="15"
          width="40"
          height="58"
          rx="8"
          fill="#F7F9FC"
          stroke="#0F172A"
          strokeWidth="1.75"
        />
        <circle cx="53" cy="21" r="1.5" fill="#0F172A" />
        {/* Person smiling on camera */}
        <circle cx="53" cy="36" r="6.5" fill="#EFF6FF" stroke="#1D4ED8" strokeWidth="1.5" />
        <path
          d="M42.5 54C44 48 48 45.5 53 45.5C58 45.5 62 48 63.5 54"
          stroke="#1D4ED8"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="53" cy="64" r="3.2" fill="#C03A4A" />
        {/* Lock badge */}
        <rect x="16" y="50" width="22" height="20" rx="6" fill="#1D4ED8" />
        <path
          d="M23.5 58V56.2C23.5 54.3 25 52.8 27 52.8C29 52.8 30.5 54.3 30.5 56.2V58"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect x="21.5" y="58" width="11" height="8" rx="2" fill="#FFFFFF" />
        {/* Soundwaves */}
        <path d="M80 35C83 38 83 44 80 47" stroke="#1D4ED8" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M85 31C89.5 36 89.5 46 85 51" stroke="#1D4ED8" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
        {/* Label */}
        <text
          x="53"
          y="91"
          textAnchor="middle"
          fill="#0F172A"
          fontSize="10.5"
          fontWeight="600"
          fontFamily="Plus Jakarta Sans, sans-serif"
        >
          1. Private take
        </text>
      </g>

      {/* STAGE 2: AI Vibe Check */}
      <g transform="translate(177, 22)">
        <rect
          width="106"
          height="104"
          rx="18"
          fill="#FFFFFF"
          stroke="#D5E2F1"
          strokeWidth="1.5"
        />
        {/* Score ring */}
        <circle cx="38" cy="44" r="14" stroke="#E8EEF5" strokeWidth="4" />
        <path
          d="M38 30 A14 14 0 1 1 26.2 51.5"
          stroke="#16A34A"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <text
          x="38"
          y="48"
          textAnchor="middle"
          fill="#0F172A"
          fontSize="11"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          78
        </text>
        {/* Bars */}
        <rect x="60" y="32" width="30" height="4.5" rx="2.25" fill="#E8EEF5" />
        <rect x="60" y="32" width="24" height="4.5" rx="2.25" fill="#16A34A" />
        <rect x="60" y="42" width="30" height="4.5" rx="2.25" fill="#E8EEF5" />
        <rect x="60" y="42" width="18" height="4.5" rx="2.25" fill="#D97706" />
        <rect x="60" y="52" width="30" height="4.5" rx="2.25" fill="#E8EEF5" />
        <rect x="60" y="52" width="12" height="4.5" rx="2.25" fill="#DC2626" />
        {/* Timeline scrubber */}
        <rect x="20" y="66" width="66" height="6" rx="3" fill="#F1F5F9" />
        <circle cx="36" cy="69" r="2.6" fill="#16A34A" />
        <circle cx="64" cy="69" r="2.6" fill="#D97706" />
        {/* Label */}
        <text
          x="53"
          y="91"
          textAnchor="middle"
          fill="#0F172A"
          fontSize="10.5"
          fontWeight="600"
          fontFamily="Plus Jakarta Sans, sans-serif"
        >
          2. Vibe Check
        </text>
      </g>

      {/* STAGE 3: Launch Ready */}
      <g transform="translate(332, 22)">
        <rect
          width="106"
          height="104"
          rx="18"
          fill="#FFFFFF"
          stroke="#BBF7D0"
          strokeWidth="1.5"
        />
        {/* Baseline grid */}
        <line x1="18" y1="66" x2="88" y2="66" stroke="#E2E8F0" strokeWidth="1.25" />
        <line x1="18" y1="48" x2="88" y2="48" stroke="#F1F3F5" strokeWidth="1.25" />
        <line x1="18" y1="30" x2="88" y2="30" stroke="#F1F3F5" strokeWidth="1.25" />
        {/* Curve */}
        <path
          d="M24 61 C36 60, 42 49, 53 45 C64 41, 69 31, 80 28"
          stroke="#1D4ED8"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="24" cy="61" r="3.5" fill="#FFFFFF" stroke="#DC2626" strokeWidth="2" />
        <circle cx="53" cy="45" r="3.5" fill="#FFFFFF" stroke="#D97706" strokeWidth="2" />
        {/* Checkmark badge */}
        <circle cx="80" cy="28" r="9" fill="#16A34A" />
        <path
          d="M76 28.2L78.6 30.8L84.2 25.2"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Label */}
        <text
          x="53"
          y="91"
          textAnchor="middle"
          fill="#15803D"
          fontSize="10.5"
          fontWeight="700"
          fontFamily="Plus Jakarta Sans, sans-serif"
        >
          3. Launch ready
        </text>
      </g>
    </svg>
  );
}

export function ProcessIllustration({ variant }: ProcessIllustrationProps) {
  const [selectedStep, setSelectedStep] = useState<number>(0);

  if (variant === 'dashboard') {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-[#E2E8F0] bg-[#F1F6FC]">
          <PanoramicJourneyIllustration />
        </div>
        <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-[#0F172A]">
              How Soft Launch works
            </h2>
            <ol className="space-y-2.5">
              {PROCESS_STEPS.map((step) => (
                <li key={step.num} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums pt-0.5 shrink-0">
                    {step.num}
                  </span>
                  <span className="text-[#526075]">
                    <strong className="font-semibold text-[#0F172A]">{step.title}: </strong>
                    {step.summary}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="pt-3 border-t border-[#E2E8F0] text-xs text-[#526075] flex items-center gap-1.5">
            <Lock size={13} className="text-[#1D4ED8] shrink-0" aria-hidden="true" />
            <span>Nobody sees this but you. Take as many takes as you need.</span>
          </p>
        </div>
      </div>
    );
  }

  // Onboarding editorial vertical illustrated guide
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-3xl p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base font-bold text-[#0F172A]">
          How it works
        </p>
        <span className="text-xs text-[#526075]">3 calm steps</span>
      </div>

      <div className="space-y-2.5">
        {PROCESS_STEPS.map((step, idx) => {
          const isActive = selectedStep === idx;
          return (
            <button
              key={step.num}
              type="button"
              onClick={() => setSelectedStep(idx)}
              className={`w-full text-left rounded-2xl border p-3.5 transition-all duration-150 flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                isActive
                  ? 'border-[#BFDBFE] bg-[#F0F6FF]'
                  : 'border-[#E2E8F0] bg-white hover:border-[#CFD6DF] hover:bg-[#FAFBFD]'
              }`}
            >
              {idx === 0 && <StepSceneRecord active={isActive} />}
              {idx === 1 && <StepSceneFeedback active={isActive} />}
              {idx === 2 && <StepSceneLaunch active={isActive} />}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums">
                    {step.num}
                  </span>
                  <h3 className="text-sm font-semibold text-[#0F172A] leading-snug">
                    {step.title}
                  </h3>
                </div>
                <p className="text-xs sm:text-[13px] text-[#526075] leading-relaxed">
                  {isActive ? step.detail : step.summary}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-3 border-t border-[#E2E8F0] flex items-center gap-2 text-xs text-[#526075]">
        <Lock size={13} className="text-[#1D4ED8] shrink-0" aria-hidden="true" />
        <span>Nobody sees this but you. Take as many takes as you need.</span>
      </div>
    </div>
  );
}
