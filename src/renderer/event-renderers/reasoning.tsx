import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

function extractReasoning(event: Record<string, unknown>): { title: string; body: string } {
  const data = (event.data ?? event) as Record<string, unknown>;
  const type = (event.type as string) ?? '';
  const title = deriveTitleFromType(type, data);

  // Try a series of common reasoning/plan fields in priority order.
  const candidates: Array<unknown> = [
    data.assessment_reasoning,
    data.reasoning,
    data.text,
    data.content,
    data.message,
    data.next_action,
    data.goal,
    data.progress,
    data.plan_summary,
    data.summary,
    data.status,
  ];
  const body = candidates
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join('\n\n');

  if (body) return { title, body };

  // Last resort — pretty-print whichever subset of fields is meaningful.
  const interesting = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => {
      if (['type', 'timestamp', 'thread_id', 'request_id', 'loop_id', 'event_id'].includes(k)) return false;
      if (v === null || v === undefined || v === '') return false;
      return true;
    }),
  );
  return { title, body: Object.keys(interesting).length ? JSON.stringify(interesting, null, 2) : '(no detail)' };
}

function deriveTitleFromType(type: string, data: Record<string, unknown>): string {
  if (type.includes('plan.created')) return 'Plan';
  if (type.includes('plan.decision')) return 'Plan decision';
  if (type.endsWith('.started')) return data.goal ? `Goal: ${truncate(String(data.goal), 60)}` : 'Started';
  if (type.endsWith('.reasoned') || type.includes('reason')) return 'Reasoning';
  if (type.endsWith('.iterated')) return 'Iteration';
  if (type.endsWith('.completed')) return 'Completed';
  return 'Thinking';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function ReasoningCard(props: EventCardProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { title, body } = extractReasoning(props.event);
  const preview = body.length > 140 ? `${body.slice(0, 140).replace(/\s+/g, ' ')}…` : body;

  return (
    <Card className="border-dashed">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>{title}</span>
            <span className="text-[10px]">{open ? '▾' : '▸'}</span>
          </CardTitle>
        </CardHeader>
        {!open ? <CardContent className="pt-0 text-xs text-muted-foreground">{preview}</CardContent> : null}
      </button>
      {open ? (
        <CardContent className="pt-0">
          <Markdown className="text-xs">{body}</Markdown>
        </CardContent>
      ) : null}
    </Card>
  );
}
