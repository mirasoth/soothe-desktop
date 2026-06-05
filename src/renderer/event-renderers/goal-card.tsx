import type { EventCardProps } from './registry.js';

function extractGoal(event: Record<string, unknown>): string {
  const data = (event.data ?? event) as Record<string, unknown>;
  return (
    (typeof data.goal === 'string' ? data.goal : '') ||
    (typeof data.content === 'string' ? data.content : '') ||
    (typeof data.text === 'string' ? data.text : '') ||
    ''
  );
}

export function GoalCard({ event }: EventCardProps): React.ReactElement | null {
  const goal = extractGoal(event);
  if (!goal) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Goal
      </div>
      <div className="mt-0.5 text-sm text-foreground">
        {goal}
      </div>
    </div>
  );
}
