import { ipcMain } from 'electron';
import { Client } from '@mirasoth/soothe-client';
import {
  Channels,
  type LoopSummary,
  type LoopsDeleteRequest,
  type LoopsDeleteResponse,
  type LoopsListResponse,
} from '@shared/ipc';
import { getSettings } from '../../daemon/settings.js';

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

interface ThreadMessageLike {
  role?: 'user' | 'assistant' | 'system' | null;
  kind?: string;
  content?: string;
}

function extractFirstUserPreview(messages: unknown): { title?: string; hasUserMessage: boolean } {
  if (!Array.isArray(messages)) return { hasUserMessage: false };
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as ThreadMessageLike;
    if (m.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content.trim() : '';
    if (!text) continue;
    return { title: text, hasUserMessage: true };
  }
  return { hasUserMessage: false };
}

const ENRICH_CONCURRENCY = 4;
const ENRICH_TIMEOUT_MS = 15_000;

async function enrichOne(client: Client, loop: LoopSummary): Promise<LoopSummary> {
  try {
    const resp = (await client.requestResponse(
      { type: 'loop_messages', loop_id: loop.loop_id, limit: 20 },
      'loop_messages_response',
      ENRICH_TIMEOUT_MS,
    )) as { messages?: unknown };
    const { title, hasUserMessage } = extractFirstUserPreview(resp?.messages);
    return { ...loop, title, hasUserMessage };
  } catch {
    // Timeout / error — surface as "unknown" (undefined) so the sidebar shows
    // the loop rather than hiding it.
    return { ...loop };
  }
}

async function enrichLoops(client: Client, loops: LoopSummary[]): Promise<LoopSummary[]> {
  const out: LoopSummary[] = new Array(loops.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, loops.length) }, async () => {
    while (true) {
      const cursor = idx++;
      if (cursor >= loops.length) return;
      out[cursor] = await enrichOne(client, loops[cursor]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export function registerLoopsHandlers(): void {
  ipcMain.handle(Channels.LoopsList, async (): Promise<LoopsListResponse> => {
    try {
      const loops = await withEphemeralClient(async client => {
        const resp = await client.listLoops(15_000);
        const raw = (resp.loops as LoopSummary[] | undefined) ?? [];
        return enrichLoops(client, raw);
      });
      return { loops };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { loops: [], error: message };
    }
  });

  ipcMain.handle(
    Channels.LoopsDelete,
    async (_evt, req: LoopsDeleteRequest): Promise<LoopsDeleteResponse> => {
      try {
        await withEphemeralClient(client => client.deleteLoop(req.loopId, 10_000));
        return { loopId: req.loopId, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { loopId: req.loopId, success: false, error: message };
      }
    },
  );
}
