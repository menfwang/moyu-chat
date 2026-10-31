import { Check, ChevronDown, Cpu } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ModelOption } from '../types';

interface ModelPickerProps {
  models: ModelOption[];
  value: string;
  isDemo: boolean;
  onChange: (id: string) => void;
}

export function ModelPicker({ models, value, isDemo, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = models.find((model) => model.id === value) ?? models[0];

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className={`model-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="model-pulse" aria-hidden="true" />
        <span className="model-trigger-name">{selected?.name ?? '选择模型'}</span>
        <span className="model-trigger-tag">{selected?.tag ?? 'AI'}</span>
        <ChevronDown size={14} className="model-chevron" />
      </button>

      {open ? (
        <div className="model-menu" id={listId} role="listbox" aria-label="选择模型">
          <div className="model-menu-head">选择对话模型</div>
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={model.id === selected?.id}
              className={`model-option${model.id === selected?.id ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
            >
              <span className="model-option-icon">
                <Cpu size={16} />
              </span>
              <span className="model-option-copy">
                <strong>{model.name}</strong>
                <small>{model.description}</small>
                <em>{model.tag}</em>
              </span>
              {model.id === selected?.id ? <Check size={16} className="model-check" /> : null}
            </button>
          ))}
          {isDemo ? (
            <p className="model-menu-note">演示模式不会调用所选模型，配置 API Key 后自动切换。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
