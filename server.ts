import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, createPartFromUri } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB max (chunked safely under Cloud Run's 32 MB request limit)
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB chunks

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);

const uploadDir = path.join(os.tmpdir(), 'soft-launch-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

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

// Periodic cleanup of abandoned uploads and old finished jobs
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

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
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
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (
      ALLOWED_MIME_TYPES.has(file.mimetype) ||
      ['.mp4', '.mov', '.webm'].includes(ext)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Please upload an MP4, MOV, or WebM video file.'));
    }
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check Settings > Secrets in AI Studio.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveVideoMimeType(mimeType: string, fileName: string): string {
  if (ALLOWED_MIME_TYPES.has(mimeType)) {
    return mimeType === 'video/x-m4v' ? 'video/mp4' : mimeType;
  }
  if (mimeType && mimeType.startsWith('video/')) {
    return mimeType;
  }
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return 'video/mp4';
}

function isValidVideoFile(mimeType: string, fileName: string): boolean {
  const ext = path.extname(fileName || '').toLowerCase();
  return (
    (mimeType && mimeType.startsWith('video/')) ||
    ALLOWED_MIME_TYPES.has(mimeType) ||
    ['.mp4', '.mov', '.webm', '.m4v'].includes(ext)
  );
}

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
          description: 'Estimated speaking pace in words per minute (e.g. 135).',
        },
        pace_label: {
          type: Type.STRING,
          description: 'Short label like "A bit rushed", "Comfortable & clear", "Slightly slow", or "Energetic & crisp".',
        },
        pacing_notes: {
          type: Type.STRING,
          description: 'Specific, encouraging notes on pacing, pauses, and breathing room.',
        },
      },
      required: ['approx_wpm', 'pace_label', 'pacing_notes'],
    },
    hook_analysis: {
      type: Type.OBJECT,
      properties: {
        time_to_main_point_seconds: {
          type: Type.INTEGER,
          description: 'Approximate number of seconds until the speaker reaches their main point or hook.',
        },
        effectiveness_notes: {
          type: Type.STRING,
          description: 'Honest, warm assessment of how quickly and clearly the opening grabs attention.',
        },
        rewritten_hook: {
          type: Type.STRING,
          description: 'A punchier, natural-sounding rewritten opening line tailored to what the speaker is talking about.',
        },
      },
      required: ['time_to_main_point_seconds', 'effectiveness_notes', 'rewritten_hook'],
    },
    camera_presence: {
      type: Type.OBJECT,
      properties: {
        eye_contact_notes: {
          type: Type.STRING,
          description: 'AI visual estimate of eye contact and lens engagement.',
        },
        facial_expressions_notes: {
          type: Type.STRING,
          description: 'AI visual estimate of warmth, facial expressiveness, and micro-expressions.',
        },
        body_language_and_posture_notes: {
          type: Type.STRING,
          description: 'AI visual estimate of posture, hand gestures, and framing.',
        },
        is_ai_estimate_note: {
          type: Type.STRING,
          description: 'Brief reminder noting that eye contact, expression, and posture observations are AI visual estimates.',
        },
      },
      required: [
        'eye_contact_notes',
        'facial_expressions_notes',
        'body_language_and_posture_notes',
        'is_ai_estimate_note',
      ],
    },
    delivery_details: {
      type: Type.OBJECT,
      properties: {
        energy_and_enthusiasm_notes: {
          type: Type.STRING,
          description: 'Warm, honest read of energy, vocal variety, and enthusiasm.',
        },
        voice_clarity_notes: {
          type: Type.STRING,
          description: 'Assessment of articulation, volume consistency, and audio clarity.',
        },
      },
      required: ['energy_and_enthusiasm_notes', 'voice_clarity_notes'],
    },
    content_structure: {
      type: Type.OBJECT,
      properties: {
        opening_notes: { type: Type.STRING },
        middle_notes: { type: Type.STRING },
        close_and_cta_notes: { type: Type.STRING },
      },
      required: ['opening_notes', 'middle_notes', 'close_and_cta_notes'],
    },
    overall_confidence_impression: {
      type: Type.STRING,
      description: 'Warm 1-2 sentence read on how confident and natural the speaker appears overall.',
    },
    scores: {
      type: Type.OBJECT,
      properties: {
        confidence: { type: Type.INTEGER, description: 'Score 0 to 100' },
        clarity: { type: Type.INTEGER, description: 'Score 0 to 100' },
        pacing: { type: Type.INTEGER, description: 'Score 0 to 100' },
        hook: { type: Type.INTEGER, description: 'Score 0 to 100' },
        eye_contact: { type: Type.INTEGER, description: 'Score 0 to 100' },
        energy: { type: Type.INTEGER, description: 'Score 0 to 100' },
        structure: { type: Type.INTEGER, description: 'Score 0 to 100' },
        vibe_check_score: { type: Type.INTEGER, description: 'Overall weighted score 0 to 100' },
      },
      required: [
        'confidence',
        'clarity',
        'pacing',
        'hook',
        'eye_contact',
        'energy',
        'structure',
        'vibe_check_score',
      ],
    },
    vibe_check_summary: {
      type: Type.STRING,
      description:
        'A fun, warm, honest one-line read of how the user comes across (e.g. "Warm and relatable, but you rush your intro.").',
    },
    strengths: {
      type: Type.ARRAY,
      description: '2 to 3 specific things the speaker did well in this exact video.',
      items: { type: Type.STRING },
    },
    improvements: {
      type: Type.ARRAY,
      description: '2 to 3 specific, actionable improvements anchored to timestamps in the video.',
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp_range: {
            type: Type.STRING,
            description: 'Timestamp range in MM:SS–MM:SS format (e.g. "0:00–0:08").',
          },
          start_seconds: {
            type: Type.INTEGER,
            description: 'Start second as an integer for seeking the video player.',
          },
          what_happened: {
            type: Type.STRING,
            description: 'Specific observation of what happened at that moment.',
          },
          why_it_matters: {
            type: Type.STRING,
            description: 'Why this matters for a viewer watching the video.',
          },
          concrete_fix: {
            type: Type.STRING,
            description: 'One concrete, doable fix for the next take.',
          },
        },
        required: [
          'timestamp_range',
          'start_seconds',
          'what_happened',
          'why_it_matters',
          'concrete_fix',
        ],
      },
    },
    focus_for_next_take: {
      type: Type.STRING,
      description: 'Exactly ONE clear, doable main thing to practise on the next take.',
    },
    tips_and_tricks: {
      type: Type.ARRAY,
      description: '3 to 5 practical coaching tips tailored to the user niche and weakest area.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          advice: { type: Type.STRING },
        },
        required: ['title', 'advice'],
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
  baseDelayMs = 2000
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
      const jitter = Math.floor(Math.random() * 600);
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
        console.warn(
          `Gemini ${tier.model} attempt ${attempt}/${tier.attempts} failed:`,
          extractRawErrorMessage(err)
        );
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        if (attempt < tier.attempts) {
          const delayMs = 2500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 800);
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError;
}

