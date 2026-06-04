import { describe, expect, it, beforeEach } from 'vitest';
import {
  listRegisteredPatterns,
  registerFallback,
  registerRenderer,
  resolveRenderer,
} from '@renderer/event-renderers/registry';

function freshRegistry(): void {
  // Re-import would be cleaner; for now we just register fresh entries on top
  // and rely on specificity ordering.
}

describe('event renderer registry', () => {
  beforeEach(freshRegistry);

  it('exact match wins over glob', () => {
    const Exact = () => null;
    const Glob = () => null;
    registerRenderer('soothe.tool.execution.*', Glob);
    registerRenderer('soothe.tool.execution.completed', Exact);
    expect(resolveRenderer('soothe.tool.execution.completed')).toBe(Exact);
  });

  it('more-specific glob wins over wildcard glob', () => {
    const Wide = () => null;
    const Narrow = () => null;
    registerRenderer('soothe.*.*.*', Wide);
    registerRenderer('soothe.subagent.*.*', Narrow);
    expect(resolveRenderer('soothe.subagent.explore.started')).toBe(Narrow);
  });

  it('falls back when nothing matches', () => {
    const Fallback = () => null;
    registerFallback(Fallback);
    expect(resolveRenderer('totally.unknown.event')).toBe(Fallback);
  });

  it('lists patterns', () => {
    expect(listRegisteredPatterns().length).toBeGreaterThan(0);
  });
});
