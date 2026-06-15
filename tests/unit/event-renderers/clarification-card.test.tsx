import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClarificationCard } from '@renderer/features/clarification/ClarificationCard';
import { makeTab, useStore } from '@renderer/state/store';

function resetStore(): void {
  const state = useStore.getState();
  for (const tab of [...state.tabs]) state.removeTab(tab.tabId);
}

describe('ClarificationCard', () => {
  beforeEach(() => {
    resetStore();
  });

  it('hides pending clarification request cards in auto mode', () => {
    useStore.getState().addTab(makeTab({ tabId: 't1', loopId: 'l1' }));

    render(
      <ClarificationCard
        tabId="t1"
        receivedAt={Date.now()}
        event={{
          type: 'soothe.loop.clarification.requested',
          data: { mode: 'auto', questions: ['What should I do?'] },
        }}
      />,
    );

    expect(screen.queryByText('Awaiting your answer')).toBeNull();
  });

  it('shows pending clarification request cards in manual mode', () => {
    useStore.getState().addTab(makeTab({ tabId: 't2', loopId: 'l2' }));

    render(
      <ClarificationCard
        tabId="t2"
        receivedAt={Date.now()}
        event={{
          type: 'soothe.loop.clarification.requested',
          data: { mode: 'manual', questions: ['Need your input'] },
        }}
      />,
    );

    expect(screen.getByText('Awaiting your answer')).toBeTruthy();
    expect(screen.getByText('Need your input')).toBeTruthy();
  });
});
