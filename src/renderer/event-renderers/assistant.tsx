import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

function extractText(event: Record<string, unknown>): string {
  const direct = event.content ?? event.text ?? event.message;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) {
    return direct
      .map(seg => {
        if (typeof seg === 'string') return seg;
        if (seg && typeof seg === 'object' && typeof (seg as { text?: string }).text === 'string') {
          return (seg as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  const data = event.data;
  if (data && typeof data === 'object') {
    return extractText(data as Record<string, unknown>);
  }
  return '';
}

export function AssistantBubble({ event }: EventCardProps): React.ReactElement | null {
  const text = extractText(event);
  if (!text.trim()) return null;
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] rounded-lg border bg-card px-4 py-3 shadow-sm">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}

export function HumanBubble({ event }: EventCardProps): React.ReactElement | null {
  const text = extractText(event);
  if (!text.trim()) return null;
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-sm">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}

export function ToolMessageCard({ event }: EventCardProps): React.ReactElement | null {
  const text = extractText(event);
  if (!text.trim()) return null;
  const toolName =
    (event.name as string | undefined) ??
    (event.tool as string | undefined) ??
    (event.tool_call_id as string | undefined) ??
    'tool';
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        tool · {toolName}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground/80 scrollbar-thin">
        {text}
      </pre>
    </div>
  );
}
