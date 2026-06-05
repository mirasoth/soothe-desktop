import { useEffect } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore } from '../state/store.js';
import type { AutopilotEventEnvelope, TabEventEnvelope, TabStatusEvent } from '@shared/ipc';
import { EmptyState } from './EmptyState.js';
import { Sidebar } from './Sidebar.js';
import { TabBar } from './TabBar.js';
import { TabView } from './TabView.js';
import { CommandPalette } from '../features/command-palette/CommandPalette.js';
import { SettingsDialog } from '../features/settings/SettingsDialog.js';
import { JobCreateDialog } from '../features/jobs/JobCreateDialog.js';
import { ProjectScreen } from '../features/project/ProjectScreen.js';
import { DagView } from '../features/dag/DagView.js';
import { cn } from '../lib/utils.js';

export function App(): React.ReactElement {
  const daemon = useStore(s => s.daemon);
  const settings = useStore(s => s.settings);
  const project = useStore(s => s.project);
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const activeJobId = useStore(s => s.activeJobId);
  const setDaemon = useStore(s => s.setDaemon);
  const setSettings = useStore(s => s.setSettings);
  const setProject = useStore(s => s.setProject);
  const setPaletteOpen = useStore(s => s.setPaletteOpen);

  // Bootstrap: load settings, resolve project, probe daemon.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await soothe().settingsGet();
      if (cancelled) return;
      setSettings(initial);
      applyTheme(initial.theme);

      if (initial.projectPath) {
        try {
          const check = await soothe().projectCheck({ path: initial.projectPath });
          if (!cancelled && check.initialized) {
            setProject({ path: check.path, name: check.name, initialized: true, loading: false });
          } else if (!cancelled) {
            setProject({ path: null, name: '', initialized: false, loading: false });
          }
        } catch {
          if (!cancelled) setProject({ path: null, name: '', initialized: false, loading: false });
        }
      } else {
        if (!cancelled) setProject({ path: null, name: '', initialized: false, loading: false });
      }

      const health = await soothe().daemonHealth();
      if (!cancelled) setDaemon(health);
    })();
    return () => {
      cancelled = true;
    };
  }, [setDaemon, setSettings, setProject]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const interval = setInterval(() => {
      void soothe()
        .daemonHealth()
        .then(setDaemon)
        .catch(() => undefined);
    }, 5_000);
    return () => clearInterval(interval);
  }, [setDaemon]);

  // Wire IPC push channels into the store.
  useEffect(() => {
    const off1 = soothe().onTabEvent((envelope: TabEventEnvelope) => {
      handleTabEvent(envelope);
    });
    const off2 = soothe().onTabStatus((status: TabStatusEvent) => {
      const state = useStore.getState();
      state.patchTab(status.tabId, { status: status.state, error: status.error });
    });
    const off3 = soothe().onAutopilotEvent((envelope: AutopilotEventEnvelope) => {
      handleAutopilotEvent(envelope);
    });
    return () => {
      off1();
      off2();
      off3();
    };
  }, []);

  // Global key bindings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const s = useStore.getState();
        const activeId = s.activeTabId;
        if (!activeId) return;
        s.removeTab(activeId);
        void soothe().tabClose({ tabId: activeId, mode: 'detach' });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  const daemonLive = daemon?.live ?? false;
  const projectReady = project.path !== null && project.initialized;

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="titlebar-drag h-8 flex-none border-b border-border" />
      {project.loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading…
        </div>
      ) : !projectReady ? (
        <ProjectScreen />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar disabled={!daemonLive} />
          <main className="flex flex-1 flex-col overflow-hidden">
            {activeJobId ? (
              <DagView />
            ) : !daemonLive && tabs.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <TabBar />
                <div className={cn('flex-1 overflow-hidden', activeTabId ? '' : 'opacity-70')}>
                  {activeTabId ? (
                    <TabView key={activeTabId} tabId={activeTabId} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {daemonLive
                        ? 'Open a loop from the sidebar or click "New chat".'
                        : 'Daemon disconnected.'}
                    </div>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      )}
      <CommandPalette />
      <SettingsDialog />
      <JobCreateDialog />
    </div>
  );
}

