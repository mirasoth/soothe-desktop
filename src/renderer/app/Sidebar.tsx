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

  const loopsRefreshHint = useStore(s => s.loopsRefreshHint);

  const [busy, setBusy] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const retryCountRef = useRef(0);

  const visibleLoops = useMemo(() => {
    return loops
      .filter(loop => {
        if (tabs.some(t => t.loopId === loop.loop_id)) return true;
        return loop.hasUserMessage === true;
      })
      .sort((a, b) => loopSortKey(b) - loopSortKey(a));
  }, [loops, tabs]);

  const doRefresh = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }
    setLoopsLoading(true);
    const p = soothe()
      .loopsList()
      .then(resp => {
        if (resp.error) setLoopsError(resp.error);
        else {
          setLoopsError(undefined);
          setLoops(resp.loops);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load chats';
        setLoopsError(msg);
      })
      .finally(() => {
        setLoopsLoading(false);
        refreshInFlightRef.current = null;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          void doRefresh();
        }
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
    if (!disabled) {
      void doRefresh();
    }
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

  // Retry loading loops when previous attempt failed or daemon returned empty.
  useEffect(() => {
    if (disabled || loops.length > 0) {
      retryCountRef.current = 0;
      return;
    }
    if (retryCountRef.current >= 5) return;
    const delay = loopsError ? 3000 : 2000;
    const retryTimer = setTimeout(() => {
      retryCountRef.current += 1;
      void doRefresh();
    }, delay);
    return () => clearTimeout(retryTimer);
  }, [disabled, loopsError, loops.length, doRefresh]);

  // React to refresh hint from event routing (e.g. after first human message).
  useEffect(() => {
    if (loopsRefreshHint > 0) {
      debouncedRefresh();
    }
  }, [loopsRefreshHint, debouncedRefresh]);

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
      // Optimistically add the new loop to the sidebar immediately.
      const current = useStore.getState().loops;
      if (!current.some(l => l.loop_id === resp.loopId)) {
        setLoops([
          { loop_id: resp.loopId, status: 'created', hasUserMessage: false, created: new Date().toISOString() },
          ...current,
        ]);
      }
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
      {/* App title */}
      <div className="flex items-center border-b border-border px-3 py-2">
        <BrandMark size={18} />
      </div>

      {/* Project info */}
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        title={project.path ?? undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 flex-none rounded-full',
                disabled ? 'bg-red-500' : 'bg-emerald-500',
              )}
            />
            <span className="truncate text-xs font-medium">
              {project.name || 'No project'}
            </span>
          </div>
          <div className="truncate pl-[9px] text-[10px] text-muted-foreground/60">
            {project.path ?? 'No project selected'}
          </div>
        </div>
        <div className="flex flex-none items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void doRefresh()}
            disabled={disabled}
            title="Refresh"
          >
            ↻
          </button>
          <button
            type="button"
            className="rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void switchProject()}
            title="Switch project"
          >
            ⇄
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Chats section */}
        <SectionHeader
          title="Chats"
          count={visibleLoops.length}
          action={
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => void newChat()}
              disabled={disabled || busy}
              title="New chat"
            >
              +
            </button>
          }
        >
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
                const tabTitle = open?.title;
                const hasRealTabTitle =
                  tabTitle &&
                  tabTitle !== 'New chat' &&
                  !/^[0-9a-f]{8}/.test(tabTitle) &&
                  !tabTitle.startsWith(loop.loop_id.slice(0, 8));
                const headline =
                  loop.latestPreview?.trim() ||
                  (hasRealTabTitle ? tabTitle : undefined) ||
                  loop.title?.trim() ||
                  loop.loop_id.slice(0, 8);
                const status = open?.isRunning ? 'running' : simpleLoopStatus(loop.status);
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
