import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

const GENERIC_COMPLETIONS = new Set([
  'goal achieved successfully',
  'done',
  'completed',
  'completed successfully',
  'goal completed',
  'task completed',
  'task completed successfully',
]);

function extractReport(event: Record<string, unknown>): {
  text: string;
  toolCount: number;
  totalSteps: number;
  duration: string;
} {
  const data = (event.data ?? event) as Record<string, unknown>;
  const rawText =
    (data.final_report as string | undefined) ??
    (data.summary as string | undefined) ??
    (data.report as string | undefined) ??
    (data.completion_summary as string | undefined) ??
    '';

  const text = GENERIC_COMPLETIONS.has(rawText.trim().toLowerCase()) ? '' : rawText;

  const toolCount =
    typeof data.tool_call_count === 'number'
      ? data.tool_call_count
      : typeof data.total_tool_calls === 'number'
        ? data.total_tool_calls
        : 0;
  const totalSteps = typeof data.total_steps === 'number' ? data.total_steps : 0;
  const durationMs = typeof data.duration_ms === 'number' ? data.duration_ms : 0;
  let duration = '';
  if (durationMs > 0) {
    if (durationMs < 1000) duration = `${durationMs}ms`;
    else if (durationMs < 60000) duration = `${(durationMs / 1000).toFixed(1)}s`;
    else {
      const m = Math.floor(durationMs / 60000);
      const s = Math.round((durationMs % 60000) / 1000);
      duration = `${m}m ${s}s`;
    }
  }
  return { text, toolCount, totalSteps, duration };
}

export function FinalReportCard({ event }: EventCardProps): React.ReactElement | null {
  const { text, toolCount, totalSteps, duration } = extractReport(event);

  const metaParts: string[] = [];
  if (duration) metaParts.push(duration);
  if (totalSteps > 0) metaParts.push(`${totalSteps} step${totalSteps !== 1 ? 's' : ''}`);
  if (toolCount > 0) metaParts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`);
  const meta = metaParts.join(' · ');

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm text-emerald-600 dark:text-emerald-400">✓</span>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Done
        </span>
        {meta && (
          <span className="text-[11px] text-emerald-600/60 dark:text-emerald-400/60">
            {meta}
          </span>
        )}
      </div>
      {text.trim() && (
        <div className="border-t border-emerald-500/20 px-3 pb-3 pt-2">
          <div className="text-sm leading-relaxed">
            <Markdown>{text}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
