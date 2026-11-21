import 'dotenv/config';
import crypto from 'crypto';
import express, { type Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type, createPartFromUri } from '@google/genai';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB max
const INLINE_FALLBACK_MAX_BYTES = 15 * 1024 * 1024; // 15 MB inline fallback
const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB (exact Gemini Files API chunk granularity)
const LOCAL_CHUNK_BYTES = 4 * 1024 * 1024;
const GEMINI_UPLOAD_ORIGIN = 'https://generativelanguage.googleapis.com/upload/';

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);

function normalizeBaseMimeType(mimeType: string): string {
  return (mimeType || '').split(';')[0].trim().toLowerCase();
}

function resolveVideoMimeType(mimeType: string, fileName: string): string {
  const base = normalizeBaseMimeType(mimeType);
  if (ALLOWED_MIME_TYPES.has(base)) {
    return base === 'video/x-m4v' ? 'video/mp4' : base;
  }
  if (base.startsWith('video/')) {
    return base;
  }
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return 'video/mp4';
}

function isValidVideoFile(mimeType: string, fileName: string): boolean {
  const base = normalizeBaseMimeType(mimeType);
  const ext = path.extname(fileName || '').toLowerCase();
  return (
    base.startsWith('video/') ||
    ALLOWED_MIME_TYPES.has(base) ||
    ['.mp4', '.mov', '.webm', '.m4v'].includes(ext)
  );
}

function resolveApiKey(): string {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.API_KEY,
    process.env.VITE_GEMINI_API_KEY,
  ];
  for (const candidate of candidates) {
    const cleaned = (candidate || '').trim().replace(/^["']|["']$/g, '');
    if (cleaned && cleaned !== 'MY_GEMINI_API_KEY') {
      return cleaned;
    }
  }
  return '';
}

function getApiKey(): string {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('MISSING_GEMINI_API_KEY');
  }
  return apiKey;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function signUploadUrl(uploadUrl: string, apiKey: string): string {
  const sig = crypto.createHmac('sha256', apiKey).update(uploadUrl).digest('base64url');
  return Buffer.from(JSON.stringify({ u: uploadUrl, s: sig }), 'utf8').toString('base64url');
}

function verifyUploadToken(token: string, apiKey: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      u?: unknown;
      s?: unknown;
    };
    if (typeof decoded.u !== 'string' || typeof decoded.s !== 'string') return null;
    if (!decoded.u.startsWith(GEMINI_UPLOAD_ORIGIN)) return null;

    const expected = crypto.createHmac('sha256', apiKey).update(decoded.u).digest('base64url');
    const a = Buffer.from(decoded.s, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return decoded.u;
  } catch {
    return null;
  }
}

const uploadDir = path.join(os.tmpdir(), 'soft-launch-uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {
  // Ignore if tmpdir already exists or is read-only
}

interface UploadSession {
  id: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  expectedSize: number;
  receivedBytes: number;
  createdAt: number;
  inUse: boolean;
}

type JobStatus =
  | 'uploading_to_ai'
  | 'processing_video'
  | 'analyzing'
  | 'completed'
  | 'failed';

