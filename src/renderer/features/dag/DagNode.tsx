import { Handle, Position } from '@xyflow/react';
import { cn } from '../../lib/utils.js';
import type { DagNodeData } from './useDagData.js';

const statusBorderColors: Record<string, string> = {
  pending: 'border-yellow-400',
  active: 'border-emerald-400',
  running: 'border-emerald-400',
  completed: 'border-blue-400',
  failed: 'border-red-400',
  cancelled: 'border-gray-400',
  suspended: 'border-yellow-400',
  blocked: 'border-orange-400',
};

const statusBadgeColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  running: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  blocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

interface DagNodeProps {
  data: DagNodeData;
}

export function DagNodeComponent({ data }: DagNodeProps): React.ReactElement {
  const borderColor = statusBorderColors[data.status] ?? 'border-muted';
  const badgeColor = statusBadgeColors[data.status] ?? 'bg-muted text-muted-foreground';
  const progress = data.stepsTotal > 0 ? data.stepsCompleted / data.stepsTotal : 0;

  return (
    <div
      className={cn(
        'min-w-[200px] rounded-lg border-2 bg-card p-3 shadow-sm',
        borderColor,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="mb-2 truncate text-sm font-medium">{data.label}</div>
      <div className="flex items-center gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', badgeColor)}>
          {data.status}
        </span>
        {data.stepsTotal > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {data.stepsCompleted}/{data.stepsTotal}
          </span>
        )}
        {data.toolCalls > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {data.toolCalls} tools
          </span>
        )}
      </div>
      {data.stepsTotal > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {data.assignedLoopId && (
        <div className="mt-1 text-[9px] text-muted-foreground">
          worker: {data.assignedLoopId.slice(0, 12)}...
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}
