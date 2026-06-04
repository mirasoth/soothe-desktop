import { describe, expect, it } from 'vitest';
import { matchesPattern } from '@shared/events';

describe('matchesPattern', () => {
  it('matches exact event types', () => {
    expect(matchesPattern('soothe.tool.execution.started', 'soothe.tool.execution.started')).toBe(
      true,
    );
  });

  it('matches glob in trailing segment', () => {
    expect(matchesPattern('soothe.tool.execution.completed', 'soothe.tool.execution.*')).toBe(true);
  });

  it('matches glob in middle segments', () => {
    expect(matchesPattern('soothe.subagent.explore.started', 'soothe.subagent.*.*')).toBe(true);
  });

  it('rejects when segment count differs', () => {
    expect(matchesPattern('soothe.tool.execution.started', 'soothe.tool.*')).toBe(false);
  });

  it('rejects non-matching exact patterns', () => {
    expect(matchesPattern('soothe.error.protocol', 'soothe.tool.execution.*')).toBe(false);
  });
});