interface AnalysisJob {
  id: string;
  status: JobStatus;
  stageNote?: string;
  analysis?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface AnalysisContext {
  niche: string;
  goal: string;
  initialConfidence: string;
  topic: string;
  takeNumber: number;
  durationSeconds: number;
  previousFocus: string;
}

const uploadSessions = new Map<string, UploadSession>();
const analysisJobs = new Map<string, AnalysisJob>();

if (!process.env.VERCEL) {
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of uploadSessions.entries()) {
      if (!session.inUse && now - session.createdAt > 15 * 60 * 1000) {
        fs.unlink(session.filePath, () => {});
        uploadSessions.delete(id);
      }
    }
    for (const [id, job] of analysisJobs.entries()) {
      if (now - job.updatedAt > 20 * 60 * 1000) {
        analysisJobs.delete(id);
      }
    }
  }, 60 * 1000).unref();
}

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
    } catch {
      // ignore
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4').toLowerCase() || '.mp4';
    cb(null, `take-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: MAX_VIDEO_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (isValidVideoFile(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Please upload an MP4, MOV, or WebM video file.'));
    }
  },
});

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    video_summary: {
      type: Type.STRING,
      description: 'Short 1-2 sentence summary of what the video is about.',
    },
    filler_words: {
      type: Type.ARRAY,
      description:
        'List of distinct filler words detected (e.g. "um", "uh", "like", "you know", "basically", "actually", "so") with counts and approximate MM:SS timestamps. Empty array if none detected.',
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          count: { type: Type.INTEGER },
          timestamps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Approximate timestamps in MM:SS format where this filler word occurred.',
          },
        },
        required: ['word', 'count', 'timestamps'],
      },
    },
    speaking_pace: {
      type: Type.OBJECT,
      properties: {
        approx_wpm: {
          type: Type.INTEGER,
          description: 'Estimated speaking pace in words per minute.',
        },
        assessment: {
          type: Type.STRING,
          enum: ['Too slow', 'Slightly slow', 'Just right', 'Slightly fast', 'Too fast'],
        },
        notes: {
          type: Type.STRING,
          description: 'Concrete observation about rhythm, pauses, and breathing.',
        },
      },
      required: ['approx_wpm', 'assessment', 'notes'],
    },
    hook_analysis: {
      type: Type.OBJECT,
      properties: {
        seconds_to_main_point: {
          type: Type.NUMBER,
          description: 'Approximate seconds from start until the creator gets to the main point.',
        },
        assessment: {
          type: Type.STRING,
          description: 'Honest, encouraging evaluation of the opening 3-5 seconds.',
        },
        suggested_hook: {
          type: Type.STRING,
          description: 'A sharper, natural-sounding rewritten opening line tailored to their actual topic.',
        },
      },
      required: ['seconds_to_main_point', 'assessment', 'suggested_hook'],
    },
    camera_presence: {
      type: Type.OBJECT,
      properties: {
        eye_contact_note: {
          type: Type.STRING,
          description: 'AI visual estimate of lens eye contact and gaze habits.',
        },
        facial_expression_note: {
          type: Type.STRING,
          description: 'AI visual estimate of warmth, tension, and expressiveness.',
        },
        body_language_note: {
          type: Type.STRING,
          description: 'AI visual estimate of posture, framing, and hand movement.',
        },
        is_ai_estimate_note: {
          type: Type.STRING,
          description: 'Short disclaimer clarifying these visual cues are AI estimates.',
        },
      },
      required: [
        'eye_contact_note',
        'facial_expression_note',
        'body_language_note',
        'is_ai_estimate_note',
      ],
    },
    delivery_details: {
      type: Type.OBJECT,
      properties: {
        energy_note: {
          type: Type.STRING,
          description: 'Observation about vocal energy, enthusiasm, and tonal variety.',
        },
        clarity_note: {
          type: Type.STRING,
          description: 'Observation about articulation, volume, and audio clarity.',
        },
      },
      required: ['energy_note', 'clarity_note'],
    },
    content_structure: {
      type: Type.OBJECT,
      properties: {
        opening: { type: Type.STRING },
        middle: { type: Type.STRING },
        closing: { type: Type.STRING },
      },
      required: ['opening', 'middle', 'closing'],
    },
    overall_confidence_impression: {
      type: Type.STRING,
      description: 'Warm, grounded 1-2 sentence reflection on how confident and natural they came across.',
    },
    scores: {
      type: Type.OBJECT,
      properties: {
        vibe_check_score: {
          type: Type.INTEGER,
          description: 'Overall Vibe Check score from 0 to 100.',
        },
        confidence: { type: Type.INTEGER },
        clarity: { type: Type.INTEGER },
        pacing: { type: Type.INTEGER },
        hook: { type: Type.INTEGER },
        eye_contact: { type: Type.INTEGER },
        energy: { type: Type.INTEGER },
        structure: { type: Type.INTEGER },
      },
      required: [
        'vibe_check_score',
        'confidence',
        'clarity',
        'pacing',
        'hook',
        'eye_contact',
        'energy',
        'structure',
      ],
    },
    vibe_check_summary: {
      type: Type.STRING,
      description:
        'Fun, warm, human one-liner summarizing the take (Gen Z friendly, grounded, never cringe).',
    },
    strengths: {
      type: Type.ARRAY,
      description: '2 to 3 specific things they genuinely did well in this clip.',
      items: { type: Type.STRING },
    },
    improvements: {
      type: Type.ARRAY,
      description: '2 to 3 concrete, actionable improvements grounded in specific moments of the video.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          timestamp: {
            type: Type.STRING,
            description: 'Timestamp in MM:SS format (e.g. "0:08").',
          },
          seconds: {
            type: Type.INTEGER,
            description: 'Timestamp in whole seconds for video seeking.',
          },
          what_happened: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          concrete_fix: { type: Type.STRING },
        },
        required: [
          'title',
          'timestamp',
          'seconds',
          'what_happened',
          'why_it_matters',
          'concrete_fix',
        ],
      },
    },
    focus_for_next_take: {
      type: Type.STRING,
      description: 'One single, super-clear, doable focus cue for their very next take.',
    },
    tips_and_tricks: {
      type: Type.ARRAY,
      description:
        '3 to 5 tailored coaching tips & tricks matching their niche and weakest scoring area.',
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          title: { type: Type.STRING },
          tip: { type: Type.STRING },
        },
        required: ['category', 'title', 'tip'],
      },
    },
    retention_risk_moments: {
      type: Type.ARRAY,
      description: '1 to 3 moments where viewers would likely drop off, with timestamps and honest reasons.',
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: {
            type: Type.STRING,
            description: 'Timestamp in MM:SS format.',
          },
          seconds: {
            type: Type.INTEGER,
            description: 'Timestamp in whole seconds for video seeking.',
          },
          reason: {
            type: Type.STRING,
            description: 'Why a viewer might scroll past or tune out at this point.',
          },
        },
        required: ['timestamp', 'seconds', 'reason'],
      },
    },
    launch_estimate: {
      type: Type.OBJECT,
      properties: {
        readiness_label: {
          type: Type.STRING,
          enum: ['Not ready yet', 'Almost there', 'Ready to launch'],
        },
        summary: {
          type: Type.STRING,
          description: 'Warm, grounded assessment of what would happen if they posted this take today.',
        },
        expected_retention_note: {
          type: Type.STRING,
          description: 'Honest note about viewer attention & pacing quality (without predicting views or virality).',
        },
      },
      required: ['readiness_label', 'summary', 'expected_retention_note'],
    },
  },
  required: [
    'video_summary',
    'filler_words',
    'speaking_pace',
    'hook_analysis',
    'camera_presence',
    'delivery_details',
    'content_structure',
    'overall_confidence_impression',
    'scores',
    'vibe_check_summary',
    'strengths',
    'improvements',
    'focus_for_next_take',
    'tips_and_tricks',
    'retention_risk_moments',
    'launch_estimate',
  ],
};

const progressVerdictSchema = {
  type: Type.OBJECT,
  properties: {
    readiness_label: {
      type: Type.STRING,
      enum: ['Not ready yet', 'Almost there', 'Ready to launch'],
    },
    headline: {
      type: Type.STRING,
      description: 'Short warm editorial headline summarizing their journey (max 10 words).',
    },
    verdict_summary: {
      type: Type.STRING,
      description: '2-3 encouraging, specific sentences comparing Take 1 to the latest take.',
    },
    biggest_win: {
      type: Type.STRING,
      description: 'The most meaningful visible improvement across their practice takes.',
    },
    final_nudge: {
      type: Type.STRING,
      description: 'One concrete, low-pressure recommendation for whether to hit post or film one more take.',
    },
  },
  required: ['readiness_label', 'headline', 'verdict_summary', 'biggest_win', 'final_nudge'],
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = extractRawErrorMessage(err).toLowerCase();
  const status = (err as { status?: number; code?: number } | null)?.status;
  const code = (err as { status?: number; code?: number } | null)?.code;
  return (
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    code === 503 ||
    code === 500 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('temporarily') ||
    msg.includes('internal') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

async function withTransientRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientGeminiError(err) || attempt === maxAttempts) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 500);
      await sleep(baseDelayMs * attempt + jitter);
    }
  }
  throw lastError;
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
  },
  onStageNote?: (note: string) => void
) {
  const plan: { model: string; attempts: number; label: string }[] = [
    { model: PRIMARY_MODEL, attempts: 3, label: 'primary' },
    { model: FALLBACK_MODEL, attempts: 2, label: 'backup' },
  ];

  let lastError: unknown;

  for (const tier of plan) {
    for (let attempt = 1; attempt <= tier.attempts; attempt++) {
      try {
        if (tier.label === 'backup' && attempt === 1) {
          onStageNote?.('Primary AI coach is busy — switching to our fast backup coach');
        } else if (attempt > 1) {
          onStageNote?.(
            `AI servers are busy right now — retrying automatically (${attempt}/${tier.attempts})`
          );
        }

        const response = await ai.models.generateContent({
          model: tier.model,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contents: params.contents as any,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            responseSchema: params.responseSchema as any,
          },
        });

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new Error('The AI coach returned an empty response. Please try analyzing again.');
        }
        return JSON.parse(rawText);
      } catch (err) {
        lastError = err;
        const errMsg = extractRawErrorMessage(err);
        const lowerErr = errMsg.toLowerCase();
        console.warn(
          `Gemini ${tier.model} attempt ${attempt}/${tier.attempts} failed:`,
          errMsg
        );
        const isModelUnavailable =
          lowerErr.includes('not_found') ||
          lowerErr.includes('404') ||
          lowerErr.includes('is not found') ||
          lowerErr.includes('not supported');
        if (isModelUnavailable) {
          // Skip retries on this model and try the backup model in plan
          break;
        }
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        if (attempt < tier.attempts) {
          const delayMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 600);
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError;
}

function buildCoachingPrompts(ctx: AnalysisContext) {
  const systemInstruction = `You are the private video coach inside "Soft Launch", a safe practice space for camera-shy people becoming content creators.
Your voice is warm, honest, grounded, encouraging, and gently playful (Gen Z friendly, never cringe, never harsh, never corporate or generic).
Core coaching principles:
- Always lead with specific things they genuinely did well.
- Be honest and concrete about improvements—kind honesty builds real confidence.
- Ground EVERY observation in what actually happens in the video audio and visuals, using accurate timestamps within the video's duration (${ctx.durationSeconds > 0 ? `${Math.round(ctx.durationSeconds)} seconds` : 'the clip length'}).
- Note explicitly in camera_presence.is_ai_estimate_note that eye contact, facial expressions, and posture readings are AI visual estimates.
- Calibrate scores honestly on a 0-100 scale (typical first practice takes score 52-74; polished confident takes score 78-92; avoid giving everyone 95).
- For launch_estimate.readiness_label, choose:
  - "Not ready yet" if the delivery has major pacing/clarity/hook blockers or vibe_check_score < 62
  - "Almost there" if it's genuinely solid with 1-2 quick fixes or vibe_check_score 62-77
  - "Ready to launch" if it feels natural, clear, and engaging enough to post today (typically vibe_check_score >= 78)
- Focus for next take must be ONE single, specific, immediately practicable cue.
- Return STRICT JSON matching the schema.`;

  const userPrompt = `Analyze this private practice video (Take #${ctx.takeNumber}).
Creator profile:
- Content niche: ${ctx.niche}
- Primary goal: ${ctx.goal}
- Self-rated camera confidence: ${ctx.initialConfidence}/5
${ctx.topic ? `- Creator's note on what this video is about: "${ctx.topic}"` : '- Creator did not enter a topic note — summarize what the video is about from the clip.'}
${ctx.previousFocus ? `- What they were trying to improve from their previous take: "${ctx.previousFocus}"` : ''}
${ctx.durationSeconds > 0 ? `- Clip duration: ${Math.round(ctx.durationSeconds)} seconds (ensure all timestamps stay within 0:00 and ${Math.floor(ctx.durationSeconds / 60)}:${String(Math.round(ctx.durationSeconds % 60)).padStart(2, '0')}).` : ''}

Carefully watch and listen to the full clip. Evaluate:
1. Short summary of what the video is about.
2. Filler words with exact counts and approximate MM:SS timestamps.
3. Speaking pace (approx WPM) and pacing notes.
4. Hook effectiveness: how many seconds until the main point, plus a stronger rewritten hook tailored to their actual topic.
5. Eye contact / camera engagement, facial expressions, body language and posture (clearly framed as AI estimates).
6. Energy, enthusiasm, and voice clarity.
7. Content structure & storytelling (opening, middle, close/CTA).
8. Overall confidence impression.
9. 0-100 scores for confidence, clarity, pacing, hook, eye_contact, energy, structure, and overall vibe_check_score.
10. Fun one-line vibe_check_summary, 2-3 specific strengths, 2-3 timestamped improvements (what happened, why it matters, one concrete fix), exactly ONE focus_for_next_take, 3-5 niche-tailored tips_and_tricks targeting their weakest area, retention_risk_moments with timestamps, and launch_estimate.`;

  return { systemInstruction, userPrompt };
}

async function waitForFileActive(ai: GoogleGenAI, fileName: string) {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const fileInfo = await withTransientRetry(() => ai.files.get({ name: fileName }), 3, 1500);
    if (fileInfo.state === 'ACTIVE') {
      return fileInfo;
    }
    if (fileInfo.state === 'FAILED') {
      const reason = fileInfo.error?.message ? ` (${fileInfo.error.message})` : '';
      console.warn(`Gemini Files API processing failed for ${fileName}${reason}`);
      throw new Error(
        'Video processing failed on the AI service. Please try exporting as MP4 (H.264) and uploading again.'
      );
    }
    await sleep(1500);
  }
  throw new Error('Video took too long to process. Please try a shorter or smaller clip.');
}

async function analyzeVideoFile(
  filePath: string,
  mimeType: string,
  ctx: AnalysisContext,
  onStageChange?: (stage: JobStatus, note?: string) => void
) {
  let uploadedFileName: string | null = null;
  let ai: GoogleGenAI | null = null;

  try {
    ai = getGeminiClient();
    const cleanMime = normalizeBaseMimeType(mimeType) || 'video/mp4';
    const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (!fileStats || fileStats.size <= 0) {
      throw new Error('Uploaded video file was empty. Please pick your video again.');
    }

    let videoPart: unknown;

    try {
      onStageChange?.('uploading_to_ai', 'Preparing your clip for private review');
      const uploaded = await withTransientRetry(
        () =>
          ai!.files.upload({
            file: filePath,
            config: {
              mimeType: cleanMime,
              displayName: `soft-launch-take-${ctx.takeNumber}`,
            },
          }),
        3,
        2000
      );

      if (!uploaded.name) {
        throw new Error('Failed to register video for analysis.');
      }
      uploadedFileName = uploaded.name;

      onStageChange?.('processing_video', 'Processing video and audio');
      const activeFile = await waitForFileActive(ai, uploaded.name);
      if (!activeFile.uri) {
        throw new Error('Video upload completed without a playable URI.');
      }
      videoPart = createPartFromUri(activeFile.uri, activeFile.mimeType || cleanMime);
    } catch (fileApiErr) {
      if (fileStats.size <= INLINE_FALLBACK_MAX_BYTES) {
        console.warn(
          'Gemini Files API failed; retrying with direct inline video upload:',
          extractRawErrorMessage(fileApiErr)
        );
        onStageChange?.('processing_video', 'Retrying video processing with direct upload');
        const base64Data = fs.readFileSync(filePath).toString('base64');
        videoPart = {
          inlineData: {
            mimeType: cleanMime,
            data: base64Data,
          },
        };
      } else {
        throw fileApiErr;
      }
    }

    onStageChange?.('analyzing', 'Watching and writing your coaching notes');
    const { systemInstruction, userPrompt } = buildCoachingPrompts(ctx);

    return await generateWithFallback(
      ai,
      {
        contents: [videoPart, userPrompt],
        systemInstruction,
        responseSchema: analysisResponseSchema,
      },
      (note) => onStageChange?.('analyzing', note)
    );
  } finally {
    fs.unlink(filePath, () => {});
    if (ai && uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

function formatFriendlyApiError(err: unknown): string {
  const raw = extractRawErrorMessage(err);
  const lower = raw.toLowerCase();

  if (raw === 'MISSING_GEMINI_API_KEY') {
    return 'GEMINI_API_KEY is not set on this deployment yet. In Vercel → Project Settings → Environment Variables, add GEMINI_API_KEY for Production & Preview, then click Redeploy.';
  }
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return 'Google rejected your GEMINI_API_KEY as invalid. Double-check the key in Vercel Environment Variables (from aistudio.google.com/apikey), save, and redeploy.';
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return 'Google returned Permission Denied for your GEMINI_API_KEY. Make sure the Generative Language API is enabled for that key and that it has no browser/HTTP referrer restrictions.';
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return 'The AI service is currently rate-limited. Wait a moment and try again, or use a billing-enabled Gemini API key.';
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return 'The AI coaching servers are experiencing a brief traffic spike right now. We retried automatically (including our backup coach), so please wait 15–30 seconds and tap Try again.';
  }

  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message || parsed?.message;
    if (typeof inner === 'string' && inner.trim()) {
      return inner.trim();
    }
  } catch {
    // Not JSON
  }

  return raw;
}

export function registerApiRoutes(app: Express) {
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      runtime: process.env.VERCEL ? 'vercel' : 'node',
      keyConfigured: Boolean(resolveApiKey()),
    });
  });

  // ============================================================================
  // STATELESS GEMINI RESUMABLE UPLOAD PIPELINE (Works on Vercel + Cloud Run + Dev)
  // Every chunk is <= 2.5 MB (well below Vercel's 4.5 MB limit) and 100% stateless.
  // ============================================================================

  // Step 1: Start a Google Gemini Files API resumable session server-side
  app.post('/api/gemini-upload/start', async (req, res) => {
    try {
      const apiKey = getApiKey();
      const fileName = String(req.body?.fileName || 'video.mp4').slice(0, 200);
      const mimeType = String(req.body?.mimeType || '');
      const fileSize = Number(req.body?.fileSize) || 0;
      const takeNumber = Number(req.body?.takeNumber) || 1;

      if (!isValidVideoFile(mimeType, fileName)) {
        return res.status(400).json({ error: 'Please upload an MP4, MOV, or WebM video file.' });
      }
      if (fileSize <= 0) {
        return res.status(400).json({ error: 'That video file appears to be empty.' });
      }
      if (fileSize > MAX_VIDEO_BYTES) {
        return res.status(400).json({
          error: 'That video is over 200 MB. Try trimming it under 3 minutes or using standard phone quality.',
        });
      }

      const cleanMime = resolveVideoMimeType(mimeType, fileName);
      let clientOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
      if (!clientOrigin && typeof req.headers.referer === 'string') {
        try {
          clientOrigin = new URL(req.headers.referer).origin;
        } catch {
          clientOrigin = '';
        }
      }
      const startHeaders: Record<string, string> = {
        'x-goog-api-key': apiKey,
        'User-Agent': 'aistudio-build',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': cleanMime,
        'Content-Type': 'application/json',
      };
      if (clientOrigin) {
        startHeaders['Origin'] = clientOrigin;
      }

      const startRes = await withTransientRetry(async () => {
        const r = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
          method: 'POST',
          headers: startHeaders,
          body: JSON.stringify({
            file: {
              display_name: `soft-launch-take-${takeNumber}`,
            },
          }),
        });

        if (!r.ok) {
          const text = await r.text().catch(() => '');
          const err = new Error(text || `Gemini upload start failed (HTTP ${r.status})`) as Error & {
            status?: number;
          };
          err.status = r.status;
          throw err;
        }
        return r;
      });

      const uploadUrl = startRes.headers.get('x-goog-upload-url');
      if (!uploadUrl || !uploadUrl.startsWith(GEMINI_UPLOAD_ORIGIN)) {
        return res.status(502).json({
          error: 'Could not initialize AI video upload session. Please try again.',
        });
      }

      const uploadToken = signUploadUrl(uploadUrl, apiKey);
      const chunkGranularity =
        Number(startRes.headers.get('x-goog-upload-chunk-granularity')) || RESUMABLE_CHUNK_BYTES;
      return res.json({
        uploadUrl,
        uploadToken,
        chunkSize: chunkGranularity,
        mimeType: cleanMime,
      });
    } catch (err) {
      console.error('Gemini resumable upload start error:', err);
      return res.status(500).json({ error: formatFriendlyApiError(err) });
    }
  });

  // Step 2: Proxy a <= 2.5 MB binary chunk directly to Google's resumable upload session
  const rawChunkParser = express.raw({ type: 'application/octet-stream', limit: '4mb' });
  app.post(
    '/api/gemini-upload/chunk',
    (req, res, next) => {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) return next();
      return rawChunkParser(req, res, next);
    },
    async (req, res) => {
      try {
        const apiKey = getApiKey();
        const token = String(req.headers['x-upload-token'] || '');
        const offset = Number(req.headers['x-upload-offset']);
        const isFinal = String(req.headers['x-upload-final'] || '0') === '1';

        const uploadUrl = verifyUploadToken(token, apiKey);
        if (!uploadUrl) {
          return res.status(400).json({ error: 'Invalid or expired upload session. Please try again.' });
        }
        if (!Number.isFinite(offset) || offset < 0) {
          return res.status(400).json({ error: 'Invalid upload byte offset.' });
        }

        const chunkBuffer = Buffer.isBuffer(req.body)
          ? req.body
          : req.body instanceof Uint8Array
            ? Buffer.from(req.body)
            : typeof req.body === 'string'
              ? Buffer.from(req.body, 'binary')
              : Buffer.alloc(0);
        if (chunkBuffer.length === 0) {
          return res.status(400).json({ error: 'Received an empty video chunk.' });
        }

        const uploadRes = await withTransientRetry(async () => {
          const r = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'x-goog-api-key': apiKey,
              'User-Agent': 'aistudio-build',
              'Content-Length': String(chunkBuffer.length),
              'X-Goog-Upload-Offset': String(offset),
              'X-Goog-Upload-Command': isFinal ? 'upload, finalize' : 'upload',
            },
            body: new Uint8Array(chunkBuffer),
          });

          if (!r.ok) {
            const text = await r.text().catch(() => '');
            const err = new Error(text || `Chunk upload failed (HTTP ${r.status})`) as Error & {
              status?: number;
            };
            err.status = r.status;
            throw err;
          }
          return r;
        });

        if (!isFinal) {
          return res.json({
            ok: true,
            status: uploadRes.headers.get('x-goog-upload-status') || 'active',
          });
        }

        const payload = (await uploadRes.json().catch(() => ({}))) as {
          file?: { name?: string; uri?: string; mimeType?: string; state?: string };
        };
        const file = payload.file;
        if (!file?.name || !file?.uri) {
          return res.status(502).json({
            error: 'Video upload finished without a file reference. Please try again.',
          });
        }

        return res.json({
          ok: true,
          fileName: file.name,
          fileUri: file.uri,
          mimeType: file.mimeType || 'video/mp4',
          state: file.state || 'PROCESSING',
        });
      } catch (err) {
        console.error('Gemini resumable chunk upload error:', err);
        return res.status(500).json({ error: formatFriendlyApiError(err) });
      }
    }
  );

  // Step 3: Poll Gemini file processing status (fast, stateless)
  app.post('/api/gemini-upload/status', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const fileName = String(req.body?.fileName || '').trim();
      if (!/^files\/[a-zA-Z0-9_-]+$/.test(fileName)) {
        return res.status(400).json({ error: 'Invalid video reference.' });
      }

      const ai = getGeminiClient();
      const fileInfo = await withTransientRetry(() => ai.files.get({ name: fileName }), 3, 1000);

      if (fileInfo.state === 'FAILED') {
        ai.files.delete({ name: fileName }).catch(() => {});
        const reason = fileInfo.error?.message ? ` (${fileInfo.error.message})` : '';
        console.warn(`Gemini file processing failed for ${fileName}${reason}`);
        return res.json({
          state: 'FAILED',
          error:
            'Video processing failed on the AI service. Please try exporting as MP4 (H.264) and uploading again.',
        });
      }

      return res.json({
        state: fileInfo.state || 'PROCESSING',
        fileUri: fileInfo.uri,
        mimeType: fileInfo.mimeType,
      });
    } catch (err) {
      console.error('Gemini file status error:', err);
      return res.status(500).json({ error: formatFriendlyApiError(err) });
    }
  });

  // Step 4: Run Gemini coaching analysis on the ACTIVE uploaded file & delete file immediately after
  app.post('/api/gemini-upload/analyze', async (req, res) => {
    const fileName = String(req.body?.fileName || '').trim();
    const fileUri = String(req.body?.fileUri || '').trim();
    const cleanMime = normalizeBaseMimeType(String(req.body?.mimeType || 'video/mp4')) || 'video/mp4';

    if (!/^files\/[a-zA-Z0-9_-]+$/.test(fileName)) {
      return res.status(400).json({ error: 'Invalid video file reference.' });
    }
    if (!fileUri.startsWith('https://generativelanguage.googleapis.com/')) {
      return res.status(400).json({ error: 'Invalid video URI.' });
    }

    let ai: GoogleGenAI | null = null;
    try {
      ai = getGeminiClient();
      const ctx: AnalysisContext = {
        niche: String(req.body?.niche || 'Other').slice(0, 80),
        goal: String(req.body?.goal || 'Feel less awkward on camera').slice(0, 140),
        initialConfidence: String(req.body?.initialConfidence || '3').slice(0, 10),
        topic: String(req.body?.topic || '').trim().slice(0, 300),
        takeNumber: Number(req.body?.takeNumber) || 1,
        durationSeconds: Number(req.body?.durationSeconds) || 0,
        previousFocus: String(req.body?.previousFocus || '').trim().slice(0, 240),
      };

      const { systemInstruction, userPrompt } = buildCoachingPrompts(ctx);

      const analysis = await generateWithFallback(ai, {
        contents: [createPartFromUri(fileUri, cleanMime), userPrompt],
        systemInstruction,
        responseSchema: analysisResponseSchema,
      });

      return res.json({ analysis });
    } catch (err) {
      console.error('Gemini file analyze error:', err);
      return res.status(500).json({ error: formatFriendlyApiError(err) });
    } finally {
      if (ai && fileName) {
        ai.files.delete({ name: fileName }).catch(() => {});
      }
    }
  });

  // ============================================================================
  // LEGACY / NODE-SERVER ENDPOINTS (Retained for backwards compatibility)
  // ============================================================================

  app.post('/api/uploads/init', (req, res) => {
    const fileName = String(req.body?.fileName || 'video.mp4').slice(0, 200);
    const mimeType = String(req.body?.mimeType || '');
    const fileSize = Number(req.body?.fileSize) || 0;

    if (!isValidVideoFile(mimeType, fileName)) {
      return res.status(400).json({ error: 'Please upload an MP4, MOV, or WebM video file.' });
    }
    if (fileSize <= 0) {
      return res.status(400).json({ error: 'That video file appears to be empty.' });
    }
    if (fileSize > MAX_VIDEO_BYTES) {
      return res.status(400).json({
        error: 'That video is over 200 MB. Try trimming it under 3 minutes or using standard phone quality.',
      });
    }

    const id = crypto.randomUUID();
    const ext = path.extname(fileName).toLowerCase() || '.mp4';
    const filePath = path.join(uploadDir, `upload-${id}${ext}`);

    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(filePath, Buffer.alloc(0));
    } catch (err) {
      console.error('Failed to allocate upload temp file:', err);
      return res.status(500).json({ error: 'Could not initialize temporary upload storage.' });
    }

    uploadSessions.set(id, {
      id,
      filePath,
      fileName,
      mimeType: resolveVideoMimeType(mimeType, fileName),
      expectedSize: fileSize,
      receivedBytes: 0,
      createdAt: Date.now(),
      inUse: false,
    });

    return res.json({ uploadId: id, chunkSize: LOCAL_CHUNK_BYTES });
  });

  app.post(
    '/api/uploads/:uploadId/chunk',
    express.raw({ type: 'application/octet-stream', limit: '6mb' }),
    (req, res) => {
      const session = uploadSessions.get(req.params.uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session expired. Please try uploading again.' });
      }
      if (session.inUse) {
        return res.status(409).json({ error: 'This upload is already being analyzed.' });
      }

      const chunk = req.body;
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        return res.status(400).json({ error: 'Received an empty upload chunk.' });
      }
      if (session.receivedBytes + chunk.length > MAX_VIDEO_BYTES + 1024 * 1024) {
        return res.status(413).json({ error: 'That video exceeds the 200 MB size limit.' });
      }

      try {
        fs.appendFileSync(session.filePath, chunk);
        session.receivedBytes += chunk.length;
        return res.json({ receivedBytes: session.receivedBytes });
      } catch (err) {
        console.error('Chunk write error:', err);
        return res.status(500).json({ error: 'Could not save video chunk. Please try again.' });
      }
    }
  );

  app.post('/api/uploads/:uploadId/analyze', (req, res) => {
    const session = uploadSessions.get(req.params.uploadId);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found. Please try uploading again.' });
    }
    if (session.receivedBytes <= 0) {
      return res.status(400).json({ error: 'No video data was uploaded. Please try again.' });
    }

    session.inUse = true;
    uploadSessions.delete(session.id);

    const ctx: AnalysisContext = {
      niche: String(req.body?.niche || 'Other').slice(0, 80),
      goal: String(req.body?.goal || 'Feel less awkward on camera').slice(0, 140),
      initialConfidence: String(req.body?.initialConfidence || '3').slice(0, 10),
      topic: String(req.body?.topic || '').trim().slice(0, 300),
      takeNumber: Number(req.body?.takeNumber) || 1,
      durationSeconds: Number(req.body?.durationSeconds) || 0,
      previousFocus: String(req.body?.previousFocus || '').trim().slice(0, 240),
    };

    const jobId = crypto.randomUUID();
    const job: AnalysisJob = {
      id: jobId,
      status: 'uploading_to_ai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    analysisJobs.set(jobId, job);

    analyzeVideoFile(session.filePath, session.mimeType, ctx, (stage, note) => {
      job.status = stage;
      if (note) job.stageNote = note;
      job.updatedAt = Date.now();
    })
      .then((analysis) => {
        job.status = 'completed';
        job.analysis = analysis;
        job.updatedAt = Date.now();
      })
      .catch((err) => {
        console.error('Background video analysis error:', err);
        job.status = 'failed';
        job.error = formatFriendlyApiError(err);
        job.updatedAt = Date.now();
      });

    return res.status(202).json({ jobId });
  });

  app.get('/api/analysis-jobs/:jobId', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const job = analysisJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        status: 'failed',
        error: 'Analysis session expired or restarted. Please tap Try again.',
      });
    }

    if (job.status === 'completed') {
      return res.json({ status: 'completed', analysis: job.analysis });
    }
    if (job.status === 'failed') {
      return res.json({ status: 'failed', error: job.error || 'Video analysis failed.' });
    }
    return res.json({ status: job.status, stageNote: job.stageNote });
  });

  app.post('/api/analyze-video-stream', (req, res) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const message =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'That video is over 200 MB. Try trimming it under 3 minutes or using standard phone quality.'
            : uploadErr.message || 'Could not upload your video.';
        return res.status(400).json({ error: message });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No video file was received. Please pick a video and try again.' });
      }

      const ctx: AnalysisContext = {
        niche: String(req.body.niche || 'Other').slice(0, 80),
        goal: String(req.body.goal || 'Feel less awkward on camera').slice(0, 140),
        initialConfidence: String(req.body.initialConfidence || '3').slice(0, 10),
        topic: String(req.body.topic || '').trim().slice(0, 300),
        takeNumber: Number(req.body.takeNumber) || 1,
        durationSeconds: Number(req.body.durationSeconds) || 0,
        previousFocus: String(req.body.previousFocus || '').trim().slice(0, 240),
      };

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const writeEvent = (payload: Record<string, unknown>) => {
        if (!res.writableEnded) {
          res.write(`${JSON.stringify(payload)}\n`);
        }
      };

      const heartbeat = setInterval(() => {
        writeEvent({ type: 'heartbeat' });
      }, 4000);

      try {
        const mimeType = resolveVideoMimeType(file.mimetype, file.originalname);
        writeEvent({ type: 'stage', label: 'Preparing your clip for private review' });
        const analysis = await analyzeVideoFile(file.path, mimeType, ctx, (_stage, note) => {
          if (note) {
            writeEvent({ type: 'stage', label: note });
          }
        });
        writeEvent({ type: 'completed', analysis });
      } catch (err) {
        console.error('Streaming video analysis error:', err);
        writeEvent({ type: 'error', error: formatFriendlyApiError(err) });
      } finally {
        clearInterval(heartbeat);
        if (!res.writableEnded) {
          res.end();
        }
      }
    });
  });

  app.post('/api/analyze-video', (req, res) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const message =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'That video is over 200 MB. Try trimming it under 3 minutes or using standard phone quality.'
            : uploadErr.message || 'Could not upload your video.';
        return res.status(400).json({ error: message });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No video file was received. Please pick a video and try again.' });
      }

      const ctx: AnalysisContext = {
        niche: String(req.body.niche || 'Other').slice(0, 80),
        goal: String(req.body.goal || 'Feel less awkward on camera').slice(0, 140),
        initialConfidence: String(req.body.initialConfidence || '3').slice(0, 10),
        topic: String(req.body.topic || '').trim().slice(0, 300),
        takeNumber: Number(req.body.takeNumber) || 1,
        durationSeconds: Number(req.body.durationSeconds) || 0,
        previousFocus: String(req.body.previousFocus || '').trim().slice(0, 240),
      };

      try {
        const mimeType = resolveVideoMimeType(file.mimetype, file.originalname);
        const analysis = await analyzeVideoFile(file.path, mimeType, ctx);
        return res.json({ analysis });
      } catch (err) {
        console.error('Direct video analysis error:', err);
        return res.status(500).json({ error: formatFriendlyApiError(err) });
      }
    });
  });

  app.post('/api/progress-verdict', async (req, res) => {
    try {
      const { profile, takes } = req.body || {};
      if (!Array.isArray(takes) || takes.length < 3) {
        return res.status(400).json({ error: 'At least 3 takes are required for a Progress Summary verdict.' });
      }

      const ai = getGeminiClient();
      const prompt = `Review this creator's private Soft Launch practice progression across ${takes.length} takes and write their Launch Readiness verdict.

Creator profile:
- Niche: ${profile?.niche || 'General'}
- Goal: ${profile?.goal || 'Post my first video'}
- Starting self-rated camera confidence: ${profile?.initialConfidence || 3}/5

Practice takes (chronological, Take 1 to Take ${takes.length}):
${JSON.stringify(takes, null, 2)}

Write an honest, warm, grounded Launch Readiness verdict celebrating concrete progress from Take 1 to Take ${takes.length}, naming their single biggest win, and giving a clear low-pressure nudge on whether they're ready to soft launch publicly.`;

      const verdict = await generateWithFallback(ai, {
        contents: prompt,
        systemInstruction:
          'You are the encouraging, honest AI video coach for Soft Launch. Warm, playful-but-grounded, Gen Z friendly without being cringe. Never harsh or generic.',
        responseSchema: progressVerdictSchema,
      });

      return res.json({ verdict });
    } catch (err: unknown) {
      console.error('Progress verdict error:', err);
      return res.status(500).json({ error: formatFriendlyApiError(err) });
    }
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });
}

// Standalone Express app export for Vercel Serverless Functions (/api/index.ts)
const vercelApp = express();
registerApiRoutes(vercelApp);
export default vercelApp;
