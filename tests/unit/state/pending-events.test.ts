import { describe, expect, it, beforeEach } from 'vitest';
import { makeTab, useStore } from '@renderer/state/store';

beforeEach(() => {
  const s = useStore.getState();
  for (const t of [...s.tabs]) s.removeTab(t.tabId);
  // Clear pending buffer by re-initializing via mutator.
  useStore.setState({ pendingEvents: {} });
});

describe('pendingEvents race buffer', () => {
  it('buffers events that arrive before addTab and drains them on addTab', () => {
    const s = useStore.getState();
    // Simulate history_replay arriving before tabOpen response completes
    s.appendTabEvent('race-tab', { type: 'human', content: 'first message' });
    s.appendTabEvent('race-tab', { type: 'ai', content: 'first reply' });

    expect(useStore.getState().pendingEvents['race-tab']?.length).toBe(2);
    expect(useStore.getState().tabs).toHaveLength(0);

    s.addTab(makeTab({ tabId: 'race-tab', loopId: 'loop-x' }));

    const tab = useStore.getState().tabs.find(t => t.tabId === 'race-tab');
    expect(tab?.events).toHaveLength(2);
    expect((tab?.events[0]?.event as { content?: string }).content).toBe('first message');
    expect((tab?.events[1]?.event as { content?: string }).content).toBe('first reply');
    // Buffer cleared after drain
    expect(useStore.getState().pendingEvents['race-tab']).toBeUndefined();
  });

  it('appends to existing tab directly without buffering', () => {
    const s = useStore.getState();
    s.addTab(makeTab({ tabId: 'direct-tab', loopId: 'loop-y' }));
    s.appendTabEvent('direct-tab', { type: 'ai', content: 'live event' });
    const tab = useStore.getState().tabs.find(t => t.tabId === 'direct-tab');
    expect(tab?.events).toHaveLength(1);
    expect(useStore.getState().pendingEvents['direct-tab']).toBeUndefined();
  });
});