async function waitForFileActive(ai: GoogleGenAI, fileName: string) {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const fileInfo = await withTransientRetry(() => ai.files.get({ name: fileName }), 3, 1500);
    if (fileInfo.state === 'ACTIVE') {
      return fileInfo;
    }
    if (fileInfo.state === 'FAILED') {
      throw new Error(
        'Video processing failed on the AI service. Please try exporting as MP4 and uploading again.'
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

    onStageChange?.('uploading_to_ai', 'Preparing your clip for private review');
    const uploaded = await withTransientRetry(
      () =>
        ai!.files.upload({
          file: filePath,
          config: {
            mimeType,
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

    onStageChange?.('analyzing', 'Watching and writing your coaching notes');
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

    return await generateWithFallback(
      ai,
      {
        contents: [
          createPartFromUri(activeFile.uri, activeFile.mimeType || mimeType),
          userPrompt,
        ],
        systemInstruction,
        responseSchema: analysisResponseSchema,
      },
      (note) => onStageChange?.('analyzing', note)
    );
  } finally {
    // Immediately delete temporary video files after processing to honor user privacy
    fs.unlink(filePath, () => {});
    if (ai && uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

function formatFriendlyApiError(err: unknown): string {
  const raw = extractRawErrorMessage(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('gemini_api_key')
  ) {
    return 'Unable to connect to the AI coaching service. Please verify your API key in Settings > Secrets.';
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return 'The AI service is currently rate-limited. Wait a moment and try again, or select a billing-enabled API key in Settings > Secrets.';
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return 'The AI coaching servers are experiencing a brief traffic spike right now. We retried automatically (including our backup coach), so please wait 15–30 seconds and tap Try again.';
  }

  // If Gemini returned a JSON-formatted error blob, unwrap the inner message cleanly
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error?.message || parsed?.message;
    if (typeof inner === 'string' && inner.trim()) {
      return inner.trim();
    }
  } catch {
    // Not JSON, fall through
  }

  return raw;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/favicon.ico', (_req, res) => {
    const svgPath = path.resolve(__dirname, 'public', 'favicon.svg');
    if (fs.existsSync(svgPath)) {
      res.type('image/svg+xml');
      return res.sendFile(svgPath);
    }
    return res.status(204).end();
  });

  // 1. Initialize chunked upload session (bypasses Cloud Run 32 MB single-request limit)
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

    return res.json({ uploadId: id, chunkSize: CHUNK_SIZE_BYTES });
  });

  // 2. Append binary video chunk (4 MB default, well under 32 MB limit)
  app.post(
    '/api/uploads/:uploadId/chunk',
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    async (req, res) => {
      const session = uploadSessions.get(req.params.uploadId);
      if (!session || session.inUse) {
        return res.status(404).json({ error: 'Upload session expired. Please try uploading again.' });
      }

      const chunk = req.body;
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        return res.status(400).json({ error: 'Empty video chunk received.' });
      }

      if (session.receivedBytes + chunk.length > MAX_VIDEO_BYTES) {
        fs.unlink(session.filePath, () => {});
        uploadSessions.delete(session.id);
        return res.status(400).json({ error: 'Video exceeds the 200 MB limit.' });
      }

      try {
        await fs.promises.appendFile(session.filePath, chunk);
        session.receivedBytes += chunk.length;
        return res.json({ receivedBytes: session.receivedBytes });
      } catch (err) {
        console.error('Chunk write error:', err);
        return res.status(500).json({ error: 'Failed while saving video chunk.' });
      }
    }
  );

  // 3. Kick off async Gemini analysis job (returns immediately to avoid proxy 60s timeouts)
  app.post('/api/uploads/:uploadId/analyze', (req, res) => {
    const session = uploadSessions.get(req.params.uploadId);
    if (!session || session.inUse) {
      return res.status(404).json({ error: 'Upload session not found. Please try uploading again.' });
    }

    if (session.receivedBytes <= 0) {
      return res.status(400).json({ error: 'No video data was uploaded.' });
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

    // Run Gemini video understanding asynchronously in the background
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

  // 4. Lightweight job status polling endpoint
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

  // Single-request streaming analysis endpoint (stateless for multi-instance Cloud Run + keepalive heartbeats)
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

  // Direct upload compatibility endpoint for smaller clips
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

  // Catch any unknown /api/* route as JSON instead of falling through to index.html
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const useViteDev =
    process.env.SOFT_LAUNCH_DEV === '1' ||
    (process.env.NODE_ENV !== 'production' && !hasBuiltDist);

  if (useViteDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Soft Launch server running on http://0.0.0.0:${PORT}`);
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
