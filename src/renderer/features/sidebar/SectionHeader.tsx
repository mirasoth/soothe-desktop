import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface SectionHeaderProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionHeader({
  title,
  count,
  defaultOpen = true,
  action,
  children,
}: SectionHeaderProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(v => !v)}
        >
          <span
            className={cn(
              'text-[10px] transition-transform',
              open ? 'rotate-90' : 'rotate-0',
            )}
          >
            ▶
          </span>
          {title}
          {count !== undefined && (
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </button>
        {action}
      </div>
      {open && children}
    </div>
  );
}
