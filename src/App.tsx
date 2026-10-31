import { Menu, Moon, Settings, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Composer } from './components/Composer';
import { ConfirmDialog } from './components/ConfirmDialog';
import { MessageBubble } from './components/MessageBubble';
import { ModelPicker } from './components/ModelPicker';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { Welcome } from './components/Welcome';
import { streamChat } from './lib/chat';
import {
  clearStoredConversations,
  loadConversations,
  loadSettings,
  saveConversations,
  saveSettings,
} from './lib/storage';
import { applyTheme } from './lib/theme';
import type { Conversation, Message, PublicConfig, Settings as AppSettings } from './types';

const FALLBACK_CONFIG: PublicConfig = {
  demo: true,
  demoProvider: 'local',
  models: [
    {
      id: 'deepseek-chat',
      name: '轻语',
      description: '快速、均衡，适合日常对话',
      tag: 'DeepSeek Chat',
    },
  ],
  defaultModel: 'deepseek-chat',
  maxInputChars: 40_000,
  maxOutputTokens: 4096,
};

function createId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeTitle(text: string) {
  const cleaned = text
    .replace(/[#>*_`~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '新的对话';
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}…` : cleaned;
}

function toApiMessages(messages: Message[]): Pick<Message, 'role' | 'content'>[] {
  const cleaned = messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
  while (cleaned[0]?.role === 'assistant') cleaned.shift();
  return cleaned;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('[role="textbox"]') !== null
  );
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [config, setConfig] = useState<PublicConfig>(FALLBACK_CONFIG);
  const [connection, setConnection] = useState<'loading' | 'online' | 'offline'>('loading');
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<{ conversationId: string; messageId: string } | null>(
    null,
  );
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId],
  );
  const messages = activeConversation?.messages ?? [];
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.id,
    [messages],
  );
  const activeModel =
    config.models.find((model) => model.id === settings.model) ?? config.models[0];
  const isDemo = connection !== 'offline' && config.demo;
  const resolvedTheme =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('config unavailable');
        return (await response.json()) as PublicConfig;
      })
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setConnection('online');
        setSettings((current) =>
          data.models.some((model) => model.id === current.model)
            ? current
            : { ...current, model: data.defaultModel },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setConfig(FALLBACK_CONFIG);
        setConnection('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveConversations(conversations), 250);
    return () => window.clearTimeout(timer);
  }, [conversations]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme, systemDark]);

  useEffect(() => {
    document.title = activeConversation ? `${activeConversation.title} · 墨语` : '墨语 · AI 对话';
  }, [activeConversation]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (nearBottomRef.current) {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    }
  }, [messages, streaming]);

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, updater: (message: Message) => Message) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? updater(message) : message,
                ),
              }
            : conversation,
        ),
      );
    },
    [],
  );

  const startStream = useCallback(
    async (
      conversationId: string,
      assistantId: string,
      apiMessages: Pick<Message, 'role' | 'content'>[],
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setStreaming({ conversationId, messageId: assistantId });
      nearBottomRef.current = true;

      try {
        await streamChat({
          messages: apiMessages,
          model: settings.model,
          temperature: settings.temperature,
          tone: settings.tone,
          signal: controller.signal,
          onDelta: (text) => {
            patchMessage(conversationId, assistantId, (message) => ({
              ...message,
              content: message.content + text,
              error: undefined,
            }));
          },
          onReasoning: (text) => {
            patchMessage(conversationId, assistantId, (message) => ({
              ...message,
              reasoning: (message.reasoning ?? '') + text,
            }));
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          patchMessage(conversationId, assistantId, (message) => ({
            ...message,
            stopped: true,
          }));
        } else {
          const message =
            error instanceof TypeError
              ? '网络连接失败，请检查网络后重试。'
              : error instanceof Error
                ? error.message
                : '生成回答时出现异常，请稍后重试。';
          patchMessage(conversationId, assistantId, (current) => ({
            ...current,
            error: message,
          }));
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          busyRef.current = false;
          setStreaming((current) => (current?.messageId === assistantId ? null : current));
        }
      }
    },
    [patchMessage, settings.model, settings.temperature, settings.tone],
  );

  const stopGeneration = useCallback(() => {
    busyRef.current = false;
    const controller = abortRef.current;
    if (!controller) return;
    abortRef.current = null;
    controller.abort();
    setStreaming(null);
  }, []);

  const newChat = useCallback(() => {
    stopGeneration();
    setActiveId(null);
    setDraft('');
    setSidebarOpen(false);
  }, [stopGeneration]);

  const selectConversation = useCallback(
    (id: string) => {
      if (id === activeId) {
        setSidebarOpen(false);
        return;
      }
      stopGeneration();
      setActiveId(id);
      setDraft('');
      setSidebarOpen(false);
      nearBottomRef.current = true;
      window.requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    },
    [activeId, stopGeneration],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming || busyRef.current) return;
    busyRef.current = true;

    const now = Date.now();
    const userMessage: Message = {
      id: createId(),
      role: 'user',
      content: text,
      createdAt: now,
    };
    const assistantMessage: Message = {
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
    };

    const existing = activeId
      ? conversations.find((conversation) => conversation.id === activeId)
      : undefined;

    let conversationId: string;
    let apiMessages: Pick<Message, 'role' | 'content'>[];

    if (existing) {
      conversationId = existing.id;
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === existing.id
            ? {
                ...conversation,
                title:
                  conversation.messages.length === 0 ? makeTitle(text) : conversation.title,
                messages: [...conversation.messages, userMessage, assistantMessage],
                updatedAt: now,
              }
            : conversation,
        ),
      );
      apiMessages = toApiMessages([...existing.messages, userMessage]);
    } else {
      conversationId = createId();
      const conversation: Conversation = {
        id: conversationId,
        title: makeTitle(text),
        messages: [userMessage, assistantMessage],
        createdAt: now,
        updatedAt: now,
      };
      setConversations((current) => [conversation, ...current]);
      setActiveId(conversationId);
      apiMessages = toApiMessages([userMessage]);
    }

    setDraft('');
    nearBottomRef.current = true;
    window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    void startStream(conversationId, assistantMessage.id, apiMessages);
  }, [activeId, conversations, draft, startStream, streaming]);

  const regenerate = useCallback(
    (messageId: string) => {
      if (!activeConversation || streaming || busyRef.current) return;
      const index = activeConversation.messages.findIndex((message) => message.id === messageId);
      if (index < 1) return;
      const target = activeConversation.messages[index];
      if (!target || target.role !== 'assistant') return;

      const prefix = activeConversation.messages.slice(0, index);
      const apiMessages = toApiMessages(prefix);
      if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1]?.role !== 'user') return;

      const resetMessage: Message = {
        ...target,
        content: '',
        reasoning: undefined,
        error: undefined,
        stopped: false,
        createdAt: Date.now(),
      };

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversation.id
            ? {
                ...conversation,
                messages: [...prefix, resetMessage],
                updatedAt: Date.now(),
              }
            : conversation,
        ),
      );
      nearBottomRef.current = true;
      void startStream(activeConversation.id, target.id, apiMessages);
    },
    [activeConversation, startStream, streaming],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (streaming?.conversationId === deleteTarget.id) stopGeneration();
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== deleteTarget.id),
    );
    if (activeId === deleteTarget.id) setActiveId(null);
    setDeleteTarget(null);
    showToast('对话已删除');
  }, [activeId, deleteTarget, showToast, stopGeneration, streaming]);

  const clearAll = useCallback(() => {
    stopGeneration();
    setConversations([]);
    setActiveId(null);
    setDraft('');
    clearStoredConversations();
    showToast('本地对话已清空');
  }, [showToast, stopGeneration]);

  const handleSuggestion = useCallback((prompt: string) => {
    setDraft(prompt);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !settingsOpen &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        newChat();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [newChat, settingsOpen]);

  const connectionLabel =
    connection === 'loading' ? '连接中' : connection === 'offline' ? '离线' : config.demo ? '演示模式' : '在线';

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        isDemo={isDemo}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={setDeleteTarget}
        onSettings={() => setSettingsOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开对话历史"
            >
              <Menu size={20} />
            </button>
            <div className="topbar-title">
              <span>对话</span>
              <h1>{activeConversation?.title ?? '新的对话'}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <ModelPicker
              models={config.models}
              value={settings.model}
              isDemo={isDemo}
              onChange={(model) => setSettings((current) => ({ ...current, model }))}
            />
            <span
              className={`connection-pill${config.demo ? ' demo' : ''}${connection === 'offline' ? ' offline' : ''}`}
              title={connection === 'offline' ? '无法连接服务器' : undefined}
            >
              <span className="status-dot" />
              <span>{connectionLabel}</span>
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  theme: resolvedTheme === 'dark' ? 'light' : 'dark',
                }))
              }
              aria-label={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
              {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div
          className="chat-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            nearBottomRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
        >
          {messages.length === 0 ? (
            <Welcome config={config} onPick={handleSuggestion} />
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={streaming?.messageId === message.id}
                  canRegenerate={message.id === lastAssistantId && !streaming}
                  onRegenerate={() => regenerate(message.id)}
                />
              ))}
              <div className="messages-end" />
            </div>
          )}
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={stopGeneration}
          streaming={Boolean(streaming)}
          modelName={activeModel?.name ?? '墨语'}
          maxLength={config.maxInputChars}
          isDemo={isDemo}
        />
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        config={config}
        hasConversations={conversations.length > 0}
        onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        onClearAll={clearAll}
        onClose={() => setSettingsOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除这段对话？"
        description={
          deleteTarget
            ? `「${deleteTarget.title}」将从当前浏览器中移除，此操作无法撤销。`
            : ''
        }
        confirmLabel="删除对话"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast} />
    </div>
  );
}
