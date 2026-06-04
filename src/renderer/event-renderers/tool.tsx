import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import type { EventCardProps } from './registry.js';

function describeTool(event: Record<string, unknown>): {
  name: string;
  state: 'started' | 'completed' | 'error';
  preview?: string;
  full?: unknown;
} {
  const data = (event.data ?? event) as Record<string, unknown>;
  const name =
    (data.tool_name as string | undefined) ??
    (data.name as string | undefined) ??
    (data.tool as string | undefined) ??
    'tool';
  const type = event.type as string;
  let state: 'started' | 'completed' | 'error' = 'started';
  if (type.endsWith('.completed')) state = 'completed';
  else if (type.endsWith('.error')) state = 'error';

  const preview =
    (data.preview as string | undefined) ??
    (data.summary as string | undefined) ??
    (data.command as string | undefined) ??
    (data.error as string | undefined);

  return { name, state, preview, full: data };
}

const stateBadge: Record<'started' | 'completed' | 'error', string> = {
  started: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function ToolCard({ event }: EventCardProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { name, state, preview, full } = describeTool(event);

  return (
    <Card>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${stateBadge[state]}`}
            >
              {state}
            </span>
            <span className="font-mono">{name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{open ? '▾' : '▸'}</span>
          </CardTitle>
        </CardHeader>
        {!open && preview ? (
          <CardContent className="pt-0 font-mono text-xs text-muted-foreground line-clamp-2">
            {preview}
          </CardContent>
        ) : null}
      </button>
      {open ? (
        <CardContent className="pt-0">
          <pre className="max-h-72 overflow-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs scrollbar-thin">
            {JSON.stringify(full, null, 2)}
          </pre>
        </CardContent>
      ) : null}
    </Card>
  );
}
