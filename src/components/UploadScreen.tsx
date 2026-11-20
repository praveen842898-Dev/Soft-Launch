import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Film,
  Lock,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { formatSeconds } from '../types/softlaunch';

interface UploadScreenProps {
  nextTakeNumber: number;
  previousFocus?: string;
  onBack: () => void;
  onAnalyze: (payload: {
    file: File;
    topicNote: string;
    durationSeconds: number;
  }) => void;
}

const MAX_DURATION_SECONDS = 180; // 3 minutes
const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

export function UploadScreen({
  nextTakeNumber,
  previousFocus,
  onBack,
  onAnalyze,
}: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [topicNote, setTopicNote] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkingMetadata, setCheckingMetadata] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function clearFile() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setDurationSeconds(0);
    setErrorMsg(null);
    setCheckingMetadata(false);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function handleFileSelection(file: File | undefined) {
    if (!file) return;
    setErrorMsg(null);

    const ext = file.name.toLowerCase().split('.').pop() || '';
    const validType =
      ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'].includes(file.type) ||
      ['mp4', 'mov', 'webm'].includes(ext);

    if (!validType) {
      setErrorMsg('Please choose an MP4, MOV, or WebM video file.');
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setErrorMsg('That file is over 200 MB. Try a clip under 3 minutes or standard phone resolution.');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setCheckingMetadata(true);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);

    // Probe duration cleanly via offscreen video element
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const dur = Number.isFinite(probe.duration) ? probe.duration : 0;
      setCheckingMetadata(false);
      if (dur > MAX_DURATION_SECONDS + 1) {
        setErrorMsg(
          `This clip is ${formatSeconds(dur)} long. Soft Launch works best with practice videos up to 3:00 — please trim it a bit and re-upload.`
        );
        URL.revokeObjectURL(objectUrl);
        setSelectedFile(null);
        setPreviewUrl(null);
        setDurationSeconds(0);
        return;
      }
      setDurationSeconds(Math.round(dur));
    };
    probe.onerror = () => {
      setCheckingMetadata(false);
      // Still allow upload if browser cannot preview codec (e.g., HEVC MOV), Gemini can still decode it
      setDurationSeconds(0);
    };
    probe.src = objectUrl;
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelection(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || checkingMetadata) return;
    onAnalyze({
      file: selectedFile,
      topicNote: topicNote.trim(),
      durationSeconds,
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3 -ml-3 rounded-xl text-sm font-medium text-[#526075] hover:text-[#0F172A] hover:bg-[#E8EEF5] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <ArrowLeft size={16} />
          <span>Back to practice room</span>
        </button>
        <span className="font-mono text-xs text-[#526075] tabular-nums">
          Take #{nextTakeNumber}
        </span>
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
          Upload a practice video
        </h1>
        <p className="text-sm sm:text-[15px] text-[#526075]">
          Rough takes are welcome. Talk to the camera like you&apos;re explaining an idea to one friend.
        </p>
      </div>

      {previousFocus && (
        <div className="rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] p-4 sm:p-5 flex items-start gap-3">
          <Sparkles size={18} className="text-[#1D4ED8] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-[#1D4ED8]">
              Your focus cue from Take #{nextTakeNumber - 1}
            </p>
            <p className="text-sm text-[#0F172A] leading-relaxed">{previousFocus}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 space-y-6">
        {!selectedFile ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
              isDragging
                ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                : 'border-[#D5DBE3] bg-[#F7F9FC] hover:border-[#9CA6B5]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => handleFileSelection(e.target.files?.[0])}
              className="hidden"
              id="video-upload-input"
            />
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E2E8F0] text-[#1D4ED8] flex items-center justify-center mx-auto mb-4">
              <Upload size={22} />
            </div>
            <p className="font-display text-lg font-semibold text-[#0F172A]">
              Drop your video here, or browse files
            </p>
            <p className="text-xs sm:text-sm text-[#526075] mt-1.5">
              MP4, MOV, or WebM · Max 3 minutes · Up to 200 MB
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] transition-colors inline-flex items-center gap-2"
              >
                <Film size={16} />
                <span>Choose video</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-[#11151B] border border-[#E2E8F0]">
              {previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full max-h-[380px] object-contain mx-auto"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#526075] min-w-0">
                <span className="font-medium text-[#0F172A] truncate max-w-[220px] sm:max-w-xs">
                  {selectedFile.name}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {durationSeconds > 0 ? formatSeconds(durationSeconds) : 'Ready'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>

              <button
                type="button"
                onClick={clearFile}
                className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-[#526075] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <X size={14} />
                <span>Pick a different video</span>
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-2xl bg-[#FDF2F3] border border-[#F3CCD1] p-4 flex items-start gap-3 text-sm text-[#9B2837]"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="topic-note"
            className="block text-sm font-medium text-[#0F172A]"
          >
            What is this video about?{' '}
            <span className="font-normal text-[#526075]">(optional)</span>
          </label>
          <input
            id="topic-note"
            type="text"
            value={topicNote}
            onChange={(e) => setTopicNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. Sharing 3 lessons from my first freelance design client"
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[#D5DBE3] bg-white text-sm text-[#0F172A] placeholder:text-[#8A94A3] focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
          />
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#E2E8F0]">
          <p className="text-xs sm:text-sm text-[#526075] flex items-center gap-2 pt-2 sm:pt-0">
            <Lock size={15} className="text-[#1D4ED8] shrink-0" aria-hidden="true" />
            <span>Private by default. Only you can see this.</span>
          </p>

          <button
            type="submit"
            disabled={!selectedFile || checkingMetadata}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <span>{checkingMetadata ? 'Checking clip...' : 'Analyze my video'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
