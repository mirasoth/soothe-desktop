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
        className={
          // Right-aligned soft bubble. Uses `accent` (subtle gray) rather than
          // `primary` (high-contrast inverse) so it sits comfortably next to the
          // assistant card without dominating the chat. Asymmetric corners give
          // a "your-side" cue. Width fits content up to 75% of the chat.
          'inline-flex max-w-[75%] flex-col rounded-2xl rounded-tr-md bg-accent px-3.5 py-2 text-sm text-foreground shadow-sm'
        }
      >
        {rich ? (
          <Markdown className="!prose-p:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
            {text}
          </Markdown>
        ) : (
          <span className="whitespace-pre-wrap break-words leading-snug">{text}</span>
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
