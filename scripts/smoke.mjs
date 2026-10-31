const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';

const health = await fetch(`${base}/api/health`).then((response) => response.json());
console.log('health:', health);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90_000);

const response = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '你好，请用两句话介绍你自己。' }],
    tone: 'balanced',
    temperature: 0.7,
  }),
  signal: controller.signal,
});

console.log('chat status:', response.status, response.headers.get('content-type'));
if (!response.ok) {
  console.log(await response.text());
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let answer = '';
let events = 0;

while (events < 80) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop() ?? '';
  for (const frame of frames) {
    const line = frame.split('\n').find((item) => item.startsWith('data:'));
    if (!line) continue;
    const event = JSON.parse(line.slice(5).trim());
    events += 1;
    if (event.type === 'delta') answer += event.text;
    if (event.type === 'error') console.log('stream error:', event.message);
    if (event.type === 'done') {
      console.log('done after', events, 'events');
      break;
    }
  }
  if (frames.some((frame) => frame.includes('"done"'))) break;
}

clearTimeout(timeout);
await reader.cancel().catch(() => undefined);
console.log('answer:\n', answer.slice(0, 1200));
