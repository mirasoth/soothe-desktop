import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '@renderer/state/store';
import type { JobSummary } from '@shared/ipc';

function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    goal: 'Refactor the API layer',
    status: 'pending',
    active_goals: 0,
    completed_goals: 0,
    failed_goals: 0,
    total_goals: 1,
    created_at: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  const s = useStore.getState();
  s.setJobs([]);
  s.setJobsError(undefined);
  s.setJobsLoading(false);
  s.setActiveJobId(undefined);
  s.setAutopilotSubscribed(false);
  s.setJobCreateOpen(false);
});

describe('jobs store slice', () => {
  it('setJobs replaces the jobs array', () => {
    const jobs = [makeJob({ id: 'j1' }), makeJob({ id: 'j2' })];
    useStore.getState().setJobs(jobs);
    expect(useStore.getState().jobs).toHaveLength(2);
    expect(useStore.getState().jobs[0]!.id).toBe('j1');
  });

  it('setJobs clears previous error', () => {
    useStore.getState().setJobsError('some error');
    useStore.getState().setJobs([]);
    expect(useStore.getState().jobsError).toBeUndefined();
  });

  it('addJob prepends to jobs array', () => {
    useStore.getState().setJobs([makeJob({ id: 'existing' })]);
    useStore.getState().addJob(makeJob({ id: 'new' }));
    const { jobs } = useStore.getState();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).toBe('new');
    expect(jobs[1]!.id).toBe('existing');
  });

  it('removeJob deletes from array and clears activeJobId if matching', () => {
    useStore.getState().setJobs([makeJob({ id: 'j1' }), makeJob({ id: 'j2' })]);
    useStore.getState().setActiveJobId('j1');
    useStore.getState().removeJob('j1');
    const state = useStore.getState();
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]!.id).toBe('j2');
    expect(state.activeJobId).toBeUndefined();
  });

  it('removeJob preserves activeJobId when non-matching', () => {
    useStore.getState().setJobs([makeJob({ id: 'j1' }), makeJob({ id: 'j2' })]);
    useStore.getState().setActiveJobId('j2');
    useStore.getState().removeJob('j1');
    expect(useStore.getState().activeJobId).toBe('j2');
  });

  it('updateJob patches fields of matching job', () => {
    useStore.getState().setJobs([makeJob({ id: 'j1', status: 'pending' })]);
    useStore.getState().updateJob('j1', { status: 'running', active_goals: 2 });
    const job = useStore.getState().jobs[0]!;
    expect(job.status).toBe('running');
    expect(job.active_goals).toBe(2);
    expect(job.goal).toBe('Refactor the API layer');
  });

  it('updateJob is a no-op for unknown job id', () => {
    useStore.getState().setJobs([makeJob({ id: 'j1' })]);
    useStore.getState().updateJob('unknown', { status: 'failed' });
    expect(useStore.getState().jobs[0]!.status).toBe('pending');
  });

  it('setActiveJobId sets the active job', () => {
    useStore.getState().setActiveJobId('j1');
    expect(useStore.getState().activeJobId).toBe('j1');
  });

  it('setAutopilotSubscribed toggles subscription state', () => {
    useStore.getState().setAutopilotSubscribed(true);
    expect(useStore.getState().autopilotSubscribed).toBe(true);
    useStore.getState().setAutopilotSubscribed(false);
    expect(useStore.getState().autopilotSubscribed).toBe(false);
  });

  it('setJobCreateOpen toggles dialog state', () => {
    useStore.getState().setJobCreateOpen(true);
    expect(useStore.getState().jobCreateOpen).toBe(true);
  });

  it('setJobsLoading/setJobsError track loading state', () => {
    useStore.getState().setJobsLoading(true);
    expect(useStore.getState().jobsLoading).toBe(true);
    useStore.getState().setJobsError('failed');
    expect(useStore.getState().jobsError).toBe('failed');
  });
});

describe('jobs + loops interaction', () => {
  it('patchLoop updates loop status when agent starts', () => {
    useStore.getState().setLoops([
      { loop_id: 'loop-1', status: 'idle', hasUserMessage: true },
    ]);
    useStore.getState().patchLoop('loop-1', { status: 'running' });
    expect(useStore.getState().loops[0]!.status).toBe('running');
  });

  it('patchLoop is a no-op for unknown loop id', () => {
    useStore.getState().setLoops([{ loop_id: 'loop-1', status: 'idle' }]);
    useStore.getState().patchLoop('unknown', { status: 'running' });
    expect(useStore.getState().loops[0]!.status).toBe('idle');
  });

  it('bumpLoopsRefreshHint increments counter', () => {
    const before = useStore.getState().loopsRefreshHint;
    useStore.getState().bumpLoopsRefreshHint();
    expect(useStore.getState().loopsRefreshHint).toBe(before + 1);
  });
});
