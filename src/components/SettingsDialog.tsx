import { Monitor, Moon, Sun, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicConfig, Settings, ThemeMode, Tone } from '../types';

interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  config: PublicConfig;
  hasConversations: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onClearAll: () => void;
  onClose: () => void;
}

const themes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'system', label: '跟随系统', icon: Monitor },
];

const tones: { id: Tone; label: string; description: string }[] = [
  { id: 'balanced', label: '平衡', description: '自然、完整' },
  { id: 'concise', label: '简洁', description: '先给结论' },
  { id: 'detailed', label: '详尽', description: '展开细节' },
];

export function SettingsDialog({
  open,
  settings,
  config,
  hasConversations,
  onChange,
  onClearAll,
  onClose,
}: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [confirmClear, setConfirmClear] = useState(false);
  const model = config.models.find((item) => item.id === settings.model) ?? config.models[0];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div>
            <span className="dialog-eyebrow">PREFERENCES</span>
            <h2 id="settings-title">设置与偏好</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button dialog-close"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <X size={19} />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h3>外观</h3>
            <div className="segmented theme-segmented">
              {themes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={settings.theme === id ? 'is-selected' : ''}
                  onClick={() => onChange({ theme: id })}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <h3>回答风格</h3>
              <span>会影响每一次回答</span>
            </div>
            <div className="tone-grid">
              {tones.map((tone) => (
                <button
                  key={tone.id}
                  type="button"
                  className={`tone-card${settings.tone === tone.id ? ' is-selected' : ''}`}
                  onClick={() => onChange({ tone: tone.id })}
                >
                  <strong>{tone.label}</strong>
                  <span>{tone.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <h3>创造力</h3>
              <span>{model?.id.includes('reasoner') ? '深思模型自动调节' : settings.temperature.toFixed(2)}</span>
            </div>
            <input
              className="temperature"
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={settings.temperature}
              onChange={(event) => onChange({ temperature: Number(event.target.value) })}
              disabled={model?.id.includes('reasoner')}
              aria-label="创造力"
            />
            <div className="temperature-labels">
              <span>严谨</span>
              <span>均衡</span>
              <span>发散</span>
            </div>
          </section>

          <section className="settings-section">
            <h3>当前连接</h3>
            <div className="connection-card">
              <span className={`status-dot${config.demo ? ' demo' : ''}`} />
              <div>
                <strong>{config.demo ? '演示模式' : '真实模型在线'}</strong>
                <span>
                  {config.demo
                    ? config.demoProvider === 'pollinations'
                      ? '回答由 Pollinations 公共接口生成，请勿发送敏感信息。'
                      : '回答由本地示例生成，配置 API Key 后启用真实 AI。'
                    : `通过服务端安全连接 ${model?.tag ?? 'AI 服务'}。`}
                </span>
              </div>
            </div>
            <p className="settings-hint">
              API Key 仅保存在服务器环境变量中，不会进入浏览器或对话记录。
            </p>
          </section>

          <section className="settings-section settings-danger">
            <h3>本地数据</h3>
            <p>对话记录仅保存在当前浏览器。清除后无法恢复。</p>
            <button
              type="button"
              className={`danger-button${confirmClear ? ' is-confirming' : ''}`}
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                onClearAll();
                setConfirmClear(false);
              }}
              disabled={!hasConversations}
            >
              <Trash2 size={15} />
              {confirmClear ? '再点一次，确认清空' : '清空全部对话'}
            </button>
          </section>
        </div>

        <footer>
          <span>墨语 v1.0 · 自托管 AI 对话</span>
          <button type="button" className="primary-button" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
