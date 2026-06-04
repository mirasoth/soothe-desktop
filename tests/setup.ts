import '@testing-library/react';

// Minimal stub for the preload-exposed bridge so renderer code can run in jsdom.
(globalThis as { window?: Window }).window = (globalThis as { window?: Window }).window ?? (globalThis as unknown as Window);
const win = globalThis.window as Window & { soothe?: unknown };
if (!win.soothe) {
  win.soothe = {
    daemonHealth: async () => ({ live: false, url: 'ws://localhost:8765' }),
    loopsList: async () => ({ loops: [] }),
    loopsDelete: async ({ loopId }: { loopId: string }) => ({ loopId, success: true }),
    skillsList: async () => ({ skills: [] }),
    tabOpen: async () => ({ tabId: 'test-tab', loopId: 'test-loop' }),
    tabInput: async () => undefined,
    tabCommand: async () => undefined,
    tabClose: async () => undefined,
    settingsGet: async () => ({
      daemonUrl: 'ws://127.0.0.1:8765',
      theme: 'system',
      windowBounds: { width: 1280, height: 800 },
    }),
    settingsSet: async (patch: unknown) => ({
      daemonUrl: 'ws://127.0.0.1:8765',
      theme: 'system',
      windowBounds: { width: 1280, height: 800 },
      ...(patch as object),
    }),
    onTabEvent: () => () => undefined,
    onTabStatus: () => () => undefined,
  };
}
