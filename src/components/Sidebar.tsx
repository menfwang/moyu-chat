import { MessageSquare, Plus, Settings, Sparkles, Trash2, X } from 'lucide-react';
import type { Conversation } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  isDemo: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (conversation: Conversation) => void;
  onSettings: () => void;
  onClose: () => void;
}

function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: '今天', items: [] },
    { label: '最近 7 天', items: [] },
    { label: '更早', items: [] },
  ];

  for (const conversation of conversations) {
    if (conversation.updatedAt >= startOfToday) groups[0]!.items.push(conversation);
    else if (conversation.updatedAt >= weekAgo) groups[1]!.items.push(conversation);
    else groups[2]!.items.push(conversation);
  }

  return groups.filter((group) => group.items.length > 0);
}

export function Sidebar({
  conversations,
  activeId,
  open,
  isDemo,
  onSelect,
  onNew,
  onDelete,
  onSettings,
  onClose,
}: SidebarProps) {
  const groups = groupConversations(conversations);

  return (
    <>
      <div
        className={`sidebar-scrim${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="对话历史">
        <div className="sidebar-head">
          <button type="button" className="brand" onClick={onNew} aria-label="墨语首页">
            <span className="brand-seal">墨</span>
            <span className="brand-word">
              <strong>墨语</strong>
              <small>MOYU</small>
            </span>
          </button>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="关闭菜单">
            <X size={19} />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={onNew}>
          <Plus size={17} />
          <span>开始新对话</span>
          <kbd>N</kbd>
        </button>

        <div className="history">
          {groups.length === 0 ? (
            <div className="history-empty">
              <MessageSquare size={20} strokeWidth={1.5} />
              <p>还没有对话</p>
              <span>刚才的灵感，会在这里留下痕迹。</span>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="history-group">
                <h2>{group.label}</h2>
                {group.items.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`conversation${conversation.id === activeId ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="conversation-main"
                      onClick={() => onSelect(conversation.id)}
                      title={conversation.title}
                    >
                      <span className="conversation-mark" aria-hidden="true" />
                      <span className="conversation-title">{conversation.title}</span>
                    </button>
                    <button
                      type="button"
                      className="conversation-delete"
                      onClick={() => onDelete(conversation)}
                      aria-label={`删除对话：${conversation.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-mode">
            <span className={`status-dot${isDemo ? ' demo' : ''}`} />
            <div>
              <strong>{isDemo ? '演示模式' : '模型在线'}</strong>
              <small>{isDemo ? '配置密钥以启用真实 AI' : '你的对话不会存入服务器'}</small>
            </div>
            <Sparkles size={15} />
          </div>
          <button type="button" className="sidebar-settings" onClick={onSettings}>
            <Settings size={17} />
            <span>设置与偏好</span>
          </button>
        </div>
      </aside>
    </>
  );
}
