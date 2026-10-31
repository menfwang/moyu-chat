const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const model = process.env.MODEL ?? '';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 120_000);
const started = Date.now();

const response = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '只回复两个字：可用' }],
    ...(model ? { model } : {}),
    tone: 'balanced',
    temperature: 0.7,
  }),
  signal: controller.signal,
});

console.log('status:', response.status, 'model:', model || '(default)');
if (!response.ok) {
  console.log((await response.text()).slice(0, 800));
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let answer = '';
let reasoningLength = 0;
let events = 0;
let done = false;

while (!done) {
  const { done: streamDone, value } = await reader.read();
  if (streamDone) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop() ?? '';
  for (const frame of frames) {
    const line = frame.split('\n').find((item) => item.startsWith('data:'));
    if (!line) continue;
    const event = JSON.parse(line.slice(5).trim());
    events += 1;
    if (event.type === 'delta') answer += event.text;
    if (event.type === 'reasoning') reasoningLength += event.text.length;
    if (event.type === 'error') {
      console.log('stream error:', event.message);
      process.exitCode = 1;
    }
    if (event.type === 'done') done = true;
  }
}

clearTimeout(timer);
await reader.cancel().catch(() => undefined);
console.log('events:', events, 'reasoningChars:', reasoningLength, 'elapsedMs:', Date.now() - started);
console.log('answer:', JSON.stringify(answer.slice(0, 400)));
