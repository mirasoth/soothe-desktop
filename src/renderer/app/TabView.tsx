import { useEffect, useMemo } from 'react';
import { useStore } from '../state/store.js';
import { MessageList } from '../features/chat/MessageList.js';
import { Composer } from '../features/composer/Composer.js';

interface Props {
  tabId: string;
}

export function TabView({ tabId }: Props): React.ReactElement | null {
  const tab = useStore(useMemo(() => (s => s.tabs.find(t => t.tabId === tabId)), [tabId]));

  useEffect(() => {
    if (!tab) return;
    // Mark tab visited for any future "unread" badge work.
  }, [tab]);

  if (!tab) return null;

  return (
    <section className="flex h-full flex-col">
      {tab.status === 'reconnecting' ? (
        <div className="flex-none border-b border-blue-500/40 bg-blue-500/10 px-4 py-1 text-xs text-blue-600 dark:text-blue-300">
          Reconnecting to daemon…
        </div>
      ) : tab.status === 'error' ? (
        <div className="flex-none border-b border-destructive/40 bg-destructive/10 px-4 py-1 text-xs text-destructive">
          Connection error: {tab.error ?? 'unknown'}
        </div>
      ) : null}
      <div className="flex-1 overflow-hidden">
        {tab.events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {tab.status === 'connecting'
              ? 'Connecting to loop…'
              : 'No messages yet. Say hello.'}
          </div>
        ) : (
          <MessageList tab={tab} />
        )}
      </div>
      <Composer tab={tab} />
    </section>
  );
}
