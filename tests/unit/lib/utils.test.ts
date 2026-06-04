import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { formatTimestamp, simpleLoopStatus, truncate } from '@renderer/lib/utils';

describe('formatTimestamp', () => {
  it('returns empty for null/undefined', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('treats ISO-without-timezone as UTC, then renders in local zone', () => {
    // The daemon emits truncated "YYYY-MM-DDTHH:MM" strings (no Z). With the
    // fix, these are parsed as UTC. Verify by comparing to an explicit UTC Date.
    const input = '2026-06-04T07:27';
    const out = formatTimestamp(input);
    const expected = new Date('2026-06-04T07:27Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(out).toBe(expected);
  });

  it('renders unix-seconds numbers', () => {
    const ts = Math.floor(Date.parse('2026-06-04T07:27Z') / 1000);
    const out = formatTimestamp(ts);
    expect(out).toContain('Jun');
    expect(out).toContain('4');
  });

  it('renders unix-millis numbers', () => {
    const out = formatTimestamp(Date.parse('2026-06-04T07:27Z'));
    expect(out).toContain('Jun');
  });

  it('falls back to raw string when unparseable', () => {
    expect(formatTimestamp('not a date')).toBe('not a date');
  });
});

describe('simpleLoopStatus', () => {
  it('only "running" maps to running', () => {
    expect(simpleLoopStatus('running')).toBe('running');
  });

  it('all other statuses map to idle', () => {
    for (const s of ['idle', 'created', 'completed', 'cancelled', 'ready_for_next_goal', undefined, null, '']) {
      expect(simpleLoopStatus(s as string | undefined | null)).toBe('idle');
    }
  });
});

describe('truncate', () => {
  it('passes through short strings', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });
  it('truncates and adds ellipsis', () => {
    expect(truncate('abcdefghijk', 6)).toBe('abcde…');
  });
});

let originalDateNow: () => number;
beforeAll(() => {
  originalDateNow = Date.now;
});
afterAll(() => {
  Date.now = originalDateNow;
  vi.useRealTimers();
});
