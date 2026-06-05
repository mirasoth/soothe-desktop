import type { EventLogEntry } from '../../state/store.js';
import { cn } from '../../lib/utils.js';

interface LorMessageListProps {
  events: EventLogEntry[];
}

function extractText(event: Record<string, unknown>): string {
  const content = event.content ?? event.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
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

function eventRole(event: Record<string, unknown>): 'user' | 'assistant' | 'system' | null {
  const type = event.type as string | undefined;
  if (!type) return null;
  if (type === 'human' || type === 'HumanMessage') return 'user';
  if (type === 'ai' || type === 'AIMessage' || type === 'AIMessageChunk') return 'assistant';
  return null;
}

export function LorMessageList({ events }: LorMessageListProps): React.ReactElement {
  const conversational = events.filter(e => {
    const role = eventRole(e.event);
    return role !== null;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      {conversational.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Waiting for worker messages...
        </div>
      ) : (
        <div className="space-y-3">
          {conversational.map(entry => {
            const role = eventRole(entry.event)!;
            const text = extractText(entry.event);
            if (!text.trim()) return null;
            return (
              <div
                key={entry.id}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  role === 'user'
                    ? 'ml-8 bg-primary/10 text-foreground'
                    : 'mr-8 bg-muted text-foreground',
                )}
              >
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                  {role === 'user' ? 'Input' : 'Agent'}
                </div>
                <div className="whitespace-pre-wrap break-words">{text}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
