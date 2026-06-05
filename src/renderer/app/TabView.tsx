import { useEffect, useMemo, useRef, useState } from 'react';
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
          <span className="inline-block animate-pulse">●</span> Reconnecting to daemon…
          {tab.error ? <span className="ml-2 opacity-60">({tab.error})</span> : null}
        </div>
      ) : tab.status === 'error' ? (
        <div className="flex-none border-b border-destructive/40 bg-destructive/10 px-4 py-1 text-xs text-destructive">
          Connection error: {tab.error ?? 'unknown'}
        </div>
      ) : null}
      <div className="relative flex-1 overflow-hidden">
        {tab.events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {tab.status === 'connecting'
              ? 'Connecting to loop…'
              : 'No messages yet. Say hello.'}
          </div>
        ) : (
          <MessageList tab={tab} />
        )}
        {tab.isRunning && <ThinkingIndicator />}
      </div>
      <Composer tab={tab} />
    </section>
  );
}

function ThinkingIndicator(): React.ReactElement {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const label = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-1.5 shadow-md backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs text-muted-foreground">
          Thinking… <span className="tabular-nums">({label})</span>
        </span>
      </div>
    </div>
  );
}
