import type { Message, Tone } from '../types';

interface StreamChatOptions {
  messages: Pick<Message, 'role' | 'content'>[];
  model: string;
  temperature: number;
  tone: Tone;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onReasoning: (text: string) => void;
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: options.messages,
      model: options.model,
      temperature: options.temperature,
      tone: options.tone,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    let message = '请求失败，请稍后重试。';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Keep the friendly fallback.
    }
    throw new Error(message);
  }

  if (!response.body) throw new Error('浏览器不支持流式响应。');

  const reader = response.body.getReader();
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

    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      return;
    }

    if (event.type === 'delta' && typeof event.text === 'string') {
      options.onDelta(event.text);
    } else if (event.type === 'reasoning' && typeof event.text === 'string') {
      options.onReasoning(event.text);
    } else if (event.type === 'done') {
      finished = true;
    } else if (event.type === 'error') {
      throw new Error(event.message || '生成回答时出现错误。');
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
    if (buffer.trim() && !finished) handleFrame(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
