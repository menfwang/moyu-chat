import 'dotenv/config';

const base = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.deepseek.com/anthropic').replace(/\/+$/, '');
const key = process.env.ANTHROPIC_API_KEY ?? '';
const model = process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-pro';
const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;

function redact(value) {
  return String(value).split(key).join('sk-***');
}

const headers = {
  'content-type': 'application/json',
  'anthropic-version': '2023-06-01',
  'x-api-key': key,
  authorization: `Bearer ${key}`,
};

console.log('url:', url, 'model:', model, 'keyLength:', key.length);

try {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: '只回复两个字：可用' }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  console.log('status:', response.status, response.headers.get('content-type'));
  console.log(redact(text).slice(0, 1500));
} catch (error) {
  console.error('request failed:', redact(error instanceof Error ? error.message : error));
}
