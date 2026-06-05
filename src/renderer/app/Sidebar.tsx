import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore, makeTab } from '../state/store.js';
import type { JobSummary, LoopSummary } from '@shared/ipc';
import { Button } from '../ui/button.js';
import { BrandMark } from '../ui/brand.js';
import { cn, formatTimestamp, simpleLoopStatus, truncate } from '../lib/utils.js';
import { SectionHeader } from '../features/sidebar/SectionHeader.js';

function tsValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loopSortKey(loop: LoopSummary): number {
  const last = tsValue(loop.last_message_at);
  if (last > 0) return last;
  return tsValue(loop.created ?? null);
}

const jobStatusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  active: 'bg-emerald-500 animate-pulse',
  running: 'bg-emerald-500 animate-pulse',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
  suspended: 'bg-yellow-500',
};

interface SidebarProps {
  disabled?: boolean;
}

export function Sidebar({ disabled }: SidebarProps): React.ReactElement {
  const loops = useStore(s => s.loops);
  const loopsLoading = useStore(s => s.loopsLoading);
  const loopsError = useStore(s => s.loopsError);
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const activeJobId = useStore(s => s.activeJobId);
  const jobs = useStore(s => s.jobs);
  const project = useStore(s => s.project);
  const setActiveTab = useStore(s => s.setActiveTab);
  const setActiveJobId = useStore(s => s.setActiveJobId);
  const setLoops = useStore(s => s.setLoops);
  const setLoopsError = useStore(s => s.setLoopsError);
  const setLoopsLoading = useStore(s => s.setLoopsLoading);
  const setJobCreateOpen = useStore(s => s.setJobCreateOpen);
  const setProject = useStore(s => s.setProject);
  const addTab = useStore(s => s.addTab);
  const removeTab = useStore(s => s.removeTab);

  const [busy, setBusy] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const visibleLoops = useMemo(() => {
    return loops
      .filter(loop => {
        if (tabs.some(t => t.loopId === loop.loop_id)) return true;
        return loop.hasUserMessage === true;
      })
      .sort((a, b) => loopSortKey(b) - loopSortKey(a));
  }, [loops, tabs]);

  const doRefresh = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    setLoopsLoading(true);
    const p = soothe()
      .loopsList()
      .then(resp => {
        if (resp.error) setLoopsError(resp.error);
        else setLoops(resp.loops);
      })
      .catch(() => undefined)
      .finally(() => {
        setLoopsLoading(false);
        refreshInFlightRef.current = null;
      });
    refreshInFlightRef.current = p;
    return p;
  }, [setLoopsLoading, setLoopsError, setLoops]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void doRefresh();
    }, 500);
  }, [doRefresh]);

  useEffect(() => {
    if (!disabled) debouncedRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    const onFocus = (): void => {
      if (!disabled) debouncedRefresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [disabled, debouncedRefresh]);

  const newChat = async (): Promise<void> => {
    if (disabled) return;
    setBusy(true);
    try {
      const resp = await soothe().tabOpen({});
      if (resp.error || !resp.tabId) {
        setLoopsError(resp.error ?? 'Failed to open new chat');
        return;
      }
      setActiveJobId(undefined);
      addTab(makeTab({ tabId: resp.tabId, loopId: resp.loopId, title: 'New chat' }));
      debouncedRefresh();
    } finally {
      setBusy(false);
    }
  };

  const openLoop = async (loop: LoopSummary): Promise<void> => {
    if (busy) return;
    const current = useStore.getState().tabs;
    const existing = current.find(t => t.loopId === loop.loop_id);
    if (existing) {
      setActiveJobId(undefined);
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
      const afterOpen = useStore.getState().tabs;
      const dup = afterOpen.find(t => t.loopId === loop.loop_id);
      if (dup) {
        setActiveJobId(undefined);
        setActiveTab(dup.tabId);
        return;
      }
      setActiveJobId(undefined);
      addTab(
        makeTab({
          tabId: resp.tabId,
          loopId: resp.loopId,
          title: loop.title ? truncate(loop.title, 32) : truncate(loop.loop_id, 24),
        }),
      );
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
      // best-effort
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
    debouncedRefresh();
  };

  const openJob = (job: JobSummary): void => {
    setActiveTab(undefined);
    setActiveJobId(job.id);
  };

  const switchProject = async (): Promise<void> => {
    const path = await soothe().selectFolder();
    if (!path) return;
    const check = await soothe().projectCheck({ path });
    if (check.error) return;
    if (check.initialized) {
      await soothe().settingsSet({ projectPath: path });
      setProject({ path, name: check.name, initialized: true, loading: false });
    } else {
      const init = await soothe().projectInit({ path });
      if (init.error) return;
      await soothe().settingsSet({ projectPath: path });
      setProject({ path, name: init.name, initialized: true, loading: false });
    }
  };

  return (
    <aside className="flex w-72 flex-none flex-col border-r border-border bg-card/40">
      <div
        className="flex items-center justify-between border-b border-border px-3 py-2"
        title={project.path ?? undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark size={16} />
          <span className="truncate text-sm font-medium">{project.name || 'Soothe'}</span>
        </div>
        <button
          type="button"
          className="flex-none rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => void switchProject()}
          title="Switch project"
        >
          ⇄
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button size="sm" onClick={newChat} disabled={disabled || busy} className="flex-1">
          + New chat
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void doRefresh()} title="Refresh" disabled={disabled}>
          ↻
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Chats section */}
        <SectionHeader title="Chats" count={visibleLoops.length}>
          {loopsLoading && loops.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground">Loading...</div>
          ) : loopsError ? (
            <div className="px-3 pb-2 text-xs text-destructive">{loopsError}</div>
          ) : visibleLoops.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground">
              {disabled ? 'Daemon disconnected.' : 'No conversations yet.'}
            </div>
          ) : (
            <ul className="space-y-0.5 px-1 pb-2">
              {visibleLoops.map(loop => {
                const open = tabs.find(t => t.loopId === loop.loop_id);
                const isActive = open?.tabId === activeTabId && !activeJobId;
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
                        isActive
                          ? 'bg-accent border-l-2 border-primary pl-[6px] font-medium'
                          : 'border-l-2 border-transparent',
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
        </SectionHeader>

        {/* Jobs section */}
        <SectionHeader
          title="Jobs"
          count={jobs.length}
          action={
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setJobCreateOpen(true)}
              disabled={disabled}
              title="Create new job"
            >
              +
            </button>
          }
        >
          {jobs.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground">
              No jobs yet.
            </div>
          ) : (
            <ul className="space-y-0.5 px-1 pb-2">
              {jobs.map(job => {
                const isActive = activeJobId === job.id;
                const dotColor = jobStatusColors[job.status] ?? 'bg-muted-foreground/50';
                const progress =
                  job.total_goals > 0
                    ? `${job.completed_goals}/${job.total_goals}`
                    : '';
                return (
                  <li key={job.id}>
                    <div
                      className={cn(
                        'group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent/60',
                        isActive
                          ? 'bg-accent border-l-2 border-primary pl-[6px] font-medium'
                          : 'border-l-2 border-transparent',
                      )}
                      onClick={() => openJob(job)}
                      title={job.goal}
                    >
                      <span className={cn('h-1.5 w-1.5 flex-none rounded-full', dotColor)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{truncate(job.goal, 50)}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {job.status}
                          {progress && ` · ${progress}`}
                          {job.last_error && ' · error'}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionHeader>
      </div>
      <div className="border-t border-border p-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => useStore.getState().setSettingsOpen(true)}
        >
          Settings
        </Button>
      </div>
    </aside>
  );
}
