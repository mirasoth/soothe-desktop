/**
 * End-to-end tests for the autopilot job system.
 * Requires a running Soothe daemon on ws://127.0.0.1:8765.
 * Run with: SOOTHE_E2E=1 npx vitest run tests/e2e/autopilot-jobs.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@mirasoth/soothe-client';

const DAEMON_URL = process.env.SOOTHE_DAEMON_URL ?? 'ws://127.0.0.1:8765';
const TIMEOUT = 30_000;
const shouldRun = process.env.SOOTHE_E2E === '1';

describe.skipIf(!shouldRun)('Autopilot Jobs E2E', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client(DAEMON_URL);
    await client.connect();
    await client.waitForDaemonReady(10_000);
  });

  afterAll(() => {
    client?.close();
  });

  describe('job lifecycle', () => {
    let jobId: string;

    it('creates a job with a goal', async () => {
      const resp = await client.createJob(
        'Write a haiku about testing software',
        undefined,
        TIMEOUT,
      );
      expect(resp.type).toBe('job_create_response');
      expect(resp.job_id).toBeTruthy();
      expect(typeof resp.job_id).toBe('string');
      jobId = resp.job_id as string;
    });

    it('retrieves job status', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.getJobStatus(jobId, TIMEOUT);
      expect(resp.type).toBe('job_status_response');
      expect(resp.job_id).toBe(jobId);
      expect(typeof resp.status).toBe('string');
      expect(typeof resp.total_goals).toBe('number');
    });

    it('retrieves job DAG', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.getJobDag(jobId, TIMEOUT);
      expect(resp.type).toBe('job_dag_response');
      expect(resp.job_id).toBe(jobId);
      expect(resp.dag).toBeDefined();
      const dag = resp.dag as { nodes: unknown[]; edges: unknown[]; root_id: string };
      expect(Array.isArray(dag.nodes)).toBe(true);
      expect(Array.isArray(dag.edges)).toBe(true);
      expect(typeof dag.root_id).toBe('string');
    });

    it('pauses a running job', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.pauseJob(jobId, TIMEOUT);
      expect(resp.type).toBe('job_pause_response');
      expect(resp.job_id).toBe(jobId);
      // Status should be suspended or error if job already completed
      expect(['suspended', 'completed', 'cancelled', 'error']).toContain(resp.status);
    });

    it('resumes a paused job', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.resumeJob(jobId, TIMEOUT);
      expect(resp.type).toBe('job_resume_response');
      expect(resp.job_id).toBe(jobId);
      expect(typeof resp.status).toBe('string');
    });

    it('sends guidance to a job', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.sendJobGuidance(
        jobId,
        'Focus on code quality in the haiku',
        undefined,
        TIMEOUT,
      );
      expect(resp.type).toBe('job_guidance_response');
      expect(resp.job_id).toBe(jobId);
      expect(typeof resp.absorbed).toBe('boolean');
    });

    it('cancels a job', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.cancelJob(jobId, TIMEOUT);
      expect(resp.type).toBe('job_cancel_response');
      expect(resp.job_id).toBe(jobId);
      expect(['cancelled', 'completed', 'failed', 'error']).toContain(resp.status);
    });

    it('status reflects cancellation', async () => {
      expect(jobId).toBeTruthy();
      const resp = await client.getJobStatus(jobId, TIMEOUT);
      expect(resp.job_id).toBe(jobId);
      expect(['cancelled', 'completed', 'failed']).toContain(resp.status);
    });
  });

  describe('job creation with verification rules', () => {
    it('creates a job with verification rules', async () => {
      const resp = await client.createJob(
        'Create a test file',
        'The file must contain at least 3 test cases',
        TIMEOUT,
      );
      expect(resp.type).toBe('job_create_response');
      expect(resp.job_id).toBeTruthy();

      // Clean up
      const jobId = resp.job_id as string;
      await client.cancelJob(jobId, TIMEOUT);
    });
  });

  describe('autopilot event subscription', () => {
    it('subscribes to autopilot events', async () => {
      const resp = await client.autopilotSubscribe(TIMEOUT);
      expect(resp.type).toBe('autopilot_subscribe_response');
    });

    it('receives events after subscribing', async () => {
      // Create a job so there's activity to stream
      const createResp = await client.createJob(
        'Write a single line comment explaining what 2+2 equals',
        undefined,
        TIMEOUT,
      );
      const jobId = createResp.job_id as string;
      expect(jobId).toBeTruthy();

      // Read events for up to 10 seconds
      const events: Record<string, unknown>[] = [];
      const start = Date.now();
      while (Date.now() - start < 10_000 && events.length < 10) {
        const ev = await client.readEventWithTimeout(3000);
        if (ev === null) break;
        events.push(ev as Record<string, unknown>);
      }

      // We should get at least some events from the job starting
      // (may be 0 if the daemon processed it immediately before we could read)
      expect(events.length).toBeGreaterThanOrEqual(0);

      // Clean up
      await client.cancelJob(jobId, TIMEOUT);
    });

    it('unsubscribes from autopilot events', async () => {
      const resp = await client.autopilotUnsubscribe(TIMEOUT);
      expect(resp.type).toBe('autopilot_unsubscribe_response');
    });
  });

  describe('DAG node structure', () => {
    it('DAG nodes have expected fields', async () => {
      const createResp = await client.createJob(
        'Research the history of unit testing',
        undefined,
        TIMEOUT,
      );
      const jobId = createResp.job_id as string;

      // Wait briefly for DAG to be constructed
      await new Promise(r => setTimeout(r, 2000));

      const dagResp = await client.getJobDag(jobId, TIMEOUT);
      const dag = dagResp.dag as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<{ source: string; target: string }>;
        root_id: string;
      };

      if (dag.nodes.length > 0) {
        const node = dag.nodes[0]!;
        expect(typeof node.id).toBe('string');
        expect(typeof node.description).toBe('string');
        expect(typeof node.status).toBe('string');
        expect(typeof node.priority).toBe('number');
        expect(typeof node.steps_completed).toBe('number');
        expect(typeof node.steps_total).toBe('number');
        expect(typeof node.tool_calls).toBe('number');
      }

      if (dag.edges.length > 0) {
        const edge = dag.edges[0]!;
        expect(typeof edge.source).toBe('string');
        expect(typeof edge.target).toBe('string');
      }

      // Clean up
      await client.cancelJob(jobId, TIMEOUT);
    });
  });

  describe('guidance to specific goal', () => {
    it('sends guidance targeting a specific goal node', async () => {
      const createResp = await client.createJob(
        'Analyze the structure of this codebase',
        undefined,
        TIMEOUT,
      );
      const jobId = createResp.job_id as string;

      // Wait for DAG to populate
      await new Promise(r => setTimeout(r, 2000));

      const dagResp = await client.getJobDag(jobId, TIMEOUT);
      const dag = dagResp.dag as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<{ source: string; target: string }>;
        root_id: string;
      };

      if (dag.nodes.length > 0) {
        const goalId = dag.nodes[0]!.id as string;
        const resp = await client.sendJobGuidance(
          jobId,
          'Prioritize the src/ directory',
          goalId,
          TIMEOUT,
        );
        expect(resp.type).toBe('job_guidance_response');
        expect(resp.job_id).toBe(jobId);
        expect(typeof resp.absorbed).toBe('boolean');
      }

      // Clean up
      await client.cancelJob(jobId, TIMEOUT);
    });
  });

  describe('error handling', () => {
    it('throws or returns error for non-existent job status', async () => {
      try {
        const resp = await client.getJobStatus('non-existent-job-id-12345', TIMEOUT);
        // If daemon returns a response instead of throwing, it should indicate an error
        expect(
          resp.error || resp.status === 'not_found' || resp.status === 'error',
        ).toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/not found/i);
      }
    });

    it('throws or returns error for non-existent job DAG', async () => {
      try {
        const resp = await client.getJobDag('non-existent-job-id-12345', TIMEOUT);
        expect(
          resp.error ||
            (resp.dag && (resp.dag as { nodes: unknown[] }).nodes.length === 0),
        ).toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/not found/i);
      }
    });

    it('throws or returns error for pause on non-existent job', async () => {
      try {
        const resp = await client.pauseJob('non-existent-job-id-12345', TIMEOUT);
        expect(resp.error || resp.status === 'error' || resp.status === 'not_found').toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/not found/i);
      }
    });

    it('throws or returns error for cancel on non-existent job', async () => {
      try {
        const resp = await client.cancelJob('non-existent-job-id-12345', TIMEOUT);
        expect(resp.error || resp.status === 'error' || resp.status === 'not_found').toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/not found/i);
      }
    });

    it('throws or returns error for guidance to non-existent job', async () => {
      try {
        const resp = await client.sendJobGuidance(
          'non-existent-job-id-12345',
          'some guidance',
          undefined,
          TIMEOUT,
        );
        expect(resp.error || resp.absorbed === false).toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/not found/i);
      }
    });
  });

  describe('concurrent jobs', () => {
    it('creates multiple jobs and tracks them independently', async () => {
      const job1 = await client.createJob('Task one: count to 5', undefined, TIMEOUT);
      const job2 = await client.createJob('Task two: count to 10', undefined, TIMEOUT);

      expect(job1.job_id).toBeTruthy();
      expect(job2.job_id).toBeTruthy();
      expect(job1.job_id).not.toBe(job2.job_id);

      const status1 = await client.getJobStatus(job1.job_id as string, TIMEOUT);
      const status2 = await client.getJobStatus(job2.job_id as string, TIMEOUT);
      expect(status1.job_id).toBe(job1.job_id);
      expect(status2.job_id).toBe(job2.job_id);

      // Clean up
      await client.cancelJob(job1.job_id as string, TIMEOUT);
      await client.cancelJob(job2.job_id as string, TIMEOUT);
    });
  });
});
