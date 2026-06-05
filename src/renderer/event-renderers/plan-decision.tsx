import { useState } from 'react';
import { cn } from '../lib/utils.js';
import type { EventCardProps } from './registry.js';

interface PlanStep {
  id: string;
  description: string;
}

function extractPlanData(event: Record<string, unknown>): {
  steps: PlanStep[];
  iteration: number;
  executionMode: string;
} {
  const data = (event.data ?? event) as Record<string, unknown>;
  const rawSteps = data.steps;
  const steps: PlanStep[] = [];
  if (Array.isArray(rawSteps)) {
    for (const s of rawSteps) {
      if (s && typeof s === 'object') {
        const step = s as Record<string, unknown>;
        steps.push({
          id: typeof step.id === 'string' ? step.id : '',
          description: typeof step.description === 'string' ? step.description : '',
        });
      }
    }
  }
  return {
    steps,
    iteration: typeof data.iteration === 'number' ? data.iteration : 0,
    executionMode: typeof data.execution_mode === 'string' ? data.execution_mode : '',
  };
}

export function PlanDecisionCard({ event }: EventCardProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const { steps, executionMode } = extractPlanData(event);

  if (steps.length === 0) return <></>;

  return (
    <div className="rounded-lg border border-border/60 bg-card/50">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-muted-foreground">
          Plan
        </span>
        {executionMode && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {executionMode}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {steps.length} step{steps.length !== 1 ? 's' : ''} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 pb-2.5 pt-1.5">
          {steps.map((step, i) => (
            <div key={step.id || i} className="flex items-start gap-2 py-1">
              <div className="flex flex-none items-center gap-1.5 pt-0.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    'bg-muted-foreground/40',
                  )}
                />
                {step.id && (
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {step.id}
                  </span>
                )}
              </div>
              <span className="min-w-0 text-xs text-foreground/80">
                {step.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
