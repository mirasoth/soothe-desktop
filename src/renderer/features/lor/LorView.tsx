import { useEffect, useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore, makeTab } from '../../state/store.js';
import type { EventLogEntry } from '../../state/store.js';
import { LorMessageList } from './LorMessageList.js';
import { LorCommentPanel } from './LorCommentPanel.js';
import { truncate } from '../../lib/utils.js';

interface LorViewProps {
  jobId: string;
  goalId: string;
  loopId: string;
  goalDescription: string;
  onBack: () => void;
}

export function LorView({
  jobId,
  goalId,
  loopId,
  goalDescription,
  onBack,
}: LorViewProps): React.ReactElement {
  const tabs = useStore(s => s.tabs);
  const addTab = useStore(s => s.addTab);
  const [lorTabId, setLorTabId] = useState<string | null>(null);

  useEffect(() => {
    const existing = tabs.find(t => t.loopId === loopId);
    if (existing) {
      setLorTabId(existing.tabId);
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        const resp = await soothe().tabOpen({ loopId });
        if (!mounted || resp.error || !resp.tabId) return;
        addTab(makeTab({ tabId: resp.tabId, loopId: resp.loopId, title: `LOR: ${loopId.slice(0, 8)}` }));
        setLorTabId(resp.tabId);
      } catch {
        // best-effort
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopId]);

  const lorTab = lorTabId ? tabs.find(t => t.tabId === lorTabId) : undefined;
  const events: EventLogEntry[] = lorTab?.events ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card/60 px-4 py-2">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onBack}
          title="Back to DAG"
        >
          &larr;
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {truncate(goalDescription, 60)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Worker: {loopId.slice(0, 16)}...
          </div>
        </div>
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {lorTab?.status ?? 'connecting'}
        </span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 border-r border-border">
          <LorMessageList events={events} />
        </div>
        <div className="w-[320px]">
          <LorCommentPanel jobId={jobId} goalId={goalId} />
        </div>
      </div>
    </div>
  );
}
