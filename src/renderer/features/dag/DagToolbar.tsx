import { useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';
import { Button } from '../../ui/button.js';
import { cn, truncate } from '../../lib/utils.js';
import type { JobStatusIpcResponse } from '@shared/ipc';

const statusBadgeColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  running: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

interface DagToolbarProps {
  jobStatus: JobStatusIpcResponse | null;
  onRefresh: () => Promise<void>;
}

export function DagToolbar({ jobStatus, onRefresh }: DagToolbarProps): React.ReactElement {
  const jobs = useStore(s => s.jobs);
  const activeJobId = useStore(s => s.activeJobId);
  const updateJob = useStore(s => s.updateJob);
  const setActiveJobId = useStore(s => s.setActiveJobId);
  const [busy, setBusy] = useState(false);

  const job = jobs.find(j => j.id === activeJobId);
  const status = jobStatus?.status ?? job?.status ?? 'unknown';
  const badgeColor = statusBadgeColors[status] ?? 'bg-muted text-muted-foreground';
  const isRunning = status === 'active' || status === 'running' || status === 'pending';
  const isPaused = status === 'suspended';

  const handlePause = async (): Promise<void> => {
    if (!activeJobId) return;
    setBusy(true);
    try {
      const resp = await soothe().jobPause({ jobId: activeJobId });
      if (!resp.error) updateJob(activeJobId, { status: resp.status });
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async (): Promise<void> => {
    if (!activeJobId) return;
    setBusy(true);
    try {
      const resp = await soothe().jobResume({ jobId: activeJobId });
      if (!resp.error) updateJob(activeJobId, { status: resp.status });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (): Promise<void> => {
    if (!activeJobId) return;
    if (!confirm('Cancel this job?')) return;
    setBusy(true);
    try {
      const resp = await soothe().jobCancel({ jobId: activeJobId });
      if (!resp.error) updateJob(activeJobId, { status: resp.status });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card/60 px-4 py-2">
      <button
        type="button"
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setActiveJobId(undefined)}
        title="Back to tabs"
      >
        &larr;
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {job ? truncate(job.goal, 80) : activeJobId?.slice(0, 12)}
        </div>
      </div>
      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', badgeColor)}>
        {status}
      </span>
      {jobStatus && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {jobStatus.completed_goals}/{jobStatus.total_goals} goals
        </span>
      )}
      <div className="flex items-center gap-1">
        {isRunning && (
          <Button size="sm" variant="outline" onClick={handlePause} disabled={busy}>
            Pause
          </Button>
        )}
        {isPaused && (
          <Button size="sm" variant="outline" onClick={handleResume} disabled={busy}>
            Resume
          </Button>
        )}
        {(isRunning || isPaused) && (
          <Button size="sm" variant="outline" onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
          ↻
        </Button>
      </div>
    </div>
  );
}
