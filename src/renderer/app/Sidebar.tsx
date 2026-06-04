import { useEffect, useMemo, useState } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore, makeTab } from '../state/store.js';
import type { LoopSummary } from '@shared/ipc';
import { Button } from '../ui/button.js';
import { BrandMark } from '../ui/brand.js';
import { cn, formatTimestamp, simpleLoopStatus, truncate } from '../lib/utils.js';

function tsValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loopSortKey(loop: LoopSummary): number {
  const last = tsValue(loop.last_message_at);
  if (last > 0) return last;
  // daemon's loop_list returns `created` (a string like "2026-06-04T14:23") when
  // last_message_at is not surfaced. Fall back to that.
  return tsValue(loop.created ?? null);
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
        // Strict filter: a loop must have at least one confirmed user message.
        // Keep loops currently open in a tab (the user may be drafting the
        // first message, so the loop is empty server-side but conceptually
        // "active" for them).
        if (tabs.some(t => t.loopId === loop.loop_id)) return true;
        return loop.hasUserMessage === true;
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
      // Tab title: keep the first user message (chat topic), fallback to id.
      addTab(
        makeTab({
          tabId: resp.tabId,
          loopId: resp.loopId,
          title: loop.title ? truncate(loop.title, 32) : truncate(loop.loop_id, 24),
        }),
      );
      // Load persisted history alongside the live subscription. We don't depend
      // on the daemon's history_replay frames timing — explicit fetch is
      // race-free and gives a consistent transcript.
      void loadHistoryInto(resp.tabId, loop.loop_id);
    } finally {
      setBusy(false);
    }
  };

  const loadHistoryInto = async (tabId: string, loopId: string): Promise<void> => {
    try {
      const resp = await soothe().loopsMessages({ loopId, limit: 500 });
      if (resp.error || resp.messages.length === 0) return;
      const state = useStore.getState();
      // Seed events in chronological order. Skip system rows and tool kinds —
      // those are best surfaced via live tool cards once a new turn happens.
      for (const row of resp.messages) {
        if (row.kind !== 'conversation') continue;
        if (row.role !== 'user' && row.role !== 'assistant') continue;
        const text = row.content?.trim();
        if (!text) continue;
        state.appendTabEvent(tabId, {
          type: row.role === 'user' ? 'human' : 'ai',
          content: text,
          historical: true,
        });
      }
    } catch {
      // best-effort; live stream may still backfill via history_replay
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
              const headline =
                loop.latestPreview?.trim() ||
                loop.title?.trim() ||
                loop.loop_id.slice(0, 8);
              const status = simpleLoopStatus(loop.status);
              const stamp = formatTimestamp(loop.last_message_at ?? loop.created ?? null);
              return (
                <li key={loop.loop_id}>
                  <div
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent/60',
                      isActive ? 'bg-accent border-l-2 border-primary pl-[6px] font-medium' : 'border-l-2 border-transparent',
                    )}
                    onClick={() => openLoop(loop)}
                    title={`${loop.loop_id}${loop.title ? `\n${loop.title}` : ''}`}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 flex-none rounded-full',
                        status === 'running'
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-muted-foreground/50',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{truncate(headline, 60)}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {status} · {stamp}
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
