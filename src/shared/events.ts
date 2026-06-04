/**
 * Browser-safe helpers for event-namespace parsing and matching.
 *
 * These mirror the helpers in `@mirasoth/soothe-client`'s `events.ts` but are
 * reimplemented here so the renderer bundle does not pull in the client
 * package (which depends on Node-only modules `ws`, `events`, `crypto`).
 *
 * The wire format is defined by RFC-403: `soothe.<domain>.<component>.<action>`.
 */

/**
 * Glob-style event-type pattern. Either an exact event type
 * (e.g. `soothe.cognition.plan.created`) or a glob with `*` segments
 * (e.g. `soothe.tool.execution.*`, `soothe.subagent.*.*`).
 */
export type EventTypePattern = string;

export interface DecodedEvent extends Record<string, unknown> {
  type: string;
  timestamp?: string | number;
}

export interface ParsedNamespace {
  domain: string;
  component: string;
  action: string;
}

export function parseNamespace(ns: string): ParsedNamespace | null {
  const parts = ns.split('.');
  if (parts.length < 4 || parts[0] !== 'soothe') return null;
  if (parts[1] === 'internal') return null;
  return { domain: parts[1]!, component: parts[2]!, action: parts[3]! };
}

export function matchesPattern(eventType: string, pattern: EventTypePattern): boolean {
  if (pattern === eventType) return true;
  if (!pattern.includes('*')) return false;
  const patSegments = pattern.split('.');
  const evSegments = eventType.split('.');
  if (patSegments.length !== evSegments.length) return false;
  for (let i = 0; i < patSegments.length; i += 1) {
    const p = patSegments[i]!;
    if (p !== '*' && p !== evSegments[i]) return false;
  }
  return true;
}

/** Essential event types that any client should always render (best-effort list). */
export const ESSENTIAL_EVENT_TYPES: readonly string[] = [
  'AIMessage',
  'AIMessageChunk',
  'soothe.cognition.agent_loop.completed',
  'soothe.loop.clarification.requested',
  'soothe.error.protocol',
];
