import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(ts: string | number | null | undefined): string {
  if (ts === null || ts === undefined) return '';
  let parsed: Date;
  if (typeof ts === 'number') {
    parsed = new Date(ts > 1e12 ? ts : ts * 1000);
  } else {
    // ISO-8601 without an explicit timezone — the daemon emits these (truncated
    // to "YYYY-MM-DDTHH:MM"). JS Date parses such strings as UTC for date-only
    // forms but is browser-dependent for date-time forms. Append "Z" to force
    // UTC interpretation, then toLocaleString renders in the user's local zone.
    const needsZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(ts);
    parsed = new Date(needsZ ? `${ts}Z` : ts);
  }
  if (Number.isNaN(parsed.getTime())) return String(ts);
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Collapse the daemon's loop status vocabulary into a binary running/idle.
 * RFC-503 / RFC-225 statuses include: running, idle, created, ready_for_next_goal,
 * detached, completed, cancelled, ...; only "running" maps to active.
 */
export function simpleLoopStatus(status: string | undefined | null): 'running' | 'idle' {
  return status === 'running' ? 'running' : 'idle';
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
