import 'dotenv/config';

const base = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.deepseek.com/anthropic').replace(/\/+$/, '');
const key = process.env.ANTHROPIC_API_KEY ?? '';
const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
const model = process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-pro';

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'text/event-stream',
    'anthropic-version': '2023-06-01',
    'x-api-key': key,
    authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    model,
    max_tokens: 256,
    temperature: 0.7,
    system: '你是墨语，用中文回答。',
    messages: [{ role: 'user', content: '讲一个一句话的小笑话。' }],
    stream: true,
  }),
  signal: AbortSignal.timeout(60_000),
});

console.log('status:', response.status, response.headers.get('content-type'));
if (!response.ok) {
  console.log((await response.text()).slice(0, 1000));
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let chars = 0;
while (chars < 5000) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  buffer += text;
  chars += text.length;
}
await reader.cancel().catch(() => undefined);
console.log(buffer.slice(0, 5000));
