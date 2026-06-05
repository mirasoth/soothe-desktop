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
      .join('\n');
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
    <div className="max-w-[85%] py-1 text-sm leading-relaxed">
      <Markdown>{text}</Markdown>
    </div>
  );
}

/**
 * Detect whether a human message likely contains rich markdown (code fences,
 * lists, links, etc). If not — and most user prompts are short plain text —
 * render as preserved plain text so we avoid the prose paragraph margins
 * that make a one-word reply ("yes") look like a tall card.
 */
function looksLikeMarkdown(text: string): boolean {
  return /```|^\s*[-*]\s|^\s*\d+\.\s|\[[^\]]+\]\([^)]+\)|`[^`]+`|^\s*#/m.test(text);
}

export function HumanBubble({ event }: EventCardProps): React.ReactElement | null {
  const text = extractText(event);
  if (!text.trim()) return null;
  const rich = looksLikeMarkdown(text);
  return (
    <div className="flex w-full justify-end">
      <div
        className="inline-flex max-w-[75%] flex-col rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm"
        style={{ backgroundColor: 'hsl(var(--user-bubble))' }}
      >
        {rich ? (
          <Markdown className="prose-invert !text-white [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
            {text}
          </Markdown>
        ) : (
          <span className="whitespace-pre-wrap break-words">{text}</span>
        )}
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
