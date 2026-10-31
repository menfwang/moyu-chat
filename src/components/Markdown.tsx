import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github-dark-dimmed.css';

function extractLanguage(children: ReactNode): string {
  const child = Array.isArray(children) ? children[0] : children;
  if (typeof child === 'object' && child !== null && 'props' in child) {
    const props = (child as { props?: { className?: unknown } }).props;
    if (typeof props?.className === 'string') {
      const match = /language-([\w-]+)/.exec(props.className);
      if (match) return match[1]!;
    }
  }
  return '代码';
}

function PreBlock({ children }: ComponentPropsWithoutRef<'pre'>) {
  const [copied, setCopied] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const language = extractLanguage(children);

  async function copy() {
    const text = blockRef.current?.querySelector('pre')?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser.
    }
  }

  return (
    <div className="code-block" ref={blockRef}>
      <div className="code-head">
        <span>{language}</span>
        <button type="button" className="code-copy" onClick={() => void copy()}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre: PreBlock,
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
