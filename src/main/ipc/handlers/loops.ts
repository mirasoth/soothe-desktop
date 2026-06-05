import { ipcMain } from 'electron';
import { Client } from '@mirasoth/soothe-client';
import {
  Channels,
  type LoopMessageRow,
  type LoopSummary,
  type LoopsDeleteRequest,
  type LoopsDeleteResponse,
  type LoopsListResponse,
  type LoopsMessagesRequest,
  type LoopsMessagesResponse,
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
  timestamp?: string | number;
}

function previewText(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
}

interface PreviewResult {
  /** First user message — used by tab opener as the chat's stable title. */
  title?: string;
  /** Most recent conversational message (any role), prefixed You:/AI:. */
  latestPreview?: string;
  /** True iff at least one user-role message was found. */
  hasUserMessage: boolean;
  /** Timestamp of the last message (ISO string from daemon), if available. */
  lastMessageAt?: string;
}

function extractPreviews(messages: unknown): PreviewResult {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { hasUserMessage: false };
  }
  let firstUser: string | undefined;
  let hasUser = false;
  let latest: { role: string; text: string } | undefined;
  let lastTs: string | undefined;
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as ThreadMessageLike;
    const role = m.role ?? '';
    const text = typeof m.content === 'string' ? m.content.trim() : '';
    if (role === 'user') hasUser = true;
    if (role === 'user' && text && !firstUser) firstUser = text;
    if ((role === 'user' || role === 'assistant') && text) {
      latest = { role, text };
    }
    if (typeof m.timestamp === 'string') lastTs = m.timestamp;
    else if (typeof m.timestamp === 'number') lastTs = new Date(m.timestamp * 1000).toISOString();
  }
  const latestPreview = latest
    ? `${latest.role === 'user' ? 'You' : 'AI'}: ${previewText(latest.text)}`
    : undefined;
  return {
    title: firstUser,
    latestPreview,
    hasUserMessage: hasUser,
    lastMessageAt: lastTs,
  };
}

const ENRICH_CONCURRENCY = 1;
const ENRICH_TIMEOUT_MS = 15_000;

interface CachedEntry {
  title?: string;
  latestPreview?: string;
  hasUserMessage: boolean;
  lastMessageAt?: string;
  cacheKey: string;
}

const enrichmentCache = new Map<string, CachedEntry>();

function loopCacheKey(loop: LoopSummary): string {
  return `${loop.threads ?? 0}|${loop.last_message_at ?? ''}`;
}

async function enrichOne(client: Client, loop: LoopSummary): Promise<LoopSummary> {
  // The daemon's loop_list response includes human_messages count and threads.
  // A loop with threads > 0 had interaction — always show it.
  // A loop with human_messages > 0 has confirmed user messages.
  const humanCount = (loop as Record<string, unknown>).human_messages;
  const hasHumanFromDaemon = typeof humanCount === 'number' && humanCount > 0;
  const threads = typeof loop.threads === 'number' ? loop.threads : 0;

  if (threads === 0) {
    return { ...loop, hasUserMessage: hasHumanFromDaemon };
  }

  // threads > 0 means user interacted — always mark as having messages.
  // Fetch recent messages for title/preview enrichment only.
  try {
    const resp = (await client.requestResponse(
      { type: 'loop_messages', loop_id: loop.loop_id, limit: 20 },
      'loop_messages_response',
      ENRICH_TIMEOUT_MS,
    )) as { messages?: unknown };
    const { title, latestPreview, lastMessageAt } = extractPreviews(resp?.messages);
    return {
      ...loop,
      title,
      latestPreview,
      hasUserMessage: true,
      ...(lastMessageAt ? { last_message_at: lastMessageAt } : {}),
    };
  } catch {
    return { ...loop, hasUserMessage: true };
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

        const stale: LoopSummary[] = [];
        const result: LoopSummary[] = [];
        const staleIndices: number[] = [];
        const currentIds = new Set<string>();

        for (const loop of raw) {
          currentIds.add(loop.loop_id);
          const key = loopCacheKey(loop);
          const cached = enrichmentCache.get(loop.loop_id);
          if (cached && cached.cacheKey === key) {
            result.push({
              ...loop,
              title: cached.title,
              latestPreview: cached.latestPreview,
              hasUserMessage: cached.hasUserMessage,
              ...(cached.lastMessageAt ? { last_message_at: cached.lastMessageAt } : {}),
            });
          } else {
            staleIndices.push(result.length);
            result.push(loop);
            stale.push(loop);
          }
        }

        if (stale.length > 0) {
          const enriched = await enrichLoops(client, stale);
          for (let i = 0; i < enriched.length; i++) {
            const e = enriched[i]!;
            result[staleIndices[i]!] = e;
            enrichmentCache.set(e.loop_id, {
              title: e.title,
              latestPreview: e.latestPreview,
              hasUserMessage: e.hasUserMessage ?? false,
              lastMessageAt: e.last_message_at,
              cacheKey: loopCacheKey(e),
            });
          }
        }

        for (const id of enrichmentCache.keys()) {
          if (!currentIds.has(id)) enrichmentCache.delete(id);
        }

        return result;
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
        enrichmentCache.delete(req.loopId);
        return { loopId: req.loopId, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { loopId: req.loopId, success: false, error: message };
      }
    },
  );

  ipcMain.handle(
    Channels.LoopsMessages,
    async (_evt, req: LoopsMessagesRequest): Promise<LoopsMessagesResponse> => {
      try {
        const limit = req.limit ?? 200;
        const messages = await withEphemeralClient(async client => {
          const resp = (await client.requestResponse(
            { type: 'loop_messages', loop_id: req.loopId, limit },
            'loop_messages_response',
            ENRICH_TIMEOUT_MS,
          )) as { messages?: unknown };
          if (!Array.isArray(resp?.messages)) return [] as LoopMessageRow[];
          return resp.messages as LoopMessageRow[];
        });
        return { loopId: req.loopId, messages };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { loopId: req.loopId, messages: [], error: message };
      }
    },
  );
}
