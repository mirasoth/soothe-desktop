import type { ComponentType } from 'react';
import type { EventTypePattern } from '@shared/events';
import { matchesPattern } from '@shared/events';

export interface EventCardProps {
  tabId: string;
  event: Record<string, unknown> & { type: string };
  receivedAt: number;
}

export type EventRenderer = ComponentType<EventCardProps>;

interface RegistryEntry {
  pattern: EventTypePattern;
  component: EventRenderer;
  specificity: number;
}

const entries: RegistryEntry[] = [];
let fallback: EventRenderer | null = null;

function specificity(pattern: EventTypePattern): number {
  if (!pattern.includes('*')) return 1000;
  return pattern.split('.').filter(p => p !== '*').length;
}

export function registerRenderer(pattern: EventTypePattern, component: EventRenderer): void {
  entries.push({ pattern, component, specificity: specificity(pattern) });
  entries.sort((a, b) => b.specificity - a.specificity);
}

export function registerFallback(component: EventRenderer): void {
  fallback = component;
}

export function resolveRenderer(eventType: string): EventRenderer | null {
  for (const entry of entries) {
    if (matchesPattern(eventType, entry.pattern)) return entry.component;
  }
  return fallback;
}

export function listRegisteredPatterns(): EventTypePattern[] {
  return entries.map(e => e.pattern);
}
