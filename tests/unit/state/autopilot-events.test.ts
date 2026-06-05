import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '@renderer/state/store';
import type { AutopilotEventEnvelope, JobSummary } from '@shared/ipc';

function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    goal: 'Test goal',
    status: 'running',
    active_goals: 1,
    completed_goals: 0,
    failed_goals: 0,
    total_goals: 3,
    created_at: Date.now(),
    ...overrides,
  };
}

/**
 * Mirror the handleAutopilotEvent logic from App.tsx so we can test the
 * store mutations it triggers without mounting the full React tree.
 */
function processAutopilotEvent(envelope: AutopilotEventEnvelope): void {
  const state = useStore.getState();
  const event = envelope.event as Record<string, unknown> & { type?: string };
  const eventType = typeof event.type === 'string' ? event.type : '';

  if (eventType === 'event') {
    const ns = event.namespace as string | undefined;
    const data = event.data as Record<string, unknown> | undefined;
    if (!ns || !data) return;

    if (ns === 'soothe.autopilot.goal.status') {
      const jobId = (data.job_id ?? data.goal_id) as string | undefined;
      if (jobId) {
        const newStatus = data.status as string | undefined;
        if (newStatus) state.updateJob(jobId, { status: newStatus });
      }
    } else if (ns === 'soothe.autopilot.goal.progress') {
      const jobId = (data.job_id ?? data.root_id) as string | undefined;
      if (jobId) {
        const patch: Record<string, unknown> = {};
        if (typeof data.completed_goals === 'number') patch.completed_goals = data.completed_goals;
        if (typeof data.total_goals === 'number') patch.total_goals = data.total_goals;
        if (typeof data.active_goals === 'number') patch.active_goals = data.active_goals;
        if (typeof data.failed_goals === 'number') patch.failed_goals = data.failed_goals;
        if (Object.keys(patch).length > 0) {
          state.updateJob(jobId, patch as Partial<JobSummary>);
        }
      }
    }
  }
}

beforeEach(() => {
  useStore.getState().setJobs([]);
});

describe('autopilot event processing', () => {
  describe('goal.status events', () => {
    it('updates job status from goal.status event', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.status',
          data: { job_id: 'job-1', status: 'completed' },
        },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('completed');
    });

    it('handles goal_id as fallback identifier', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-2', status: 'pending' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.status',
          data: { goal_id: 'job-2', status: 'running' },
        },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });

    it('ignores events without a job identifier', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.status',
          data: { status: 'failed' },
        },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });

    it('ignores events without a status field', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.status',
          data: { job_id: 'job-1' },
        },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });
  });

  describe('goal.progress events', () => {
    it('updates progress counters', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.progress',
          data: {
            job_id: 'job-1',
            completed_goals: 2,
            total_goals: 5,
            active_goals: 3,
            failed_goals: 0,
          },
        },
      });
      const job = useStore.getState().jobs[0]!;
      expect(job.completed_goals).toBe(2);
      expect(job.total_goals).toBe(5);
      expect(job.active_goals).toBe(3);
      expect(job.failed_goals).toBe(0);
    });

    it('handles root_id as fallback identifier', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.progress',
          data: { root_id: 'job-1', completed_goals: 1 },
        },
      });
      expect(useStore.getState().jobs[0]!.completed_goals).toBe(1);
    });

    it('only patches numeric fields that are present', () => {
      useStore.getState().setJobs([
        makeJob({ id: 'job-1', active_goals: 5, completed_goals: 2 }),
      ]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.progress',
          data: { job_id: 'job-1', completed_goals: 3 },
        },
      });
      const job = useStore.getState().jobs[0]!;
      expect(job.completed_goals).toBe(3);
      expect(job.active_goals).toBe(5); // unchanged
    });

    it('ignores events with no numeric fields', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', completed_goals: 2 })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.autopilot.goal.progress',
          data: { job_id: 'job-1', some_other: 'field' },
        },
      });
      expect(useStore.getState().jobs[0]!.completed_goals).toBe(2);
    });
  });

  describe('non-event envelopes', () => {
    it('ignores non-event type messages', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({
        event: { type: 'status', data: { job_id: 'job-1', status: 'failed' } },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });

    it('ignores events with unknown namespace', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({
        event: {
          type: 'event',
          namespace: 'soothe.internal.something',
          data: { job_id: 'job-1', status: 'failed' },
        },
      });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });

    it('ignores events without namespace or data', () => {
      useStore.getState().setJobs([makeJob({ id: 'job-1', status: 'running' })]);
      processAutopilotEvent({ event: { type: 'event' } });
      processAutopilotEvent({ event: { type: 'event', namespace: 'soothe.autopilot.goal.status' } });
      expect(useStore.getState().jobs[0]!.status).toBe('running');
    });
  });
});
