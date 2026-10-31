import { Check, Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { Message } from '../types';
import { Markdown } from './Markdown';

interface MessageBubbleProps {
  message: Message;
  streaming: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function TypingDots() {
  return (
    <span className="typing" aria-label="正在生成">
      <span />
      <span />
      <span />
    </span>
  );
}

export function MessageBubble({
  message,
  streaming,
  canRegenerate,
  onRegenerate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard errors.
    }
  }

  if (message.role === 'user') {
    return (
      <div className="message-row user">
        <div className="user-message">
          <p>{message.content}</p>
          <time>{formatTime(message.createdAt)}</time>
        </div>
      </div>
    );
  }

  const hasContent = message.content.trim().length > 0;
  const showEmptyStopped = message.stopped && !hasContent && !message.error;

  return (
    <article className="message-row assistant">
      <div className="assistant-avatar" aria-hidden="true">
        墨
      </div>
      <div className="assistant-body">
        <div className="assistant-meta">
          <strong>墨语</strong>
          <span>AI</span>
          <time>{formatTime(message.createdAt)}</time>
        </div>

        {message.reasoning ? (
          <details className="reasoning">
            <summary>
              思考过程
              {streaming && !hasContent ? <span className="reasoning-live">进行中</span> : null}
            </summary>
            <div className="reasoning-text">{message.reasoning}</div>
          </details>
        ) : null}

        {hasContent ? (
          <Markdown>{message.content}</Markdown>
        ) : streaming ? (
          <div className="assistant-waiting">
            <TypingDots />
            <span>{message.reasoning ? '正在梳理思路' : '正在思考'}</span>
          </div>
        ) : null}

        {message.error ? (
          <div className="message-error" role="alert">
            <TriangleAlert size={16} />
            <div>
              <p>{message.error}</p>
              {canRegenerate ? (
                <button type="button" onClick={onRegenerate}>
                  <RefreshCw size={14} />
                  重新生成
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {showEmptyStopped ? <p className="stopped-note">生成已停止</p> : null}
        {message.stopped && hasContent ? <p className="stopped-note">已停止生成</p> : null}

        {hasContent ? (
          <div className={`message-actions${streaming ? ' is-streaming' : ''}`}>
            <button type="button" onClick={() => void copy()} aria-label="复制回答">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
            {canRegenerate && !streaming ? (
              <button type="button" onClick={onRegenerate} aria-label="重新生成回答">
                <RefreshCw size={15} />
                <span>重新生成</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