function handleTabEvent(envelope: TabEventEnvelope): void {
  const state = useStore.getState();
  const wire = envelope.event as Record<string, unknown> & { type?: string };
  const wireType = typeof wire.type === 'string' ? wire.type : '';

  // Lifecycle envelopes — flip tab status, never appended as event log entries.
  if (
    wireType === 'subscription_confirmed' ||
    wireType === 'history_replay_complete' ||
    wireType === 'replay_complete' ||
    wireType === 'loop_reattached'
  ) {
    state.patchTab(envelope.tabId, { status: 'ready' });
    return;
  }

  // Acks / status frames the daemon emits for RPC bookkeeping. Drop silently
  // rather than render as debug cards.
  if (
    wireType === 'loop_subscribe_response' ||
    wireType === 'loop_input_response' ||
    wireType === 'loop_new_response' ||
    wireType === 'loop_reattach_response' ||
    wireType === 'loop_detach_response' ||
    wireType === 'skills_list_response' ||
    wireType === 'models_list_response' ||
    wireType === 'config_get_response' ||
    wireType === 'daemon_status_response' ||
    wireType === 'status' ||
    wireType === 'clear'
  ) {
    return;
  }

  // Tool call update batches — unpack individual updates and forward.
  if (wireType === 'tool_call_updates_batch') {
    const updates = wire.updates;
    if (Array.isArray(updates)) {
      for (const update of updates) {
        if (update && typeof update === 'object') {
          forwardInner(envelope.tabId, update as Record<string, unknown>);
        }
      }
    }
    return;
  }

  // Batch envelopes — unpack inner events and forward individually.
  if (wireType === 'event_batch') {
    const events = wire.events ?? wire.data;
    if (Array.isArray(events)) {
      for (const inner of events) {
        if (inner && typeof inner === 'object') {
          forwardInner(envelope.tabId, inner as Record<string, unknown>);
        }
      }
    }
    return;
  }

  // history_replay envelope: {type: "history_replay", events: [...], total_events}.
  // Iterate the array and forward each inner event individually.
  if (wireType === 'history_replay') {
    const events = wire.events;
    if (Array.isArray(events)) {
      for (const inner of events) {
        if (inner && typeof inner === 'object') {
          forwardInner(envelope.tabId, inner as Record<string, unknown>);
        }
      }
    }
    return;
  }

  // `event` envelope per RFC-450: {type:"event", mode, data, namespace, loop_id}.
  // The actual soothe.* event (or AIMessage wire frame) lives in `data`.
  if (wireType === 'event') {
    const mode = wire.mode as string | undefined;
    const data = wire.data;
    if (mode === 'messages' && Array.isArray(data) && data.length > 0) {
      // messages-mode wire_data is a tuple [ai_message_dict, metadata].
      forwardInner(envelope.tabId, data[0] as Record<string, unknown>);
      return;
    }
    if (data && typeof data === 'object') {
      forwardInner(envelope.tabId, data as Record<string, unknown>);
      return;
    }
    return;
  }

  if (!wireType) return;

  // Native soothe.* events (no envelope wrapper) — append directly.
  forwardInner(envelope.tabId, wire as Record<string, unknown>);
}

function handleAutopilotEvent(envelope: AutopilotEventEnvelope): void {
  const state = useStore.getState();
  const event = envelope.event as Record<string, unknown> & { type?: string };
  const eventType = typeof event.type === 'string' ? event.type : '';

  // For event envelopes, extract data
  if (eventType === 'event') {
    const ns = event.namespace as string | undefined;
    const data = event.data as Record<string, unknown> | undefined;
    if (!ns || !data) return;

    if (ns === 'soothe.autopilot.goal.status') {
      const jobId = (data.job_id ?? data.goal_id) as string | undefined;
      if (jobId) {
        const newStatus = data.status as string | undefined;
        if (newStatus) state.updateJob(jobId, { status: newStatus });
      }
    } else if (ns === 'soothe.autopilot.goal.progress') {
      const jobId = (data.job_id ?? data.root_id) as string | undefined;
      if (jobId) {
        const patch: Record<string, unknown> = {};
        if (typeof data.completed_goals === 'number') patch.completed_goals = data.completed_goals;
        if (typeof data.total_goals === 'number') patch.total_goals = data.total_goals;
        if (typeof data.active_goals === 'number') patch.active_goals = data.active_goals;
        if (typeof data.failed_goals === 'number') patch.failed_goals = data.failed_goals;
        if (Object.keys(patch).length > 0) {
          state.updateJob(jobId, patch as Partial<import('@shared/ipc').JobSummary>);
        }
      }
    }
  }
}

function eventFingerprint(ev: Record<string, unknown>): string {
  const d = (ev.data ?? ev) as Record<string, unknown>;
  const keys = Object.keys(d).filter(k => k !== 'timestamp' && k !== 'request_id').sort();
  const vals = keys.map(k => `${k}:${JSON.stringify(d[k])}`.slice(0, 60)).join('|');
  return `${ev.type}#${vals.slice(0, 300)}`;
}

