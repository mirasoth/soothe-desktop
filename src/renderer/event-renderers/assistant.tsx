import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

function extractAssistantText(event: Record<string, unknown>): string {
  // AIMessage / AIMessageChunk wire frames carry content under .content
  // (string or list of segments) or .text. Be tolerant.
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
    return extractAssistantText(data as Record<string, unknown>);
  }
  return '';
}

export function AssistantBubble({ event }: EventCardProps): React.ReactElement | null {
  const text = extractAssistantText(event);
  if (!text.trim()) return null;
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] rounded-lg border bg-card px-4 py-3 shadow-sm">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}
