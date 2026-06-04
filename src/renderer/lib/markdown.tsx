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
        'prose prose-sm max-w-none text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:hidden prose-code:after:hidden',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {c}
            </a>
          ),
          pre: ({ children: c }) => (
            <pre className="rounded-md border bg-muted px-3 py-2 text-xs overflow-x-auto scrollbar-thin">
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
