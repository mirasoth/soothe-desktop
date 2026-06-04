import { useEffect } from 'react';
import { soothe } from '../lib/ipc.js';
import { useStore, makeTab } from '../state/store.js';
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
  const event = envelope.event as Record<string, unknown> & { type?: string };
  const type = typeof event.type === 'string' ? event.type : '';

  // history_replay frames carry an inner event under "event"
  if (type === 'history_replay' && typeof event.event === 'object' && event.event !== null) {
    const inner = event.event as Record<string, unknown> & { type?: string };
    if (typeof inner.type === 'string') {
      state.appendTabEvent(envelope.tabId, inner as Record<string, unknown> & { type: string });
      return;
    }
  }

  if (type === 'subscription_confirmed' || type === 'history_replay_complete') {
    state.patchTab(envelope.tabId, { status: 'ready' });
    return;
  }

  if (!type) return;

  // Clarification lifecycle hook (full handling in event renderers, but track state)
  if (type === 'soothe.loop.clarification.requested') {
    const data = (event.data ?? event) as Record<string, unknown>;
    const questions = extractClarificationQuestions(data);
    state.setClarification(envelope.tabId, {
      questions,
      status: 'pending',
      originStepId: (data.origin_step_id as string | undefined) ?? (data.step_id as string | undefined),
      mode: (data.mode as 'auto' | 'manual' | undefined) ?? undefined,
    });
  } else if (
    type === 'soothe.loop.clarification.answered' ||
    type === 'soothe.loop.clarification.deferred'
  ) {
    const tab = state.tabs.find(t => t.tabId === envelope.tabId);
    if (tab?.clarification) {
      state.setClarification(envelope.tabId, { ...tab.clarification, status: 'resolved' });
    } else {
      state.setClarification(envelope.tabId, undefined);
    }
  }

  state.appendTabEvent(envelope.tabId, event as Record<string, unknown> & { type: string });
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

// Helper exported for tab module to construct tabs consistently.
export { makeTab };
