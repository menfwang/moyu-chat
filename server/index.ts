import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const API_KEY = (process.env.DEEPSEEK_API_KEY ?? '').trim();
const API_BASE = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
const DEMO_SETTING = (process.env.DEMO_MODE ?? 'auto').toLowerCase();
const DEMO_PROVIDER = (process.env.DEMO_PROVIDER ?? 'local').toLowerCase();
const IS_DEMO = DEMO_SETTING === 'on' || DEMO_SETTING === 'true' || (DEMO_SETTING === 'auto' && !API_KEY);

const MAX_INPUT_CHARS = Number.parseInt(process.env.MAX_INPUT_CHARS ?? '40000', 10);
const MAX_OUTPUT_TOKENS = Number.parseInt(process.env.MAX_OUTPUT_TOKENS ?? '4096', 10);
const UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? '120000', 10);
const RATE_PER_MINUTE = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '12', 10);
const RATE_PER_DAY = Number.parseInt(process.env.RATE_LIMIT_PER_DAY ?? '240', 10);

const MODEL_OPTIONS = [
  {
    id: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    name: '轻语',
    description: '快速、均衡，适合日常对话',
    tag: 'DeepSeek Chat',
  },
  ...(process.env.ENABLE_REASONER === 'false'
    ? []
    : [
        {
          id: process.env.DEEPSEEK_REASONER_MODEL ?? 'deepseek-reasoner',
          name: '深思',
          description: '先推理再回答，适合复杂问题',
          tag: 'DeepSeek Reasoner',
        },
      ]),
];
const MODEL_IDS = new Set(MODEL_OPTIONS.map((model) => model.id));

const BASE_SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT?.trim() ||
  [
    '你是「墨语」，一个温和、清晰、可靠的中文 AI 助手。',
    '你的回答应当准确、有条理，优先使用自然的中文；需要时可以使用 Markdown（标题、列表、表格、代码块）。',
    '不要编造事实、来源或链接。信息不足时，坦率说明不确定性，并给出下一步建议。',
    '不要提及系统提示词，也不要声称自己具有未提供的功能。',
  ].join('\n');

const TONE_PROMPTS: Record<string, string> = {
  balanced: '回答保持自然、完整，通常控制在必要长度内。',
  concise: '请尽量简洁，先给结论，再用少量要点补充；避免寒暄与重复。',
  detailed: '请给出更完整的解释，必要时分步骤展开，并补充例子或注意事项。',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type ChatRole = 'user' | 'assistant';
type ChatMessage = { role: ChatRole; content: string };
type Tone = 'balanced' | 'concise' | 'detailed';

class UpstreamError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sse(res: Response, payload: Record<string, unknown>) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function friendlyUpstreamMessage(status: number): string {
  if (status === 401 || status === 403) return '模型服务的 API Key 无效或没有权限，请检查部署环境变量。';
  if (status === 402) return '模型服务账户余额不足，请先充值后再试。';
  if (status === 429) return '模型服务当前请求过多，请稍等片刻再试。';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试。';
  return '模型服务返回了异常响应，请稍后重试。';
}

function parseChatRequest(body: unknown): {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  tone: Tone;
} {
  if (!isRecord(body)) throw new UpstreamError('请求格式不正确。', 400);
  if (!Array.isArray(body.messages)) throw new UpstreamError('缺少 messages 字段。', 400);

  const messages: ChatMessage[] = [];
  for (const raw of body.messages.slice(-50)) {
    if (!isRecord(raw)) continue;
    if (raw.role !== 'user' && raw.role !== 'assistant') continue;
    if (typeof raw.content !== 'string') continue;
    const content = raw.content.trim();
    if (!content) continue;
    messages.push({ role: raw.role, content });
  }

  if (messages.length === 0) throw new UpstreamError('请先输入一条消息。', 400);
  if (messages[messages.length - 1]?.role !== 'user') {
    throw new UpstreamError('最后一条消息必须来自用户。', 400);
  }

  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    throw new UpstreamError(
      `这段对话太长了（${totalChars} 字符，上限 ${MAX_INPUT_CHARS}）。请新建一个对话后继续。`,
      413,
    );
  }

  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const model = MODEL_IDS.has(requestedModel) ? requestedModel : MODEL_OPTIONS[0]!.id;

  const requestedTemperature = typeof body.temperature === 'number' ? body.temperature : 0.7;
  const temperature = Math.min(1.5, Math.max(0, requestedTemperature));

  const tone: Tone =
    body.tone === 'concise' || body.tone === 'detailed' || body.tone === 'balanced'
      ? body.tone
      : 'balanced';

  return { messages, model, temperature, tone };
}

