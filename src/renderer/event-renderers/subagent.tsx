import type { EventCardProps } from './registry.js';
import { parseNamespace } from '@shared/events';

export function SubagentChip({ event }: EventCardProps): React.ReactElement {
  const parts = parseNamespace(event.type);
  const agent = parts?.component ?? 'subagent';
  const signal = parts?.action ?? '';
  const data = (event.data ?? event) as Record<string, unknown>;
  const summary =
    (data.summary as string | undefined) ?? (data.message as string | undefined) ?? '';
  return (
    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <span className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
        {agent}
      </span>
      <span className="font-mono">{signal}</span>
      {summary ? <span className="truncate">— {summary}</span> : null}
    </div>
  );
}
