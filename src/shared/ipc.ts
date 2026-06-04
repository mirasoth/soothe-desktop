/**
 * IPC contract — channel names and payload types shared by main, preload, and renderer.
 * Defined per RFC-505 §8.1.
 */

export const Channels = {
  DaemonHealth: 'daemon:health',
  LoopsList: 'loops:list',
  LoopsDelete: 'loops:delete',
  SkillsList: 'skills:list',
  TabOpen: 'tab:open',
  TabInput: 'tab:input',
  TabCommand: 'tab:command',
  TabClose: 'tab:close',
  TabEvent: 'tab:event',
  TabStatus: 'tab:status',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
} as const;

export type ChannelName = (typeof Channels)[keyof typeof Channels];

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

export interface DaemonHealthResponse {
  live: boolean;
  version?: string;
  error?: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

export interface LoopSummary {
  loop_id: string;
  status?: string;
  client_workspace?: string;
  current_workspace?: string;
  total_goals_completed?: number;
  total_tokens_used?: number;
  last_message_at?: string | number | null;
  created_at?: string | number | null;
  is_ephemeral?: boolean;
  /** Sidebar-derived: first user message preview, when one exists. */
  title?: string;
  /** Sidebar-derived: true if at least one human/user message is recorded. */
  hasUserMessage?: boolean;
  [key: string]: unknown;
}

export interface LoopsListResponse {
  loops: LoopSummary[];
  error?: string;
}

export interface LoopsDeleteRequest {
  loopId: string;
}

export interface LoopsDeleteResponse {
  loopId: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabOpenRequest {
  loopId?: string;
}

export interface TabOpenResponse {
  tabId: string;
  loopId: string;
  error?: string;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface TabInputRequest {
  tabId: string;
  text: string;
  attachments?: Attachment[];
  clarificationAnswer?: boolean;
  intentHint?: string;
  modelOverride?: string;
}

export interface TabCommandRequest {
  tabId: string;
  cmd: string;
}

export type TabCloseMode = 'detach' | 'delete';

export interface TabCloseRequest {
  tabId: string;
  mode: TabCloseMode;
}

export type TabConnectionState = 'connecting' | 'ready' | 'reconnecting' | 'error';

export interface TabStatusEvent {
  tabId: string;
  state: TabConnectionState;
  error?: string;
}

export interface TabEventEnvelope {
  tabId: string;
  event: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillEntry {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface SkillsListRequest {
  tabId: string;
}

export interface SkillsListResponse {
  skills: SkillEntry[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  daemonUrl: string;
  theme: ThemeMode;
  windowBounds?: { x?: number; y?: number; width: number; height: number };
}

export type SettingsPatch = Partial<Settings>;

export const DefaultSettings: Settings = {
  daemonUrl: 'ws://127.0.0.1:8765',
  theme: 'system',
  windowBounds: { width: 1280, height: 800 },
};

// ---------------------------------------------------------------------------
// Bridge surface — what preload exposes on window.soothe.
// ---------------------------------------------------------------------------

export interface SootheBridge {
  daemonHealth(): Promise<DaemonHealthResponse>;
  loopsList(): Promise<LoopsListResponse>;
  loopsDelete(req: LoopsDeleteRequest): Promise<LoopsDeleteResponse>;
  skillsList(req: SkillsListRequest): Promise<SkillsListResponse>;
  tabOpen(req: TabOpenRequest): Promise<TabOpenResponse>;
  tabInput(req: TabInputRequest): Promise<void>;
  tabCommand(req: TabCommandRequest): Promise<void>;
  tabClose(req: TabCloseRequest): Promise<void>;
  settingsGet(): Promise<Settings>;
  settingsSet(patch: SettingsPatch): Promise<Settings>;
  onTabEvent(handler: (envelope: TabEventEnvelope) => void): () => void;
  onTabStatus(handler: (status: TabStatusEvent) => void): () => void;
}
