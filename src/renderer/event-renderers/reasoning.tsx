import type { EventCardProps } from './registry.js';

function extractReasoning(event: Record<string, unknown>): string {
  const data = (event.data ?? event) as Record<string, unknown>;
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
  return candidates
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

export function ReasoningCard({ event }: EventCardProps): React.ReactElement | null {
  const text = extractReasoning(event);
  if (!text) return null;

  return (
    <div className="max-w-[85%] py-1 text-sm leading-relaxed">
      {text}
    </div>
  );
}
