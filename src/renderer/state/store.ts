import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Attachment,
  DaemonHealthResponse,
  LoopSummary,
  Settings,
  SkillEntry,
  TabConnectionState,
} from '@shared/ipc';
import { DefaultSettings } from '@shared/ipc';

export interface EventLogEntry {
  id: string;
  event: Record<string, unknown> & { type: string };
  receivedAt: number;
}

export type ClarificationStatus = 'pending' | 'resolved';

export interface ClarificationState {
  questions: string[];
  status: ClarificationStatus;
  originStepId?: string;
  mode?: 'auto' | 'manual';
}

export interface TabState {
  tabId: string;
  loopId: string;
  title: string;
  status: TabConnectionState;
  error?: string;
  events: EventLogEntry[];
  draft: string;
  attachments: Attachment[];
  clarification?: ClarificationState;
  skills: SkillEntry[];
  clarificationMode: 'auto' | 'manual';
  /** soothe.loop.clarification.requested marks streamEndsSuppressed=true until answered */
  streamEndSuppressed: boolean;
  createdAt: number;
}

export interface StoreState {
  daemon: DaemonHealthResponse | null;
  settings: Settings;
  loops: LoopSummary[];
  loopsLoading: boolean;
  loopsError?: string;
  tabs: TabState[];
  activeTabId?: string;
  paletteOpen: boolean;
  settingsOpen: boolean;

  // mutations
  setDaemon(health: DaemonHealthResponse | null): void;
  setSettings(s: Settings): void;
  setLoops(loops: LoopSummary[]): void;
  setLoopsError(error?: string): void;
  setLoopsLoading(loading: boolean): void;
  addTab(tab: TabState): void;
  removeTab(tabId: string): void;
  setActiveTab(tabId?: string): void;
  patchTab(tabId: string, patch: Partial<TabState>): void;
  appendTabEvent(tabId: string, event: Record<string, unknown> & { type: string }): void;
  setDraft(tabId: string, draft: string): void;
  setAttachments(tabId: string, attachments: Attachment[]): void;
  addAttachment(tabId: string, attachment: Attachment): void;
  removeAttachment(tabId: string, index: number): void;
  setClarification(tabId: string, c: ClarificationState | undefined): void;
  toggleClarificationMode(tabId: string): void;
  setSkills(tabId: string, skills: SkillEntry[]): void;
  setPaletteOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
}

let eventCounter = 0;
const nextEventId = (): string => {
  eventCounter += 1;
  return `${Date.now().toString(36)}-${eventCounter.toString(36)}`;
};

export const useStore = create<StoreState>()(
  subscribeWithSelector(set => ({
    daemon: null,
    settings: DefaultSettings,
    loops: [],
    loopsLoading: false,
    tabs: [],
    paletteOpen: false,
    settingsOpen: false,
    setDaemon: health => set({ daemon: health }),
    setSettings: settings => set({ settings }),
    setLoops: loops => set({ loops, loopsError: undefined }),
    setLoopsError: error => set({ loopsError: error }),
    setLoopsLoading: loading => set({ loopsLoading: loading }),
    addTab: tab =>
      set(state => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.tabId,
      })),
    removeTab: tabId =>
      set(state => {
        const tabs = state.tabs.filter(t => t.tabId !== tabId);
        const nextActive =
          state.activeTabId === tabId ? tabs[tabs.length - 1]?.tabId : state.activeTabId;
        return { tabs, activeTabId: nextActive };
      }),
    setActiveTab: tabId => set({ activeTabId: tabId }),
    patchTab: (tabId, patch) =>
      set(state => ({
        tabs: state.tabs.map(t => (t.tabId === tabId ? { ...t, ...patch } : t)),
      })),
    appendTabEvent: (tabId, event) =>
      set(state => ({
        tabs: state.tabs.map(t =>
          t.tabId === tabId
            ? {
                ...t,
                events: [...t.events, { id: nextEventId(), event, receivedAt: Date.now() }],
              }
            : t,
        ),
      })),
    setDraft: (tabId, draft) =>
      set(state => ({
        tabs: state.tabs.map(t => (t.tabId === tabId ? { ...t, draft } : t)),
      })),
    setAttachments: (tabId, attachments) =>
      set(state => ({
        tabs: state.tabs.map(t => (t.tabId === tabId ? { ...t, attachments } : t)),
      })),
    addAttachment: (tabId, attachment) =>
      set(state => ({
        tabs: state.tabs.map(t =>
          t.tabId === tabId ? { ...t, attachments: [...t.attachments, attachment] } : t,
        ),
      })),
    removeAttachment: (tabId, index) =>
      set(state => ({
        tabs: state.tabs.map(t =>
          t.tabId === tabId
            ? { ...t, attachments: t.attachments.filter((_, i) => i !== index) }
            : t,
        ),
      })),
    setClarification: (tabId, clarification) =>
      set(state => ({
        tabs: state.tabs.map(t =>
          t.tabId === tabId
            ? {
                ...t,
                clarification,
                streamEndSuppressed: clarification?.status === 'pending',
              }
            : t,
        ),
      })),
    toggleClarificationMode: tabId =>
      set(state => ({
        tabs: state.tabs.map(t =>
          t.tabId === tabId
            ? { ...t, clarificationMode: t.clarificationMode === 'auto' ? 'manual' : 'auto' }
            : t,
        ),
      })),
    setSkills: (tabId, skills) =>
      set(state => ({
        tabs: state.tabs.map(t => (t.tabId === tabId ? { ...t, skills } : t)),
      })),
    setPaletteOpen: open => set({ paletteOpen: open }),
    setSettingsOpen: open => set({ settingsOpen: open }),
  })),
);

export function makeTab(args: { tabId: string; loopId: string; title?: string }): TabState {
  return {
    tabId: args.tabId,
    loopId: args.loopId,
    title: args.title ?? args.loopId.slice(0, 8),
    status: 'connecting',
    events: [],
    draft: '',
    attachments: [],
    skills: [],
    clarificationMode: 'auto',
    streamEndSuppressed: false,
    createdAt: Date.now(),
  };
}
