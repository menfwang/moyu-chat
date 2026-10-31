import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  modelName: string;
  maxLength: number;
  isDemo: boolean;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  modelName,
  maxLength,
  isDemo,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !streaming;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(184, Math.max(28, textarea.scrollHeight))}px`;
  }, [value]);

  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) {
      textareaRef.current?.focus();
    }
  }, []);

  function submit() {
    if (canSend) onSend();
  }

  return (
    <div className="composer-dock">
      <div className={`composer${streaming ? ' is-streaming' : ''}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="有什么想聊的？"
          aria-label="输入消息"
          rows={1}
          maxLength={maxLength}
        />
        <div className="composer-bottom">
          <div className="composer-context">
            <span className="model-dot" aria-hidden="true" />
            <span>{modelName}</span>
            {isDemo ? <span className="demo-inline">演示</span> : null}
          </div>
          <div className="composer-actions">
            {value.length > maxLength * 0.75 ? (
              <span className="char-count">
                {value.length} / {maxLength}
              </span>
            ) : null}
            {streaming ? (
              <button type="button" className="send-button stop" onClick={onStop} aria-label="停止生成">
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="send-button"
                onClick={submit}
                disabled={!canSend}
                aria-label="发送消息"
              >
                <ArrowUp size={19} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="composer-note">
        <span>Enter 发送 · Shift + Enter 换行</span>
        <span>AI 也会犯错，请核查重要信息</span>
      </p>
    </div>
  );
}
