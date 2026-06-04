import { useEffect } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore } from '../state/store.js';
import type { TabEventEnvelope, TabStatusEvent } from '@shared/ipc';
import { EmptyState } from './EmptyState.js';
import { Sidebar } from './Sidebar.js';
import { TabBar } from './TabBar.js';
import { TabView } from './TabView.js';
import { CommandPalette } from '../features/command-palette/CommandPalette.js';
import { SettingsDialog } from '../features/settings/SettingsDialog.js';
import { cn } from '../lib/utils.js';

export function App(): React.ReactElement {
  const daemon = useStore(s => s.daemon);
  const settings = useStore(s => s.settings);
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const setDaemon = useStore(s => s.setDaemon);
  const setSettings = useStore(s => s.setSettings);
  const setPaletteOpen = useStore(s => s.setPaletteOpen);

  // Bootstrap: load settings, probe daemon, poll periodically.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await soothe().settingsGet();
      if (cancelled) return;
      setSettings(initial);
      applyTheme(initial.theme);
      const health = await soothe().daemonHealth();
      if (!cancelled) setDaemon(health);
    })();
    return () => {
      cancelled = true;
    };
  }, [setDaemon, setSettings]);

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
    return () => {
      off1();
      off2();
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

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="titlebar-drag h-8 flex-none border-b border-border" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar disabled={!daemonLive} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {!daemonLive && tabs.length === 0 ? (
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
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}

function handleTabEvent(envelope: TabEventEnvelope): void {
  const state = useStore.getState();
  const wire = envelope.event as Record<string, unknown> & { type?: string };
  const wireType = typeof wire.type === 'string' ? wire.type : '';

  // Lifecycle envelopes — flip tab status, never appended as event log entries.
  if (wireType === 'subscription_confirmed' || wireType === 'history_replay_complete') {
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
    wireType === 'status' ||
    wireType === 'clear'
  ) {
    return;
  }

  // history_replay envelope wraps an inner event under "event".
  if (wireType === 'history_replay' && typeof wire.event === 'object' && wire.event !== null) {
    forwardInner(envelope.tabId, wire.event as Record<string, unknown>);
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

function forwardInner(tabId: string, inner: Record<string, unknown>): void {
  const type = typeof inner.type === 'string' ? inner.type : '';
  if (!type) return;
  const state = useStore.getState();

  // First HumanMessage on a generic-title tab — promote to a real title.
  if (type === 'HumanMessage' || type === 'human' || type === 'HumanMessageChunk') {
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
    }
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
      .join('');
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
