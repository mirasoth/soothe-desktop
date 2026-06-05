import { useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { TabState, EventLogEntry } from '../../state/store.js';
import { resolveRenderer } from '../../event-renderers/registry.js';
import { Markdown } from '../../lib/markdown.js';
import {
  StepCard,
  type StepEventData,
  type ToolEventEntry,
  type StepCompletionData,
} from '../../event-renderers/step-card.js';

type Item =
  | {
      kind: 'event';
      id: string;
      tabId: string;
      event: Record<string, unknown> & { type: string };
      receivedAt: number;
    }
  | { kind: 'assistant'; id: string; tabId: string; text: string }
  | {
      kind: 'step-group';
      id: string;
      tabId: string;
      stepEvent: StepEventData;
      toolEvents: ToolEventEntry[];
      completionEvent?: StepCompletionData;
    };

interface StepGroupAccumulator {
  id: string;
  stepEvent: StepEventData;
  toolEvents: ToolEventEntry[];
  completionEvent?: StepCompletionData;
}

function isStepStartEvent(type: string): boolean {
  return (
    type === 'soothe.cognition.agent_loop.step.started' ||
    type === 'soothe.cognition.agent_loop.step.queued'
  );
}

function isStepCompletedEvent(type: string): boolean {
  return type === 'soothe.cognition.agent_loop.step.completed';
}

function isToolExecutionEvent(type: string): boolean {
  return type.startsWith('soothe.tool.execution.');
}

function isToolCallUpdateEvent(type: string): boolean {
  return type === 'soothe.stream.tool_call.update';
}

function isToolResultEvent(type: string): boolean {
  return type === 'tool' || type === 'ToolMessage';
}

function isConversationalEvent(type: string): boolean {
  return (
    type === 'ai' ||
    type === 'AIMessage' ||
    type === 'AIMessageChunk' ||
    type === 'human' ||
    type === 'HumanMessage' ||
    type === 'HumanMessageChunk'
  );
}

function extractStepData(
  event: Record<string, unknown>,
): { step_id: string; description: string } | null {
  const data = (event.data ?? event) as Record<string, unknown>;
  const step_id = typeof data.step_id === 'string' ? data.step_id : '';
  const description =
    (typeof data.description === 'string' ? data.description : '') ||
    (typeof data.goal === 'string' ? data.goal : '');
  if (!step_id) return null;
  return { step_id, description: description || '(step)' };
}

function extractStepCompletion(event: Record<string, unknown>): StepCompletionData | null {
  const data = (event.data ?? event) as Record<string, unknown>;
  const step_id = typeof data.step_id === 'string' ? data.step_id : '';
  if (!step_id) return null;
  return {
    success: data.success !== false,
    summary: typeof data.summary === 'string' ? data.summary : '',
    duration_ms: typeof data.duration_ms === 'number' ? data.duration_ms : 0,
    tool_call_count: typeof data.tool_call_count === 'number' ? data.tool_call_count : 0,
  };
}

function coalesceEvents(tab: TabState): Item[] {
  const out: Item[] = [];
  let assistantBuffer: { id: string; text: string } | null = null;
  let stepGroup: StepGroupAccumulator | null = null;

  const flushAssistant = (): void => {
    if (assistantBuffer) {
      out.push({
        kind: 'assistant',
        id: assistantBuffer.id,
        tabId: tab.tabId,
        text: assistantBuffer.text,
      });
      assistantBuffer = null;
    }
  };

  let lastStepHadTools = false;

  const flushStepGroup = (): void => {
    if (stepGroup) {
      lastStepHadTools = stepGroup.toolEvents.length > 0;
      out.push({
        kind: 'step-group',
        id: stepGroup.id,
        tabId: tab.tabId,
        stepEvent: stepGroup.stepEvent,
        toolEvents: stepGroup.toolEvents,
        completionEvent: stepGroup.completionEvent,
      });
      stepGroup = null;
    }
  };

  for (const entry of tab.events) {
    const type = entry.event.type;

    // --- Step grouping logic ---

    if (isStepStartEvent(type)) {
      flushAssistant();
      flushStepGroup();
      lastStepHadTools = false;
      const data = extractStepData(entry.event);
      if (data) {
        stepGroup = {
          id: `step-${entry.id}`,
          stepEvent: {
            step_id: data.step_id,
            description: data.description,
            status: type.endsWith('.queued') ? 'queued' : 'running',
          },
          toolEvents: [],
        };
      } else {
        out.push(makeEventItem(tab.tabId, entry));
      }
      continue;
    }

    if (isStepCompletedEvent(type)) {
      flushAssistant();
      if (stepGroup) {
        const completion = extractStepCompletion(entry.event);
        if (completion) stepGroup.completionEvent = completion;
        flushStepGroup();
      } else {
        out.push(makeEventItem(tab.tabId, entry));
      }
      continue;
    }

    if (stepGroup && (isToolExecutionEvent(type) || isToolResultEvent(type) || isToolCallUpdateEvent(type))) {
      stepGroup.toolEvents.push({
        id: entry.id,
        event: entry.event,
        receivedAt: entry.receivedAt,
      });
      continue;
    }

    // --- Conversational events ---
    // When a step group is open, AI messages are tool-call decisions (not
    // user-facing text) — absorb them silently. Only flush on human messages
    // which signal a new turn, or AI messages outside step groups.

    if (isConversationalEvent(type)) {
      if (stepGroup) {
        // Inside a step: absorb AI messages (tool decisions) and human messages
        // into the step group so they don't break the step card.
        if (type === 'human' || type === 'HumanMessage' || type === 'HumanMessageChunk') {
          flushStepGroup();
          lastStepHadTools = false;
        } else {
          // AI message inside step — absorb (skip rendering, step card shows tools)
          continue;
        }
      } else {
        lastStepHadTools = false;
      }
    }

    // --- Assistant chunk coalescing (existing logic) ---

    if (type === 'AIMessageChunk') {
      const text = extractText(entry.event);
      if (!assistantBuffer) assistantBuffer = { id: `assist-${entry.id}`, text };
      else assistantBuffer.text += text;
      continue;
    }

    if ((type === 'ai' || type === 'AIMessage') && assistantBuffer) {
      assistantBuffer.text = extractText(entry.event) || assistantBuffer.text;
      assistantBuffer.id = `assist-${entry.id}`;
      continue;
    }

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

    // --- Standalone tool events outside step groups ---
    // Suppress tool result/execution/update events that follow a step group that
    // already tracked tool calls (the step card shows them as tool rows).
    // Also always suppress standalone tool_call_update events — they are only
    // meaningful inside step groups.
    if (!stepGroup && (isToolExecutionEvent(type) || isToolResultEvent(type) || isToolCallUpdateEvent(type))) {
      if (lastStepHadTools || isToolCallUpdateEvent(type)) continue;
      flushAssistant();
      out.push(makeEventItem(tab.tabId, entry));
      continue;
    }

    // --- Goal completion: inject total duration ---
    if (type === 'soothe.cognition.agent_loop.completed') {
      flushAssistant();
      flushStepGroup();
      const firstEvent = tab.events[0];
      if (firstEvent) {
        const durationMs = entry.receivedAt - firstEvent.receivedAt;
        const enriched = {
          ...entry,
          event: { ...entry.event, duration_ms: durationMs },
        };
        out.push(makeEventItem(tab.tabId, enriched));
      } else {
        out.push(makeEventItem(tab.tabId, entry));
      }
      continue;
    }

    // --- Default: emit as standalone event ---

    flushAssistant();
    out.push(makeEventItem(tab.tabId, entry));
  }

  flushAssistant();
  flushStepGroup();
  return out;
}

function makeEventItem(tabId: string, entry: EventLogEntry): Item {
  return {
    kind: 'event',
    id: entry.id,
    tabId,
    event: entry.event,
    receivedAt: entry.receivedAt,
  };
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
      .join('\n');
  }
  return '';
}

interface Props {
  tab: TabState;
}

export function MessageList({ tab }: Props): React.ReactElement {
  const items = useMemo(() => coalesceEvents(tab), [tab]);

  return (
    <Virtuoso
      data={items}
      followOutput="auto"
      className="h-full scrollbar-thin"
      itemContent={(_index, item) => (
        <div className="px-5 py-1">
          {item.kind === 'step-group' ? (
            <StepCard
              stepEvent={item.stepEvent}
              toolEvents={item.toolEvents}
              completionEvent={item.completionEvent}
            />
          ) : item.kind === 'assistant' ? (
            <div className="max-w-[85%] py-1 text-sm leading-relaxed">
              <Markdown>{item.text}</Markdown>
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
