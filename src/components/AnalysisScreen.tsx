import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Lock, RefreshCw } from 'lucide-react';

interface AnalysisScreenProps {
  fileName: string;
  takeNumber: number;
  uploadProgress: number | null;
  stageLabel: string | null;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

const ROTATING_MESSAGES = [
  'Listening to your delivery...',
  'Checking your hook...',
  'Reading the room...',
  'Noting your pacing and pauses...',
  'Spotting what you nailed...',
  'Putting your Vibe Check together...',
];

export function AnalysisScreen({
  fileName,
  takeNumber,
  uploadProgress,
  stageLabel,
  error,
  onRetry,
  onCancel,
}: AnalysisScreenProps) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (error) return;
    const msgTimer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % ROTATING_MESSAGES.length);
    }, 3200);
    const secTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(msgTimer);
      clearInterval(secTimer);
    };
  }, [error]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-8 sm:py-14">
        <div className="bg-white border border-[#E2E8F0] rounded-3xl p-7 sm:p-9 space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-[#FDF2F3] text-[#C03A4A] flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">
              We hit a snag analyzing that clip
            </h1>
            <p className="text-sm text-[#526075] leading-relaxed">{error}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[48px] px-5 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw size={16} />
              <span>Try again</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[48px] px-5 py-3 rounded-xl border border-[#E2E8F0] bg-white text-sm font-medium text-[#0F172A] hover:bg-[#F7F9FC] transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              <span>Back to upload</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isUploading = uploadProgress !== null && uploadProgress < 100;
  const headline = isUploading
    ? `Uploading privately... ${uploadProgress}%`
    : ROTATING_MESSAGES[msgIndex];

  return (
    <div className="max-w-xl mx-auto py-10 sm:py-16">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl p-8 sm:p-10 text-center space-y-7">
        {/* Calming geometric ring loader */}
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <svg
            className="w-20 h-20 animate-spin"
            style={{ animationDuration: '2.4s' }}
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="#E2E8F0"
              strokeWidth="4"
            />
            <path
              d="M40 6 A34 34 0 0 1 74 40"
              stroke="#1D4ED8"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
            {isUploading ? `${uploadProgress}%` : `#${takeNumber}`}
          </span>
        </div>

        <div className="space-y-2.5">
          <h1
            key={isUploading ? 'uploading' : msgIndex}
            className="font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight text-[#0F172A] transition-opacity duration-300 tabular-nums"
          >
            {headline}
          </h1>
          <p className="text-sm text-[#526075] max-w-sm mx-auto leading-relaxed">
            {isUploading ? (
              <>
                Sending <span className="font-medium text-[#0F172A]">{fileName}</span> in secure chunks so larger phone videos upload reliably.
              </>
            ) : (
              <>
                {stageLabel || 'Watching carefully'} — matching your coaching notes to exact moments in{' '}
                <span className="font-medium text-[#0F172A]">{fileName}</span>.
              </>
            )}
          </p>
        </div>

        {isUploading && (
          <div className="max-w-xs mx-auto h-2 rounded-full bg-[#E8EEF5] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1D4ED8] transition-all duration-200"
              style={{ width: `${Math.max(4, uploadProgress)}%` }}
            />
          </div>
        )}

        <div className="pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#526075]">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} className="text-[#1D4ED8]" aria-hidden="true" />
            <span>Private analysis · Deleted from server right after</span>
          </span>
          <span className="font-mono tabular-nums">{elapsedSeconds}s</span>
        </div>
      </div>
    </div>
  );
}
