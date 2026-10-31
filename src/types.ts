export type Role = 'user' | 'assistant';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Tone = 'balanced' | 'concise' | 'detailed';

export interface Message {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  createdAt: number;
  error?: string;
  stopped?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  theme: ThemeMode;
  model: string;
  temperature: number;
  tone: Tone;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  tag: string;
}

export interface PublicConfig {
  demo: boolean;
  demoProvider: 'pollinations' | 'local' | null;
  models: ModelOption[];
  defaultModel: string;
  maxInputChars: number;
  maxOutputTokens: number;
}
