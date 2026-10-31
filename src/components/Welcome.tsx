import { Compass, Feather, HeartHandshake, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react';
import type { PublicConfig } from '../types';

interface WelcomeProps {
  config: PublicConfig;
  onPick: (prompt: string) => void;
}

const suggestions = [
  {
    icon: Compass,
    title: '规划一周',
    hint: '把忙碌安排得从容一些',
    prompt: '帮我规划高效但不内耗的一周：我有 3 个重要项目，还想每天留出运动时间。',
  },
  {
    icon: Lightbulb,
    title: '解释一个概念',
    hint: '复杂的事，也能说得简单',
    prompt: '用高中生也能听懂的方式解释量子纠缠，并举一个生活中的类比。',
  },
  {
    icon: Feather,
    title: '写一封信',
    hint: '把难开口的话写下来',
    prompt: '帮我写一封真诚、克制的道歉信，对象是多年好友，因为一次失约产生了误会。',
  },
  {
    icon: HeartHandshake,
    title: '梳理一个想法',
    hint: '从模糊的念头开始',
    prompt: '我想做一个面向独立创作者的工具，请帮我用结构化的问题梳理产品定位和第一批用户。',
  },
];

export function Welcome({ config, onPick }: WelcomeProps) {
  const model = config.models[0];

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-eyebrow">
          <Sparkles size={14} />
          <span>A QUIET PLACE TO THINK</span>
        </div>

        <h1>
          把想法，
          <br />
          慢慢说给我听<span className="accent-dot">。</span>
        </h1>

        <p className="welcome-lede">
          我是墨语，一个愿意先听完、再回答的 AI 伙伴。
          <br className="desktop-only" />
          可以聊灵感、写文字，也可以一起把复杂的事想清楚。
        </p>

        <div className="suggestions">
          {suggestions.map(({ icon: Icon, title, hint, prompt }) => (
            <button
              key={title}
              type="button"
              className="suggestion"
              onClick={() => onPick(prompt)}
            >
              <span className="suggestion-icon">
                <Icon size={18} />
              </span>
              <span className="suggestion-copy">
                <strong>{title}</strong>
                <small>{hint}</small>
              </span>
              <span className="suggestion-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>

        <div className="welcome-foot">
          <span>
            <ShieldCheck size={14} />
            对话仅保存在这台设备的浏览器中
          </span>
          <span className="welcome-divider" />
          <span>{model ? `${model.tag} · ${model.name}` : 'AI 对话'}</span>
          {config.demo ? (
            <span className="demo-pill">
              演示模式{config.demoProvider === 'pollinations' ? ' · 公共接口' : ''}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
