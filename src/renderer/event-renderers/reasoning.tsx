import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

function extractReasoning(event: Record<string, unknown>): { title: string; body: string } {
  const data = (event.data ?? event) as Record<string, unknown>;
  const title =
    (data.reasoning_type as string | undefined) ??
    (data.phase as string | undefined) ??
    deriveTitleFromType(event.type as string);
  const body =
    (data.text as string | undefined) ??
    (data.content as string | undefined) ??
    (data.reasoning as string | undefined) ??
    (data.message as string | undefined) ??
    JSON.stringify(data, null, 2);
  return { title, body };
}

function deriveTitleFromType(type: string): string {
  if (type.includes('plan.created')) return 'Plan';
  if (type.includes('plan.decision')) return 'Plan decision';
  if (type.includes('reason')) return 'Reasoning';
  return 'Thinking';
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
