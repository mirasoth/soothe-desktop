import { ipcMain } from 'electron';
import { Client } from '@mirasoth/soothe-client';
import {
  Channels,
  type JobCreateRequest,
  type JobCreateIpcResponse,
  type JobIdRequest,
  type JobStatusIpcResponse,
  type JobActionIpcResponse,
  type JobDagIpcResponse,
  type JobGuidanceRequest,
  type JobGuidanceIpcResponse,
  type AutopilotSubscribeIpcResponse,
} from '@shared/ipc';
import { getSettings } from '../../daemon/settings.js';
import { wsManager } from '../../daemon/manager.js';

async function withEphemeralClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(getSettings().daemonUrl);
  try {
    await client.connect();
    await client.waitForDaemonReady(5_000);
    return await fn(client);
  } finally {
    client.close();
  }
}

export function registerJobsHandlers(): void {
  ipcMain.handle(
    Channels.JobsCreate,
    async (_evt, req: JobCreateRequest): Promise<JobCreateIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client =>
          client.createJob(req.goal, req.verificationRules, 15_000),
        );
        return {
          job_id: resp.job_id as string,
          status: resp.status as string,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { job_id: '', status: 'error', error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.JobsStatus,
    async (_evt, req: JobIdRequest): Promise<JobStatusIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client =>
          client.getJobStatus(req.jobId, 15_000),
        );
        return {
          job_id: resp.job_id as string,
          status: resp.status as string,
          active_goals: (resp.active_goals as number) ?? 0,
          completed_goals: (resp.completed_goals as number) ?? 0,
          failed_goals: (resp.failed_goals as number) ?? 0,
          total_goals: (resp.total_goals as number) ?? 0,
          workers: (resp.workers as Array<{ goal_id: string; loop_id: string }>) ?? [],
          last_error: resp.last_error as string | undefined,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          job_id: req.jobId,
          status: 'error',
          active_goals: 0,
          completed_goals: 0,
          failed_goals: 0,
          total_goals: 0,
          workers: [],
          error: message,
        };
      }
    },
  );

  ipcMain.handle(
    Channels.JobsPause,
    async (_evt, req: JobIdRequest): Promise<JobActionIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client => client.pauseJob(req.jobId, 15_000));
        return { job_id: resp.job_id as string, status: resp.status as string };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { job_id: req.jobId, status: 'error', error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.JobsResume,
    async (_evt, req: JobIdRequest): Promise<JobActionIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client => client.resumeJob(req.jobId, 15_000));
        return { job_id: resp.job_id as string, status: resp.status as string };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { job_id: req.jobId, status: 'error', error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.JobsCancel,
    async (_evt, req: JobIdRequest): Promise<JobActionIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client => client.cancelJob(req.jobId, 15_000));
        return { job_id: resp.job_id as string, status: resp.status as string };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { job_id: req.jobId, status: 'error', error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.JobsDag,
    async (_evt, req: JobIdRequest): Promise<JobDagIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client => client.getJobDag(req.jobId, 15_000));
        return {
          job_id: resp.job_id as string,
          dag: resp.dag as JobDagIpcResponse['dag'],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          job_id: req.jobId,
          dag: { nodes: [], edges: [], root_id: '' },
          error: message,
        };
      }
    },
  );

  ipcMain.handle(
    Channels.JobGuidance,
    async (_evt, req: JobGuidanceRequest): Promise<JobGuidanceIpcResponse> => {
      try {
        const resp = await withEphemeralClient(client =>
          client.sendJobGuidance(req.jobId, req.text, req.goalId, 30_000),
        );
        return {
          job_id: resp.job_id as string,
          goal_id: resp.goal_id as string | undefined,
          absorbed: (resp.absorbed as boolean) ?? false,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { job_id: req.jobId, absorbed: false, error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.AutopilotSubscribe,
    async (): Promise<AutopilotSubscribeIpcResponse> => {
      try {
        await wsManager.autopilotSubscribe();
        return { subscribed: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { subscribed: false, error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.AutopilotUnsubscribe,
    async (): Promise<AutopilotSubscribeIpcResponse> => {
      try {
        await wsManager.autopilotUnsubscribe();
        return { subscribed: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { subscribed: true, error: message };
      }
    },
  );
}
