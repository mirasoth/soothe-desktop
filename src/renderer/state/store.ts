import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Attachment,
  DaemonHealthResponse,
  JobSummary,
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
  isRunning: boolean;
  createdAt: number;
}

export interface ProjectState {
  path: string | null;
  name: string;
  initialized: boolean;
  loading: boolean;
}

export interface StoreState {
  daemon: DaemonHealthResponse | null;
  settings: Settings;
  project: ProjectState;
  loops: LoopSummary[];
  loopsLoading: boolean;
  loopsError?: string;
  tabs: TabState[];
  /**
   * Buffer for events that arrive (via tab:event IPC) before the renderer has
   * called addTab for the matching tabId. Drained into the tab's events array
   * by addTab to fix the race where `loop_reattach` history_replay frames
   * stream in before the tabOpen IPC response completes the renderer's addTab.
   */
  pendingEvents: Record<string, EventLogEntry[]>;
  activeTabId?: string;
  jobs: JobSummary[];
  jobsLoading: boolean;
  jobsError?: string;
  activeJobId?: string;
  autopilotSubscribed: boolean;
  jobCreateOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;

  // mutations
  setDaemon(health: DaemonHealthResponse | null): void;
  setSettings(s: Settings): void;
  setProject(project: ProjectState): void;
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
  setJobs(jobs: JobSummary[]): void;
  setJobsLoading(loading: boolean): void;
  setJobsError(error?: string): void;
  setActiveJobId(jobId?: string): void;
  setAutopilotSubscribed(subscribed: boolean): void;
  setJobCreateOpen(open: boolean): void;
  updateJob(jobId: string, patch: Partial<JobSummary>): void;
  addJob(job: JobSummary): void;
  removeJob(jobId: string): void;
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
    project: { path: null, name: '', initialized: false, loading: true },
    loops: [],
    loopsLoading: false,
    tabs: [],
    pendingEvents: {},
    jobs: [],
    jobsLoading: false,
    autopilotSubscribed: false,
    jobCreateOpen: false,
    paletteOpen: false,
    settingsOpen: false,
    setDaemon: health => set({ daemon: health }),
    setSettings: settings => set({ settings }),
    setProject: project => set({ project }),
    setLoops: loops => set({ loops, loopsError: undefined }),
    setLoopsError: error => set({ loopsError: error }),
    setLoopsLoading: loading => set({ loopsLoading: loading }),
    addTab: tab =>
      set(state => {
        // Drain any events that arrived for this tabId before addTab ran
        // (history_replay race after loop_reattach).
        const buffered = state.pendingEvents[tab.tabId] ?? [];
        const seeded = buffered.length > 0 ? { ...tab, events: [...tab.events, ...buffered] } : tab;
        const { [tab.tabId]: _drained, ...remaining } = state.pendingEvents;
        void _drained;
        return {
          tabs: [...state.tabs, seeded],
          activeTabId: tab.tabId,
          pendingEvents: remaining,
        };
      }),
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
      set(state => {
        const entry: EventLogEntry = { id: nextEventId(), event, receivedAt: Date.now() };
        const tabIdx = state.tabs.findIndex(t => t.tabId === tabId);
        if (tabIdx === -1) {
          // Tab not registered yet — buffer the event so addTab can drain it.
          const prev = state.pendingEvents[tabId] ?? [];
          return { pendingEvents: { ...state.pendingEvents, [tabId]: [...prev, entry] } };
        }
        const tabs = state.tabs.slice();
        const tab = tabs[tabIdx]!;
        tabs[tabIdx] = { ...tab, events: [...tab.events, entry] };
        return { tabs };
      }),
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
    setJobs: jobs => set({ jobs, jobsError: undefined }),
    setJobsLoading: loading => set({ jobsLoading: loading }),
    setJobsError: error => set({ jobsError: error }),
    setActiveJobId: jobId => set({ activeJobId: jobId }),
    setAutopilotSubscribed: subscribed => set({ autopilotSubscribed: subscribed }),
    setJobCreateOpen: open => set({ jobCreateOpen: open }),
    updateJob: (jobId, patch) =>
      set(state => ({
        jobs: state.jobs.map(j => (j.id === jobId ? { ...j, ...patch } : j)),
      })),
    addJob: job =>
      set(state => ({
        jobs: [job, ...state.jobs],
      })),
    removeJob: jobId =>
      set(state => ({
        jobs: state.jobs.filter(j => j.id !== jobId),
        activeJobId: state.activeJobId === jobId ? undefined : state.activeJobId,
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
    isRunning: false,
    createdAt: Date.now(),
  };
}
