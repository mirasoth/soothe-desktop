import { useEffect, useMemo, useState } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore, makeTab } from '../state/store.js';
import type { LoopSummary } from '@shared/ipc';
import { Button } from '../ui/button.js';
import { BrandMark } from '../ui/brand.js';
import { cn, formatTimestamp, truncate } from '../lib/utils.js';

function tsValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loopSortKey(loop: { last_message_at?: string | number | null; created?: unknown }): number {
  const last = tsValue(loop.last_message_at);
  if (last > 0) return last;
  // daemon's loop_list returns `created` (a string like "2026-06-04T14:23") when
  // last_message_at is not surfaced. Fall back to that.
  const created = typeof loop.created === 'string' || typeof loop.created === 'number'
    ? tsValue(loop.created as string | number)
    : 0;
  return created;
}

interface SidebarProps {
  disabled?: boolean;
}

export function Sidebar({ disabled }: SidebarProps): React.ReactElement {
  const loops = useStore(s => s.loops);
  const loopsLoading = useStore(s => s.loopsLoading);
  const loopsError = useStore(s => s.loopsError);
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const setActiveTab = useStore(s => s.setActiveTab);
  const setLoops = useStore(s => s.setLoops);
  const setLoopsError = useStore(s => s.setLoopsError);
  const setLoopsLoading = useStore(s => s.setLoopsLoading);
  const addTab = useStore(s => s.addTab);
  const removeTab = useStore(s => s.removeTab);

  const [busy, setBusy] = useState(false);

  const visibleLoops = useMemo(() => {
    return loops
      .filter(loop => {
        // Hide loops with no human messages. Keep loops that are currently open
        // in a tab (the user may be drafting a first message) and loops where
        // we couldn't determine status (treat as visible to be safe).
        if (tabs.some(t => t.loopId === loop.loop_id)) return true;
        return loop.hasUserMessage !== false;
      })
      .sort((a, b) => loopSortKey(b) - loopSortKey(a));
  }, [loops, tabs]);

  const refresh = async (): Promise<void> => {
    setLoopsLoading(true);
    try {
      const resp = await soothe().loopsList();
      if (resp.error) {
        setLoopsError(resp.error);
      } else {
        setLoops(resp.loops);
      }
    } finally {
      setLoopsLoading(false);
    }
  };

  useEffect(() => {
    if (!disabled) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const onFocus = (): void => {
    if (!disabled) void refresh();
  };
  useEffect(() => {
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const newChat = async (): Promise<void> => {
    if (disabled) return;
    setBusy(true);
    try {
      const resp = await soothe().tabOpen({});
      if (resp.error || !resp.tabId) {
        setLoopsError(resp.error ?? 'Failed to open new chat');
        return;
      }
      addTab(makeTab({ tabId: resp.tabId, loopId: resp.loopId, title: 'New chat' }));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const openLoop = async (loop: LoopSummary): Promise<void> => {
    // If already open in a tab, switch to it.
    const existing = tabs.find(t => t.loopId === loop.loop_id);
    if (existing) {
      setActiveTab(existing.tabId);
      return;
    }
    setBusy(true);
    try {
      const resp = await soothe().tabOpen({ loopId: loop.loop_id });
      if (resp.error || !resp.tabId) {
        setLoopsError(resp.error ?? 'Failed to open loop');
        return;
      }
      addTab(
        makeTab({
          tabId: resp.tabId,
          loopId: resp.loopId,
          title: loop.title ? truncate(loop.title, 32) : truncate(loop.loop_id, 24),
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteLoop = async (loop: LoopSummary): Promise<void> => {
    const existing = tabs.find(t => t.loopId === loop.loop_id);
    if (existing) {
      await soothe().tabClose({ tabId: existing.tabId, mode: 'delete' });
      removeTab(existing.tabId);
    } else {
      await soothe().loopsDelete({ loopId: loop.loop_id });
    }
    void refresh();
  };

  return (
    <aside className="flex w-72 flex-none flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <BrandMark size={20} />
      </div>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button size="sm" onClick={newChat} disabled={disabled || busy} className="flex-1">
          + New chat
        </Button>
        <Button size="icon" variant="ghost" onClick={refresh} title="Refresh" disabled={disabled}>
          ↻
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loopsLoading && loops.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Loading…</div>
        ) : loopsError ? (
          <div className="p-3 text-xs text-destructive">{loopsError}</div>
        ) : visibleLoops.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            {disabled ? 'Daemon disconnected.' : 'No conversations yet.'}
          </div>
        ) : (
          <ul className="space-y-0.5 p-1">
            {visibleLoops.map(loop => {
              const open = tabs.find(t => t.loopId === loop.loop_id);
              const isActive = open?.tabId === activeTabId;
              const displayTitle = loop.title?.trim() || loop.loop_id.slice(0, 8);
              return (
                <li key={loop.loop_id}>
                  <div
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent',
                      isActive ? 'bg-accent' : '',
                    )}
                    onClick={() => openLoop(loop)}
                    title={`${loop.loop_id}${loop.title ? `\n${loop.title}` : ''}`}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 flex-none rounded-full',
                        loop.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{truncate(displayTitle, 40)}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {loop.status ?? 'idle'} ·{' '}
                        {formatTimestamp(
                          (loop.last_message_at as string | number | null | undefined) ??
                            (typeof loop.created === 'string' || typeof loop.created === 'number'
                              ? (loop.created as string | number)
                              : null),
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="hidden text-muted-foreground hover:text-destructive group-hover:inline"
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Delete loop ${loop.loop_id.slice(0, 8)}?`)) {
                          void deleteLoop(loop);
                        }
                      }}
                      title="Delete loop"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-border p-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => useStore.getState().setSettingsOpen(true)}
        >
          ⚙ Settings
        </Button>
      </div>
    </aside>
  );
}
