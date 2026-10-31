import type { Conversation, Message, Settings } from '../types';

const CONVERSATIONS_KEY = 'moyu.conversations.v1';
const SETTINGS_KEY = 'moyu.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  model: 'deepseek-chat',
  temperature: 0.7,
  tone: 'balanced',
};

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<Message>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'number'
  );
}

function isConversation(value: unknown): value is Conversation {
  if (typeof value !== 'object' || value === null) return false;
  const conversation = value as Partial<Conversation>;
  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    typeof conversation.createdAt === 'number' &&
    typeof conversation.updatedAt === 'number' &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isMessage)
  );
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isConversation)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations.slice(0, 100)));
  } catch {
    // Storage can be unavailable in private mode; the app still works in memory.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULT_SETTINGS.theme,
      model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_SETTINGS.model,
      temperature:
        typeof parsed.temperature === 'number'
          ? Math.min(1.5, Math.max(0, parsed.temperature))
          : DEFAULT_SETTINGS.temperature,
      tone:
        parsed.tone === 'balanced' || parsed.tone === 'concise' || parsed.tone === 'detailed'
          ? parsed.tone
          : DEFAULT_SETTINGS.tone,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors.
  }
}

export function clearStoredConversations() {
  try {
    localStorage.removeItem(CONVERSATIONS_KEY);
  } catch {
    // Ignore storage errors.
  }
}
