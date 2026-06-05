import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from './utils.js';

interface Props {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: Props): React.ReactElement {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-foreground',
        'prose-p:my-1.5 prose-p:leading-relaxed',
        'prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-semibold',
        'prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
        'prose-pre:bg-muted prose-pre:text-foreground',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-code:before:hidden prose-code:after:hidden',
        'prose-strong:font-semibold',
        'prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-muted-foreground',
        '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline decoration-primary/30 hover:decoration-primary/60"
            >
              {c}
            </a>
          ),
          pre: ({ children: c }) => (
            <pre className="rounded-lg border bg-muted px-3 py-2.5 text-xs leading-relaxed overflow-x-auto scrollbar-thin">
              {c}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
