import { describe, expect, it } from 'vitest';
import type { LoopSummary } from '@shared/ipc';

/**
 * Mirror the sidebar's filter+sort behavior so we can unit-test it without
 * mounting the full Sidebar component.
 */
function tsValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loopSortKey(loop: LoopSummary): number {
  const last = tsValue(loop.last_message_at);
  if (last > 0) return last;
  return typeof loop.created === 'string' || typeof loop.created === 'number'
    ? tsValue(loop.created as string | number)
    : 0;
}

function visibleLoops(loops: LoopSummary[], openLoopIds: Set<string>): LoopSummary[] {
  return loops
    .filter(loop => {
      if (openLoopIds.has(loop.loop_id)) return true;
      return loop.hasUserMessage !== false;
    })
    .sort((a, b) => loopSortKey(b) - loopSortKey(a));
}

describe('sidebar visibleLoops', () => {
  it('hides loops without user messages', () => {
    const out = visibleLoops(
      [
        { loop_id: 'a', hasUserMessage: false },
        { loop_id: 'b', hasUserMessage: true, title: 'hello' },
        { loop_id: 'c', hasUserMessage: false },
      ],
      new Set(),
    );
    expect(out.map(l => l.loop_id)).toEqual(['b']);
  });

  it('keeps open loops even if empty', () => {
    const out = visibleLoops(
      [
        { loop_id: 'a', hasUserMessage: false },
        { loop_id: 'b', hasUserMessage: false },
      ],
      new Set(['a']),
    );
    expect(out.map(l => l.loop_id)).toEqual(['a']);
  });

  it('keeps loops with unknown hasUserMessage (undefined)', () => {
    const out = visibleLoops([{ loop_id: 'a' }], new Set());
    expect(out.map(l => l.loop_id)).toEqual(['a']);
  });

  it('sorts by last_message_at desc, then created', () => {
    const out = visibleLoops(
      [
        { loop_id: 'old', hasUserMessage: true, created: '2026-01-01T00:00:00Z' },
        { loop_id: 'new', hasUserMessage: true, created: '2026-06-01T00:00:00Z' },
        { loop_id: 'mid', hasUserMessage: true, last_message_at: '2026-03-15T00:00:00Z' },
      ],
      new Set(),
    );
    expect(out.map(l => l.loop_id)).toEqual(['new', 'mid', 'old']);
  });
});
