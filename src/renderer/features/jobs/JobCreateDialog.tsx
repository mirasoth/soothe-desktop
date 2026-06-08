import { useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog.js';
import { Button } from '../../ui/button.js';

export function JobCreateDialog(): React.ReactElement | null {
  const open = useStore(s => s.jobCreateOpen);
  const setOpen = useStore(s => s.setJobCreateOpen);
  const addJob = useStore(s => s.addJob);
  const project = useStore(s => s.project);
  const autopilotSubscribed = useStore(s => s.autopilotSubscribed);
  const setAutopilotSubscribed = useStore(s => s.setAutopilotSubscribed);

  const [goal, setGoal] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [verificationRules, setVerificationRules] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleCreate = async (): Promise<void> => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(undefined);
    try {
      if (!autopilotSubscribed) {
        const subResp = await soothe().autopilotSubscribe();
        if (subResp.subscribed) setAutopilotSubscribed(true);
      }
      const resp = await soothe().jobCreate({
        goal: trimmed,
        verificationRules: verificationRules.trim() || undefined,
        workspace: project.path ?? undefined,
      });
      if (resp.error) {
        setError(resp.error);
        return;
      }
      addJob({
        id: resp.job_id,
        goal: trimmed,
        status: resp.status,
        active_goals: 0,
        completed_goals: 0,
        failed_goals: 0,
        total_goals: 0,
        created_at: Date.now(),
        workspace: project.path ?? undefined,
      });
      setGoal('');
      setVerificationRules('');
      setShowVerification(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setOpen(false);
    setError(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogHeader>
        <DialogTitle>Create Autopilot Job</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Describe what the autopilot should accomplish..."
          value={goal}
          onChange={e => setGoal(e.target.value)}
          rows={5}
          autoFocus
        />

        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowVerification(v => !v)}
          >
            {showVerification ? '- Hide' : '+ Add'} verification rules
          </button>
          {showVerification && (
            <textarea
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Optional verification criteria..."
              value={verificationRules}
              onChange={e => setVerificationRules(e.target.value)}
              rows={3}
            />
          )}
        </div>

        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={submitting || !goal.trim()}>
          {submitting ? 'Creating...' : 'Create'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
