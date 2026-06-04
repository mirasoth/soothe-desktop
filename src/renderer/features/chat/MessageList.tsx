import { useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { TabState } from '../../state/store.js';
import { resolveRenderer } from '../../event-renderers/registry.js';
import { Markdown } from '../../lib/markdown.js';

type Item =
  | { kind: 'event'; id: string; tabId: string; event: Record<string, unknown> & { type: string }; receivedAt: number }
  | { kind: 'assistant'; id: string; tabId: string; text: string };

/**
 * Coalesce consecutive AIMessage/AIMessageChunk events for the same turn into
 * one synthetic 'assistant' item. The chunk text is concatenated.
 */
function coalesceAssistantChunks(tab: TabState): Item[] {
  const out: Item[] = [];
  let buffer: { id: string; text: string } | null = null;
  const flush = (): void => {
    if (buffer) {
      out.push({
        kind: 'assistant',
        id: buffer.id,
        tabId: tab.tabId,
        text: buffer.text,
      });
      buffer = null;
    }
  };
  for (const entry of tab.events) {
    const type = entry.event.type;
    // Coalesce streaming chunks into a single assistant bubble per turn.
    if (type === 'AIMessageChunk') {
      const text = extractText(entry.event);
      if (!buffer) buffer = { id: `assist-${entry.id}`, text };
      else buffer.text += text;
      continue;
    }
    // A full ai/AIMessage that matches an in-progress chunk buffer is the
    // canonical version — replace the buffer rather than emit a duplicate.
    if ((type === 'ai' || type === 'AIMessage') && buffer) {
      buffer.text = extractText(entry.event) || buffer.text;
      buffer.id = `assist-${entry.id}`;
      continue;
    }
    // Dedupe: if the daemon emits the same full ai/AIMessage twice in a row
    // (no chunks involved), drop the second.
    if (type === 'ai' || type === 'AIMessage') {
      const text = extractText(entry.event).trim();
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.kind === 'event' &&
        (prev.event.type === 'ai' || prev.event.type === 'AIMessage') &&
        extractText(prev.event).trim() === text
      ) {
        continue;
      }
      if (prev && prev.kind === 'assistant' && prev.text.trim() === text) {
        continue;
      }
    }
    flush();
    out.push({
      kind: 'event',
      id: entry.id,
      tabId: tab.tabId,
      event: entry.event,
      receivedAt: entry.receivedAt,
    });
  }
  flush();
  return out;
}

function extractText(event: Record<string, unknown>): string {
  const direct = event.content ?? event.text;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) {
    return direct
      .map(seg =>
        typeof seg === 'string'
          ? seg
          : seg && typeof seg === 'object' && typeof (seg as { text?: string }).text === 'string'
            ? (seg as { text: string }).text
            : '',
      )
      .join('');
  }
  return '';
}

interface Props {
  tab: TabState;
}

export function MessageList({ tab }: Props): React.ReactElement {
  const items = useMemo(() => coalesceAssistantChunks(tab), [tab]);

  return (
    <Virtuoso
      data={items}
      followOutput="auto"
      className="h-full scrollbar-thin"
      itemContent={(_index, item) => (
        <div className="px-4 py-1.5">
          {item.kind === 'assistant' ? (
            <div className="flex w-full justify-start">
              <div className="max-w-[85%] rounded-lg border bg-card px-4 py-3 shadow-sm">
                <Markdown>{item.text}</Markdown>
              </div>
            </div>
          ) : (
            <EventCardWrapper
              tabId={item.tabId}
              event={item.event}
              receivedAt={item.receivedAt}
            />
          )}
        </div>
      )}
    />
  );
}

function EventCardWrapper({
  tabId,
  event,
  receivedAt,
}: {
  tabId: string;
  event: Record<string, unknown> & { type: string };
  receivedAt: number;
}): React.ReactElement | null {
  const Renderer = resolveRenderer(event.type);
  if (!Renderer) return null;
  return <Renderer tabId={tabId} event={event} receivedAt={receivedAt} />;
}
