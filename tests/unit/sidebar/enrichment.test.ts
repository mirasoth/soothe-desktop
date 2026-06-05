import { describe, expect, it } from 'vitest';
import type { LoopSummary } from '@shared/ipc';

/**
 * Mirror the enrichOne decision logic from main/ipc/handlers/loops.ts.
 * Tests that loops are correctly classified for sidebar visibility.
 */
function enrichmentDecision(loop: LoopSummary & { human_messages?: number }): {
  hasUserMessage: boolean;
  needsRpc: boolean;
} {
  const humanCount = loop.human_messages;
  const hasHumanFromDaemon = typeof humanCount === 'number' && humanCount > 0;
  const threads = typeof loop.threads === 'number' ? loop.threads : 0;

  if (threads === 0) {
    return { hasUserMessage: hasHumanFromDaemon, needsRpc: false };
  }

  // threads > 0 means user interacted — always mark as having messages.
  return { hasUserMessage: true, needsRpc: true };
}

describe('enrichOne decision logic', () => {
  describe('threads === 0 (no bound thread)', () => {
    it('returns hasUserMessage=false when daemon reports 0 human messages', () => {
      const result = enrichmentDecision({ loop_id: 'a', threads: 0, human_messages: 0 });
      expect(result.hasUserMessage).toBe(false);
      expect(result.needsRpc).toBe(false);
    });

    it('returns hasUserMessage=true when daemon reports human_messages > 0', () => {
      const result = enrichmentDecision({ loop_id: 'a', threads: 0, human_messages: 1 });
      expect(result.hasUserMessage).toBe(true);
      expect(result.needsRpc).toBe(false);
    });

    it('returns hasUserMessage=false when human_messages field is missing', () => {
      const result = enrichmentDecision({ loop_id: 'a', threads: 0 });
      expect(result.hasUserMessage).toBe(false);
      expect(result.needsRpc).toBe(false);
    });
  });

  describe('threads > 0 (has bound thread)', () => {
    it('always returns hasUserMessage=true regardless of human_messages count', () => {
      const result = enrichmentDecision({ loop_id: 'a', threads: 1, human_messages: 0 });
      expect(result.hasUserMessage).toBe(true);
      expect(result.needsRpc).toBe(true);
    });

    it('requires RPC for title/preview enrichment', () => {
      const result = enrichmentDecision({ loop_id: 'a', threads: 3, human_messages: 5 });
      expect(result.needsRpc).toBe(true);
    });
  });

  describe('missing threads field', () => {
    it('treats undefined threads as 0', () => {
      const result = enrichmentDecision({ loop_id: 'a' });
      expect(result.hasUserMessage).toBe(false);
      expect(result.needsRpc).toBe(false);
    });
  });
});

/**
 * Mirror the extractPreviews logic that parses daemon loop_messages response.
 */
interface ThreadMessageLike {
  role?: 'user' | 'assistant' | 'system' | null;
  kind?: string;
  content?: string;
  timestamp?: string | number;
}

interface PreviewResult {
  title?: string;
  latestPreview?: string;
  hasUserMessage: boolean;
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
    ? `${latest.role === 'user' ? 'You' : 'AI'}: ${latest.text.slice(0, 80)}`
    : undefined;
  return {
    title: firstUser,
    latestPreview,
    hasUserMessage: hasUser,
    lastMessageAt: lastTs,
  };
}

describe('extractPreviews', () => {
  it('returns hasUserMessage=false for empty messages', () => {
    expect(extractPreviews([])).toEqual({ hasUserMessage: false });
    expect(extractPreviews(null)).toEqual({ hasUserMessage: false });
    expect(extractPreviews(undefined)).toEqual({ hasUserMessage: false });
  });

  it('extracts title from first user message', () => {
    const result = extractPreviews([
      { role: 'user', content: 'fix the login bug', kind: 'conversation' },
      { role: 'assistant', content: 'I will fix it', kind: 'conversation' },
    ]);
    expect(result.title).toBe('fix the login bug');
    expect(result.hasUserMessage).toBe(true);
  });

  it('uses latest message for preview (user or assistant)', () => {
    const result = extractPreviews([
      { role: 'user', content: 'hello', kind: 'conversation' },
      { role: 'assistant', content: 'world', kind: 'conversation' },
    ]);
    expect(result.latestPreview).toBe('AI: world');
  });

  it('extracts timestamp from last message', () => {
    const result = extractPreviews([
      { role: 'user', content: 'hi', timestamp: '2026-06-05T10:00:00Z' },
      { role: 'assistant', content: 'hi', timestamp: '2026-06-05T10:01:00Z' },
    ]);
    expect(result.lastMessageAt).toBe('2026-06-05T10:01:00Z');
  });

  it('handles numeric timestamps', () => {
    const result = extractPreviews([
      { role: 'user', content: 'hi', timestamp: 1717585200 },
    ]);
    expect(result.lastMessageAt).toBeDefined();
    expect(result.hasUserMessage).toBe(true);
  });

  it('skips messages without content', () => {
    const result = extractPreviews([
      { role: 'user', content: '' },
      { role: 'assistant', content: '  ' },
      { role: 'user', content: 'actual message' },
    ]);
    expect(result.title).toBe('actual message');
  });

  it('skips non-object entries', () => {
    const result = extractPreviews([null, undefined, 'string', { role: 'user', content: 'ok' }]);
    expect(result.hasUserMessage).toBe(true);
    expect(result.title).toBe('ok');
  });
});
