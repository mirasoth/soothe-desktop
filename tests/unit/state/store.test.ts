import { describe, expect, it, beforeEach } from 'vitest';
import { makeTab, useStore } from '@renderer/state/store';

beforeEach(() => {
  // Reset store state between tests
  const state = useStore.getState();
  for (const tab of [...state.tabs]) state.removeTab(tab.tabId);
  state.setLoops([]);
  state.setLoopsError(undefined);
  state.setDaemon(null);
  state.setSettingsOpen(false);
  state.setPaletteOpen(false);
});

describe('tabs slice', () => {
  it('addTab sets activeTabId to the new tab', () => {
    useStore.getState().addTab(makeTab({ tabId: 't1', loopId: 'l1' }));
    expect(useStore.getState().activeTabId).toBe('t1');
    expect(useStore.getState().tabs).toHaveLength(1);
  });

  it('removeTab updates activeTabId to the previous tab when active is removed', () => {
    const s = useStore.getState();
    s.addTab(makeTab({ tabId: 't1', loopId: 'l1' }));
    s.addTab(makeTab({ tabId: 't2', loopId: 'l2' }));
    s.removeTab('t2');
    expect(useStore.getState().activeTabId).toBe('t1');
  });

  it('appendTabEvent grows the event log', () => {
    const s = useStore.getState();
    s.addTab(makeTab({ tabId: 't1', loopId: 'l1' }));
    s.appendTabEvent('t1', { type: 'AIMessageChunk', content: 'hi' });
    s.appendTabEvent('t1', { type: 'AIMessageChunk', content: ' there' });
    const tab = useStore.getState().tabs.find(t => t.tabId === 't1');
    expect(tab?.events).toHaveLength(2);
  });
});

describe('clarification slice', () => {
  it('setClarification flips streamEndSuppressed', () => {
    const s = useStore.getState();
    s.addTab(makeTab({ tabId: 't1', loopId: 'l1' }));
    s.setClarification('t1', { questions: ['why?'], status: 'pending' });
    expect(useStore.getState().tabs[0]!.streamEndSuppressed).toBe(true);
    s.setClarification('t1', { questions: ['why?'], status: 'resolved' });
    expect(useStore.getState().tabs[0]!.streamEndSuppressed).toBe(false);
  });
});