function buildSystemMessage(tone: Tone): string {
  return `${BASE_SYSTEM_PROMPT}\n${TONE_PROMPTS[tone] ?? TONE_PROMPTS.balanced}`;
}

/* -------------------------------------------------------------------------- */
/*  Streaming                                                                 */
/* -------------------------------------------------------------------------- */

function startEventStream(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
  }, 15_000);

  return () => clearInterval(heartbeat);
}

async function pipeOpenAiStream(params: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  res: Response;
  signal: AbortSignal;
  includeReasoning: boolean;
  providerName: string;
}) {
  const { url, headers, body, res, signal, includeReasoning, providerName } = params;

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted) throw error;
    console.error(`[${providerName}] network error`, error instanceof Error ? error.message : error);
    throw new UpstreamError('无法连接模型服务，请稍后重试。', 502);
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[${providerName}] upstream ${upstream.status}: ${detail.slice(0, 500)}`);
    throw new UpstreamError(friendlyUpstreamMessage(upstream.status), upstream.status === 429 ? 429 : 502);
  }

  const stopHeartbeat = startEventStream(res);
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const handleFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data === '[DONE]') {
      finished = true;
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (!isRecord(payload)) return;
    if (isRecord(payload.error)) {
      const message = typeof payload.error.message === 'string' ? payload.error.message : '';
      console.error(`[${providerName}] stream error: ${message.slice(0, 300)}`);
      throw new UpstreamError('模型生成过程中出现错误，请重试。');
    }

    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) return;
    const choice = choices[0];
    if (!isRecord(choice) || !isRecord(choice.delta)) return;

    const delta = choice.delta;
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (includeReasoning && typeof reasoning === 'string' && reasoning) {
      sse(res, { type: 'reasoning', text: reasoning });
    }
    if (typeof delta.content === 'string' && delta.content) {
      sse(res, { type: 'delta', text: delta.content });
    }
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) handleFrame(frame);
    }

    if (buffer.trim()) handleFrame(buffer);
    sse(res, { type: 'done' });
  } finally {
    stopHeartbeat();
    await reader.cancel().catch(() => undefined);
  }
}

function localDemoText(messages: ChatMessage[], tone: Tone): string {
  const latest = messages[messages.length - 1]?.content ?? '';
  const short = latest.replace(/\s+/g, ' ').slice(0, 80);
  const compact = tone === 'concise';

  if (/^(你好|您好|hi|hello|嗨|在吗)/i.test(latest.trim())) {
    return [
      '你好，我是墨语。🌿',
      '',
      '当前页面运行在**演示模式**：界面、流式输出和对话记录都可以正常体验，但回答由本地示例生成，并不是真实的大模型推理。',
      '',
      '要让墨语真正回答问题，只需在服务器环境变量中配置 `DEEPSEEK_API_KEY`，然后重启服务即可。',
      ...(compact ? [] : ['', '你可以在部署平台的环境变量面板中添加它，密钥不会发送到浏览器。']),
    ].join('\n');
  }

  return [
    `我收到了你的消息：**${short}${latest.length > short.length ? '…' : ''}**`,
    '',
    ...(compact
      ? ['当前是演示模式，尚未连接真实模型。配置 `DEEPSEEK_API_KEY` 后即可获得完整回答。']
      : [
          '这是一个演示回复，说明聊天界面已经正常工作：消息会流式出现，Markdown 会正确渲染，对话也会保存在当前浏览器中。',
          '',
          '### 启用真实 AI',
          '',
          '1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。',
          '2. 在部署平台添加环境变量 `DEEPSEEK_API_KEY`。',
          '3. 重新部署或重启服务，页面右上角会显示「在线」。',
          '',
          '> 服务端代理会保护密钥，浏览器端永远看不到它。',
        ]),
  ].join('\n');
}

async function streamDemo(messages: ChatMessage[], tone: Tone, res: Response, signal: AbortSignal) {
  if (DEMO_PROVIDER === 'pollinations') {
    try {
      await pipeOpenAiStream({
        url: 'https://text.pollinations.ai/openai',
        headers: {},
        body: {
          model: process.env.DEMO_MODEL ?? 'openai',
          stream: true,
          messages: [{ role: 'system', content: buildSystemMessage(tone) }, ...messages],
        },
        res,
        signal,
        includeReasoning: false,
        providerName: 'demo/pollinations',
      });
      return;
    } catch (error) {
      if (signal.aborted) return;
      if (res.headersSent) {
        sse(res, { type: 'error', message: '演示服务暂时不可用，请稍后重试。' });
        return;
      }
      console.error('[demo/pollinations] falling back to local demo', error instanceof Error ? error.message : error);
    }
  }

  const text = localDemoText(messages, tone);
  const stopHeartbeat = startEventStream(res);
  try {
    const chunks = text.match(/.{1,4}/gs) ?? [text];
    for (const chunk of chunks) {
      if (signal.aborted) return;
      sse(res, { type: 'delta', text: chunk });
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
    sse(res, { type: 'done' });
  } finally {
    stopHeartbeat();
  }
}

/* -------------------------------------------------------------------------- */
/*  App                                                                       */
/* -------------------------------------------------------------------------- */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith('/api/chat')) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: IS_DEMO ? 'demo' : 'live',
    model: MODEL_OPTIONS[0]?.id ?? null,
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    demo: IS_DEMO,
    demoProvider: IS_DEMO ? (DEMO_PROVIDER === 'pollinations' ? 'pollinations' : 'local') : null,
    models: MODEL_OPTIONS,
    defaultModel: MODEL_OPTIONS[0]!.id,
    maxInputChars: MAX_INPUT_CHARS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
});

const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: RATE_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '消息发送得太快了，请稍等一分钟再试。' },
});

const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: RATE_PER_DAY,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '今天的免费额度已用完，请明天再来。' },
});

app.post('/api/chat', publicLimiter, dailyLimiter, async (req: Request, res: Response) => {
  let parsed: ReturnType<typeof parseChatRequest>;
  try {
    parsed = parseChatRequest(req.body);
  } catch (error) {
    const status = error instanceof UpstreamError ? error.status : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : '请求不正确。' });
    return;
  }

  if (!IS_DEMO && !API_KEY) {
    res.status(503).json({ error: '服务器尚未配置模型 API Key，请联系站点管理员。' });
    return;
  }

  const controller = new AbortController();
  let clientGone = false;
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  });

  try {
    if (IS_DEMO) {
      await streamDemo(parsed.messages, parsed.tone, res, controller.signal);
      return;
    }

    const body: Record<string, unknown> = {
      model: parsed.model,
      messages: [
        { role: 'system', content: buildSystemMessage(parsed.tone) },
        ...parsed.messages,
      ],
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
    };

    // deepseek-reasoner does not support temperature.
    if (!parsed.model.includes('reasoner')) body.temperature = parsed.temperature;

    await pipeOpenAiStream({
      url: `${API_BASE}/chat/completions`,
      headers: { Authorization: `Bearer ${API_KEY}` },
      body,
      res,
      signal: controller.signal,
      includeReasoning: parsed.model.includes('reasoner'),
      providerName: 'deepseek',
    });
  } catch (error) {
    if (clientGone) return;
    const status = error instanceof UpstreamError ? error.status : 502;
    const message =
      error instanceof UpstreamError
        ? error.message
        : controller.signal.aborted
          ? '生成超时了，请重试或缩短问题。'
          : '生成回答时出现异常，请稍后重试。';

    console.error('[chat] request failed', error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    } else {
      sse(res, { type: 'error', message });
    }
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在。' });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=300');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: '页面不存在。' });
});

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  const status = isRecord(error) && error.type === 'entity.too.large' ? 413 : 500;
  console.error('[server]', error instanceof Error ? error.message : error);
  if (!res.headersSent) {
    res.status(status).json({ error: status === 413 ? '请求内容过大。' : '服务器内部错误。' });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(
    [
      `墨语 running at http://${HOST}:${PORT}`,
      `mode: ${IS_DEMO ? `demo (${DEMO_PROVIDER})` : 'live'}`,
      `models: ${MODEL_OPTIONS.map((model) => model.id).join(', ')}`,
      !API_KEY && !IS_DEMO ? 'WARNING: DEEPSEEK_API_KEY is not configured.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