function forwardInner(tabId: string, inner: Record<string, unknown>): void {
  const type = typeof inner.type === 'string' ? inner.type : '';
  if (!type) return;

  // Unwrap `{type: "event", data: {...}}` envelope (arrives from event_batch).
  if (type === 'event') {
    const mode = inner.mode as string | undefined;
    const data = inner.data;
    if (mode === 'messages' && Array.isArray(data) && data.length > 0) {
      forwardInner(tabId, data[0] as Record<string, unknown>);
      return;
    }
    if (data && typeof data === 'object') {
      forwardInner(tabId, data as Record<string, unknown>);
      return;
    }
    return;
  }

  // Drop internal bookkeeping that should never render.
  // Allow soothe.stream.tool_call.update through — used by step card tool rows.
  if (
    type === 'tool_call_updates_batch' ||
    type === 'event_batch' ||
    type === 'status' ||
    type === 'clear' ||
    type.endsWith('_response') ||
    (type.startsWith('soothe.stream.') && type !== 'soothe.stream.tool_call.update') ||
    type.startsWith('soothe.internal.')
  ) {
    return;
  }

  const state = useStore.getState();

  // Deduplicate: batched replays can echo events already received via streaming.
  const tab = state.tabs.find(t => t.tabId === tabId);
  if (tab && tab.events.length > 0) {
    const recent = tab.events.slice(-15);
    const innerData = (inner.data ?? inner) as Record<string, unknown>;
    const eventId = innerData.event_id ?? innerData.step_id ?? innerData.tool_call_id;

    const isDup = recent.some(e => {
      if (e.event.type !== type) return false;
      const d = (e.event.data ?? e.event) as Record<string, unknown>;
      // Match by identity field if available.
      if (eventId && typeof eventId === 'string') {
        return (d.event_id ?? d.step_id ?? d.tool_call_id) === eventId;
      }
      // Fall back to shallow content comparison for events without IDs
      // (e.g. reasoning, plan.decision, goal events).
      return eventFingerprint(e.event) === eventFingerprint(inner);
    });
    if (isDup) return;
  }

  // First user-side message on a generic-title tab — promote to a real title.
  if (type === 'human' || type === 'HumanMessage' || type === 'HumanMessageChunk') {
    const text = extractFlatText(inner);
    if (text) {
      const tab = state.tabs.find(t => t.tabId === tabId);
      const generic =
        !tab?.title ||
        tab.title === 'New chat' ||
        /^[0-9a-f]{8}/.test(tab.title) ||
        tab.title.startsWith(tab.loopId.slice(0, 8));
      if (tab && generic) {
        state.patchTab(tabId, { title: text.slice(0, 60) });
      }
      if (tab) {
        state.patchLoop(tab.loopId, { hasUserMessage: true, title: text.slice(0, 60) });
        state.bumpLoopsRefreshHint();
      }
    }
  }

  // Agent running state bookkeeping.
  if (type === 'soothe.cognition.agent_loop.started') {
    state.patchTab(tabId, { isRunning: true });
    const tab = state.tabs.find(t => t.tabId === tabId);
    if (tab) state.patchLoop(tab.loopId, { status: 'running' });
  } else if (
    type === 'soothe.cognition.agent_loop.completed' ||
    type === 'soothe.cognition.agent_loop.cancelled' ||
    type === 'soothe.cognition.agent_loop.error'
  ) {
    state.patchTab(tabId, { isRunning: false });
    const tab = state.tabs.find(t => t.tabId === tabId);
    if (tab) state.patchLoop(tab.loopId, { status: 'idle' });
  }

  // Clarification lifecycle bookkeeping.
  if (type === 'soothe.loop.clarification.requested') {
    const data = (inner.data ?? inner) as Record<string, unknown>;
    const questions = extractClarificationQuestions(data);
    state.setClarification(tabId, {
      questions,
      status: 'pending',
      originStepId:
        (data.origin_step_id as string | undefined) ?? (data.step_id as string | undefined),
      mode: (data.mode as 'auto' | 'manual' | undefined) ?? undefined,
    });
  } else if (
    type === 'soothe.loop.clarification.answered' ||
    type === 'soothe.loop.clarification.deferred'
  ) {
    const tab = state.tabs.find(t => t.tabId === tabId);
    if (tab?.clarification) {
      state.setClarification(tabId, { ...tab.clarification, status: 'resolved' });
    } else {
      state.setClarification(tabId, undefined);
    }
  }

  state.appendTabEvent(tabId, inner as Record<string, unknown> & { type: string });
}

function extractFlatText(event: Record<string, unknown>): string {
  const direct = event.content ?? event.text;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) {
    return direct
      .map(seg => {
        if (typeof seg === 'string') return seg;
        if (seg && typeof seg === 'object' && typeof (seg as { text?: string }).text === 'string') {
          return (seg as { text: string }).text;
        }
        return '';
      })
      .join('\n');
  }
  const data = event.data;
  if (data && typeof data === 'object') {
    return extractFlatText(data as Record<string, unknown>);
  }
  return '';
}

function extractClarificationQuestions(data: Record<string, unknown>): string[] {
  const raw = data.questions ?? data.queries ?? data.prompts;
  if (Array.isArray(raw)) {
    return raw
      .map(q => (typeof q === 'string' ? q : (q as { question?: string })?.question))
      .filter((q): q is string => typeof q === 'string' && q.length > 0);
  }
  if (typeof raw === 'string') return [raw];
  return ['Please clarify'];
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export { makeTab } from '../state/store.js';
