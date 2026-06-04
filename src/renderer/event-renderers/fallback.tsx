import { useState } from 'react';
import type { EventCardProps } from './registry.js';

export function FallbackDebugCard({ event }: EventCardProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-[11px] text-muted-foreground">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left">
        <span className="font-mono">{event.type}</span>
        <span className="ml-2 text-[10px]">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted px-2 py-1 font-mono text-[10px] scrollbar-thin">
          {JSON.stringify(event, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
