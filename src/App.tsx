import { useEffect, useState } from 'react';
import { Home, TrendingUp, Upload, User } from 'lucide-react';
import {
  PracticeTake,
  UserProfile,
  VideoAnalysis,
} from './types/softlaunch';
import {
  clearAllLocalData,
  clearCachedVerdict,
  deleteVideoBlob,
  loadProfile,
  loadTakes,
  saveProfile,
  saveTakes,
  saveVideoBlob,
} from './lib/storage';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { UploadScreen } from './components/UploadScreen';
import { AnalysisScreen } from './components/AnalysisScreen';
import { ReportScreen } from './components/ReportScreen';
import { ProgressSummary } from './components/ProgressSummary';
import { SettingsView } from './components/SettingsView';

type AppView =
  | 'dashboard'
  | 'upload'
  | 'analyzing'
  | 'report'
  | 'progress'
  | 'settings';

interface PendingUpload {
  file: File;
  topicNote: string;
  durationSeconds: number;
  takeNumber: number;
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => loadProfile());
  const [takes, setTakes] = useState<PracticeTake[]>(() => loadTakes());
  const [view, setView] = useState<AppView>('dashboard');
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [stageLabel, setStageLabel] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view, selectedTakeId]);

  function handleOnboardingComplete(newProfile: UserProfile) {
    saveProfile(newProfile);
    setProfile(newProfile);
    setView('dashboard');
  }

  function handleUpdateProfile(updated: UserProfile) {
    saveProfile(updated);
    setProfile(updated);
  }

  async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function analyzeViaStatelessResumableUpload(
    payload: PendingUpload,
    activeProfile: UserProfile,
    previousFocus: string
  ): Promise<VideoAnalysis> {
    setUploadProgress(0);
    setStageLabel('Starting private upload');

    // Step 1: Start stateless resumable Gemini upload session
    const startRes = await fetch('/api/gemini-upload/start', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: payload.file.name,
        mimeType: payload.file.type,
        fileSize: payload.file.size,
        takeNumber: payload.takeNumber,
        directUploadSupported: true,
      }),
    });

    if (startRes.redirected || startRes.headers.get('content-type')?.includes('text/html')) {
      throw new Error(
        'Your session refreshed. Please reload the page once and upload your clip again.'
      );
    }

    if (startRes.status === 404 || startRes.status === 405) {
      throw new Error('FALLBACK_UPLOAD_MODE');
    }

    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData.uploadToken) {
      throw new Error(
        startData.error ||
          `Could not start the upload (HTTP ${startRes.status}). Please try again.`
      );
    }

    const uploadUrl: string = startData.uploadUrl || '';
    const uploadToken: string = startData.uploadToken;
    const chunkSize: number = startData.chunkSize || 8 * 1024 * 1024;
    const totalBytes = payload.file.size;

    if (!uploadUrl && totalBytes > 4 * 1024 * 1024) {
      throw new Error(
        'Your live deployment is still running an older backend version. Please redeploy the latest code on Vercel, hard-refresh this page, and try again.'
      );
    }

    const uploadChunkDirect = (
      url: string,
      blob: Blob,
      byteOffset: number,
      isFinalChunk: boolean
    ): Promise<{ status: number; text: string }> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('X-Goog-Upload-Offset', String(byteOffset));
        xhr.setRequestHeader(
          'X-Goog-Upload-Command',
          isFinalChunk ? 'upload, finalize' : 'upload'
        );
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && totalBytes > 0) {
            const uploadedSoFar = Math.min(totalBytes, byteOffset + ev.loaded);
            setUploadProgress(Math.min(99, Math.round((uploadedSoFar / totalBytes) * 100)));
          }
        };
        xhr.onload = () => {
          resolve({ status: xhr.status, text: xhr.responseText || '' });
        };
        xhr.onerror = () => {
          reject(new Error('Failed to fetch'));
        };
        xhr.onabort = () => {
          reject(new Error('Upload was interrupted. Please try again.'));
        };
        xhr.send(blob);
      });

    // Step 2: Upload video in exact 8 MiB chunks directly to the server-minted Gemini resumable URL
    // (no API key in browser, bypasses Vercel's 4.5 MB serverless body limit, supports up to 200 MB)
    let offset = 0;
    let uploadedFile: {
      fileName: string;
      fileUri: string;
      mimeType: string;
      state: string;
    } | null = null;

    setStageLabel('Uploading privately to your AI coach');

    while (offset < totalBytes) {
      const end = Math.min(offset + chunkSize, totalBytes);
      const isFinal = end >= totalBytes;
      const chunkBlob = payload.file.slice(offset, end);

      let chunkSucceeded = false;
      let lastChunkErr: unknown = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (uploadUrl) {
            const directRes = await uploadChunkDirect(uploadUrl, chunkBlob, offset, isFinal);
            if (directRes.status < 200 || directRes.status >= 300) {
              let errText = directRes.text.trim();
              try {
                const parsedErr = JSON.parse(errText);
                errText = parsedErr?.error?.message || parsedErr?.message || errText;
              } catch {
                // plain text error
              }
              throw new Error(
                errText || `Upload interrupted (HTTP ${directRes.status}). Please try again.`
              );
            }

            if (isFinal) {
              const parsed = JSON.parse(directRes.text || '{}') as {
                file?: { name?: string; uri?: string; mimeType?: string; state?: string };
              };
              const file = parsed.file;
              if (!file?.name || !file?.uri) {
                throw new Error('Upload completed without a video reference. Please try again.');
              }
              uploadedFile = {
                fileName: file.name,
                fileUri: file.uri,
                mimeType: file.mimeType || startData.mimeType || 'video/mp4',
                state: file.state || 'PROCESSING',
              };
            }
          } else {
            // Only reached for single-chunk clips <= 4 MB when uploadUrl isn't returned
            const chunkRes = await fetch('/api/gemini-upload/chunk', {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-token': uploadToken,
                'x-upload-offset': String(offset),
                'x-upload-final': isFinal ? '1' : '0',
              },
              body: chunkBlob,
            });

            const chunkData = await chunkRes.json().catch(() => ({}));
            if (!chunkRes.ok) {
              throw new Error(
                chunkData.error || `Upload interrupted (HTTP ${chunkRes.status}). Please try again.`
              );
            }

            if (isFinal) {
              if (!chunkData.fileName || !chunkData.fileUri) {
                throw new Error('Upload completed without a video reference. Please try again.');
              }
              uploadedFile = {
                fileName: chunkData.fileName,
                fileUri: chunkData.fileUri,
                mimeType: chunkData.mimeType || startData.mimeType || 'video/mp4',
                state: chunkData.state || 'PROCESSING',
              };
            }
          }

          chunkSucceeded = true;
          break;
        } catch (err) {
          lastChunkErr = err;
          if (attempt < 2) {
            await sleep(700 * (attempt + 1));
          }
        }
      }

      if (!chunkSucceeded) {
        throw lastChunkErr instanceof Error
          ? new Error(
              lastChunkErr.message === 'Failed to fetch'
                ? 'Connection dropped while uploading your video. Please check your internet and tap Try again.'
                : lastChunkErr.message
            )
          : new Error('Connection dropped while uploading your video.');
      }

      offset = end;
      setUploadProgress(Math.min(100, Math.round((offset / totalBytes) * 100)));
    }

    if (!uploadedFile) {
      throw new Error('Could not finalize video upload. Please try again.');
    }

    // Step 3: Poll Gemini processing status until ACTIVE (fast stateless calls)
    setUploadProgress(100);
    setStageLabel('Processing video and audio');

    let activeFileUri = uploadedFile.fileUri;
    let activeMimeType = uploadedFile.mimeType;

    if (uploadedFile.state !== 'ACTIVE') {
      let isActive = false;
      for (let i = 0; i < 60; i++) {
        await sleep(1500);
        const statusRes = await fetch('/api/gemini-upload/status', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: uploadedFile.fileName }),
        });

        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(
            statusData.error || `Could not check video processing status (HTTP ${statusRes.status}).`
          );
        }

        if (statusData.state === 'ACTIVE') {
          if (statusData.fileUri) activeFileUri = statusData.fileUri;
          if (statusData.mimeType) activeMimeType = statusData.mimeType;
          isActive = true;
          break;
        }

        if (statusData.state === 'FAILED') {
          throw new Error(
            statusData.error ||
              'Video processing failed on the AI service. Please try exporting as MP4 (H.264) and uploading again.'
          );
        }
      }

      if (!isActive) {
        throw new Error('Video took too long to process. Please try a shorter or smaller clip.');
      }
    }

    // Step 4: Stream Gemini coaching analysis on the ACTIVE file (auto-retries once in fastMode on 504 without re-uploading)
    const runAnalyzeStep = async (fastMode: boolean): Promise<VideoAnalysis> => {
      setStageLabel(
        fastMode
          ? 'Switching to our fast AI coach to finish your notes'
          : 'Watching and writing your coaching notes'
      );

      const analyzeRes = await fetch('/api/gemini-upload/analyze', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadedFile!.fileName,
          fileUri: activeFileUri,
          mimeType: activeMimeType,
          niche: activeProfile.niche,
          goal: activeProfile.goal,
          initialConfidence: String(activeProfile.initialConfidence),
          topic: payload.topicNote,
          takeNumber: payload.takeNumber,
          durationSeconds: payload.durationSeconds,
          previousFocus,
          fastMode,
        }),
      });

      if (analyzeRes.redirected || analyzeRes.headers.get('content-type')?.includes('text/html')) {
        throw new Error(
          'Your session refreshed while analyzing. Please reload the page once and try again.'
        );
      }

      if (!analyzeRes.ok) {
        if (!fastMode && [502, 503, 504].includes(analyzeRes.status)) {
          throw new Error('RETRY_FAST_MODE');
        }
        const errData = await analyzeRes.json().catch(() => ({}));
        throw new Error(
          errData.error ||
            `Video analysis failed (HTTP ${analyzeRes.status}). Please tap Try again.`
        );
      }

      const contentType = analyzeRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const analyzeData = await analyzeRes.json().catch(() => ({}));
        if (analyzeData.analysis) {
          return analyzeData.analysis as VideoAnalysis;
        }
        throw new Error(analyzeData.error || 'Could not parse analysis response.');
      }

      if (!analyzeRes.body) {
        throw new Error('Could not read analysis stream from server.');
      }

      const reader = analyzeRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: VideoAnalysis | null = null;
      let shouldRetryFast = false;

      const handleLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        let event: { type?: string; label?: string; analysis?: VideoAnalysis; error?: string };
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event.type === 'stage' && typeof event.label === 'string') {
          setStageLabel(event.label);
        } else if (event.type === 'completed' && event.analysis) {
          result = event.analysis;
        } else if (event.type === 'retry_fast') {
          shouldRetryFast = true;
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Video analysis failed.');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            handleLine(line);
          }
        }
        if (done) break;
      }

      if (buffer.trim()) {
        handleLine(buffer);
      }

      if (shouldRetryFast && !fastMode) {
        throw new Error('RETRY_FAST_MODE');
      }

      if (!result) {
        if (!fastMode) {
          throw new Error('RETRY_FAST_MODE');
        }
        throw new Error('Analysis ended before your report was ready. Please tap Try again.');
      }

      return result;
    };

    try {
      return await runAnalyzeStep(false);
    } catch (analyzeErr) {
      if (analyzeErr instanceof Error && analyzeErr.message === 'RETRY_FAST_MODE') {
        return await runAnalyzeStep(true);
      }
      throw analyzeErr;
    }
  }

  async function analyzeViaDirectUpload(
    payload: PendingUpload,
    activeProfile: UserProfile,
    previousFocus: string
  ): Promise<VideoAnalysis> {
    const formData = new FormData();
    formData.append('video', payload.file);
    formData.append('niche', activeProfile.niche);
    formData.append('goal', activeProfile.goal);
    formData.append('initialConfidence', String(activeProfile.initialConfidence));
    formData.append('topic', payload.topicNote);
    formData.append('takeNumber', String(payload.takeNumber));
    formData.append('durationSeconds', String(payload.durationSeconds));
    formData.append('previousFocus', previousFocus);

    setUploadProgress(null);
    setStageLabel('Uploading privately to your AI coach');

    const response = await fetch('/api/analyze-video', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });

    if (response.redirected || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(
        'Your session refreshed on the live preview. Please reload the page once and upload your clip again.'
      );
    }

    if (response.status === 404 || response.status === 405) {
      throw new Error(
        `The video coaching backend (/api) is not reachable on this URL (HTTP ${response.status}). Make sure you deployed the latest code including api/index.ts and vercel.json, then refresh and try again.`
      );
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.analysis) {
      throw new Error(
        data.error || `Upload failed (HTTP ${response.status}). Please try again.`
      );
    }

    return data.analysis as VideoAnalysis;
  }

  async function analyzeViaSingleStream(
    payload: PendingUpload,
    activeProfile: UserProfile,
    previousFocus: string
  ): Promise<VideoAnalysis> {
    const formData = new FormData();
    formData.append('video', payload.file);
    formData.append('niche', activeProfile.niche);
    formData.append('goal', activeProfile.goal);
    formData.append('initialConfidence', String(activeProfile.initialConfidence));
    formData.append('topic', payload.topicNote);
    formData.append('takeNumber', String(payload.takeNumber));
    formData.append('durationSeconds', String(payload.durationSeconds));
    formData.append('previousFocus', previousFocus);

    setUploadProgress(null);
    setStageLabel('Uploading privately to your AI coach');

    const response = await fetch('/api/analyze-video-stream', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });

    if (response.redirected || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(
        'Your session refreshed on the live preview. Please reload the page once and upload your clip again.'
      );
    }

    if (response.status === 413 || response.status === 404 || response.status === 405) {
      throw new Error('FALLBACK_UPLOAD_MODE');
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Upload failed (HTTP ${response.status}). Please try again.`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.analysis) return data.analysis as VideoAnalysis;
      throw new Error(data.error || 'Could not parse analysis response.');
    }

    if (!response.body) {
      throw new Error('Could not read analysis stream from server.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: VideoAnalysis | null = null;

    const handleStreamLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      let event: { type?: string; label?: string; analysis?: VideoAnalysis; error?: string };
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === 'stage' && typeof event.label === 'string') {
        setStageLabel(event.label);
      } else if (event.type === 'completed' && event.analysis) {
        result = event.analysis;
      } else if (event.type === 'error') {
        throw new Error(event.error || 'Video analysis failed.');
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          handleStreamLine(rawLine);
        }
      }
      if (done) break;
    }

    if (buffer.trim()) {
      handleStreamLine(buffer);
    }

    if (!result) {
      throw new Error('Analysis ended before your report was ready. Please tap Try again.');
    }
    return result;
  }

  async function runAnalysis(payload: PendingUpload) {
    if (!profile) return;
    setPendingUpload(payload);
    setAnalysisError(null);
    setUploadProgress(null);
    setStageLabel('Preparing your clip');
    setView('analyzing');

    try {
      const latestTake = takes.length > 0 ? takes[takes.length - 1] : null;
      const previousFocus = latestTake?.analysis.focus_for_next_take || '';

      let analysisResult: VideoAnalysis;
      try {
        // Primary path: 100% stateless 2.5 MB resumable Gemini upload (works on Vercel + Cloud Run + Dev)
        analysisResult = await analyzeViaStatelessResumableUpload(payload, profile, previousFocus);
      } catch (resumableErr) {
        if (resumableErr instanceof Error && resumableErr.message === 'FALLBACK_UPLOAD_MODE') {
          try {
            analysisResult = await analyzeViaSingleStream(payload, profile, previousFocus);
          } catch (streamErr) {
            if (streamErr instanceof Error && streamErr.message === 'FALLBACK_UPLOAD_MODE') {
              analysisResult = await analyzeViaDirectUpload(payload, profile, previousFocus);
            } else {
              throw streamErr;
            }
          }
        } else {
          throw resumableErr;
        }
      }

      const id = `take-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTake: PracticeTake = {
        id,
        takeNumber: payload.takeNumber,
        createdAt: new Date().toISOString(),
        fileName: payload.file.name,
        durationSeconds: payload.durationSeconds,
        topicNote: payload.topicNote,
        analysis: analysisResult,
      };

      await saveVideoBlob(id, payload.file);
      const updatedTakes = [...takes, newTake];
      saveTakes(updatedTakes);
      clearCachedVerdict();
      setTakes(updatedTakes);
      setSelectedTakeId(id);
      setPendingUpload(null);
      setUploadProgress(null);
      setStageLabel(null);
      setView('report');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message === 'Failed to fetch'
            ? 'Could not reach the Soft Launch server. Please check your connection and tap Try again.'
            : err.message
          : 'Unable to reach the coaching service. Please try again.';
      setAnalysisError(msg);
      setUploadProgress(null);
      setStageLabel(null);
    }
  }

  async function handleDeleteTake(takeId: string) {
    await deleteVideoBlob(takeId);
    const remaining = takes.filter((t) => t.id !== takeId);
    saveTakes(remaining);
    clearCachedVerdict();
    setTakes(remaining);
    setSelectedTakeId(null);
    setView('dashboard');
  }

  async function handleResetAll() {
    await clearAllLocalData();
    setTakes([]);
    setProfile(null);
    setSelectedTakeId(null);
    setView('dashboard');
  }

  if (!profile) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const nextTakeNumber =
    takes.length > 0 ? Math.max(...takes.map((t) => t.takeNumber)) + 1 : 1;
  const latestFocus =
    takes.length > 0 ? takes[takes.length - 1].analysis.focus_for_next_take : undefined;

  const selectedTakeIndex = selectedTakeId
    ? takes.findIndex((t) => t.id === selectedTakeId)
    : -1;
  const selectedTake = selectedTakeIndex >= 0 ? takes[selectedTakeIndex] : null;
  const previousTake =
    selectedTakeIndex > 0 ? takes[selectedTakeIndex - 1] : null;

  const isAnalyzing = view === 'analyzing';

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#0F172A] flex flex-col">
      {/* Top Bar: Clean 3-zone contract on desktop; non-sticky on mobile so only bottom tab bar is fixed (well under 15% cap) */}
      <header className="w-full border-b border-[#E2E8F0] bg-white md:sticky md:top-0 md:z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => setView('dashboard')}
            className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            <img
              src="/assets/aistudio/Frame_82_cb640462.png"
              alt="Soft Launch logo"
              referrerPolicy="no-referrer"
              className="h-7 w-auto object-contain mix-blend-multiply hue-rotate-[58deg] saturate-125 shrink-0"
            />
            <span>Soft Launch</span>
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => setView('dashboard')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'dashboard' || view === 'report'
                  ? 'text-[#0F172A] underline underline-offset-8 decoration-[#1D4ED8] decoration-2'
                  : 'text-[#526075] hover:text-[#0F172A]'
              }`}
            >
              Practice
            </button>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => setView('progress')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'progress'
                  ? 'text-[#0F172A] underline underline-offset-8 decoration-[#1D4ED8] decoration-2'
                  : 'text-[#526075] hover:text-[#0F172A]'
              }`}
            >
              Progress
            </button>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => setView('settings')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                view === 'settings'
                  ? 'text-[#0F172A] underline underline-offset-8 decoration-[#1D4ED8] decoration-2'
                  : 'text-[#526075] hover:text-[#0F172A]'
              }`}
            >
              Profile
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => setView('upload')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold hover:bg-[#1E40AF] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              Upload take
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:py-10">
        {view === 'dashboard' && (
          <Dashboard
            profile={profile}
            takes={takes}
            onUploadClick={() => setView('upload')}
            onSelectTake={(id) => {
              setSelectedTakeId(id);
              setView('report');
            }}
            onOpenProgress={() => setView('progress')}
          />
        )}

        {view === 'upload' && (
          <UploadScreen
            nextTakeNumber={nextTakeNumber}
            previousFocus={latestFocus}
            onBack={() => setView('dashboard')}
            onAnalyze={({ file, topicNote, durationSeconds }) =>
              runAnalysis({
                file,
                topicNote,
                durationSeconds,
                takeNumber: nextTakeNumber,
              })
            }
          />
        )}

        {view === 'analyzing' && pendingUpload && (
          <AnalysisScreen
            fileName={pendingUpload.file.name}
            takeNumber={pendingUpload.takeNumber}
            uploadProgress={uploadProgress}
            stageLabel={stageLabel}
            error={analysisError}
            onRetry={() => runAnalysis(pendingUpload)}
            onCancel={() => {
              setAnalysisError(null);
              setUploadProgress(null);
              setStageLabel(null);
              setView('upload');
            }}
          />
        )}

        {view === 'report' && selectedTake && (
          <ReportScreen
            take={selectedTake}
            previousTake={previousTake}
            niche={profile.niche}
            onBack={() => setView('dashboard')}
            onUploadNext={() => setView('upload')}
            onDelete={handleDeleteTake}
          />
        )}

        {view === 'progress' && (
          <ProgressSummary
            profile={profile}
            takes={takes}
            onUploadNext={() => setView('upload')}
            onSelectTake={(id) => {
              setSelectedTakeId(id);
              setView('report');
            }}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            profile={profile}
            takesCount={takes.length}
            onUpdateProfile={handleUpdateProfile}
            onResetAll={handleResetAll}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb-zone navigation, single compact 60px sticky bar <= 10% viewport height) */}
      {!isAnalyzing && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe"
        >
          <div className="grid grid-cols-4 h-[60px]">
            <button
              type="button"
              onClick={() => setView('dashboard')}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                view === 'dashboard' || view === 'report'
                  ? 'text-[#1D4ED8]'
                  : 'text-[#526075]'
              }`}
            >
              <Home size={20} strokeWidth={view === 'dashboard' || view === 'report' ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium leading-none">Practice</span>
            </button>

            <button
              type="button"
              onClick={() => setView('upload')}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                view === 'upload' ? 'text-[#1D4ED8]' : 'text-[#526075]'
              }`}
            >
              <Upload size={20} strokeWidth={view === 'upload' ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium leading-none">Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setView('progress')}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                view === 'progress' ? 'text-[#1D4ED8]' : 'text-[#526075]'
              }`}
            >
              <TrendingUp size={20} strokeWidth={view === 'progress' ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium leading-none">Progress</span>
            </button>

            <button
              type="button"
              onClick={() => setView('settings')}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                view === 'settings' ? 'text-[#1D4ED8]' : 'text-[#526075]'
              }`}
            >
              <User size={20} strokeWidth={view === 'settings' ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium leading-none">Profile</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
