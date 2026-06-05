import { soothe } from '../lib/ipc.js';
import { useStore } from '../state/store.js';
import type { TabState } from '../state/store.js';
import { cn, truncate } from '../lib/utils.js';

function statusGlyph(tab: TabState): React.ReactElement {
  if (tab.clarification?.status === 'pending') {
    return <span className="h-2 w-2 rounded-full bg-amber-500" title="awaiting answer" />;
  }
  if (tab.status === 'connecting' || tab.status === 'reconnecting') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" title={tab.status} />;
  }
  if (tab.status === 'error') {
    return <span className="h-2 w-2 rounded-full bg-destructive" title={tab.error ?? 'error'} />;
  }
  if (tab.isRunning) {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="running" />;
  }
  return <span className="h-2 w-2 rounded-full bg-emerald-500/70" title="ready" />;
}

export function TabBar(): React.ReactElement | null {
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const setActiveTab = useStore(s => s.setActiveTab);
  const removeTab = useStore(s => s.removeTab);

  if (tabs.length === 0) return null;

  const onClose = async (tabId: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await soothe().tabClose({ tabId, mode: 'detach' });
    removeTab(tabId);
  };

  return (
    <div className="flex h-9 flex-none items-stretch border-b border-border bg-card/30 scrollbar-thin overflow-x-auto">
      {tabs.map(tab => {
        const isActive = activeTabId === tab.tabId;
        return (
          <button
            key={tab.tabId}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => setActiveTab(tab.tabId)}
            className={cn(
              'group relative flex min-w-0 max-w-[240px] flex-none items-center gap-2 border-r border-border px-3 text-xs transition-colors',
              isActive
                ? 'bg-background text-foreground font-medium shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
            title={tab.loopId}
          >
            {statusGlyph(tab)}
            <span className="truncate">{truncate(tab.title, 26)}</span>
            <span
              className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
              onClick={e => void onClose(tab.tabId, e)}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
