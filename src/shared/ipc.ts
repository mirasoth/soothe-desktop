/**
 * IPC contract — channel names and payload types shared by main, preload, and renderer.
 * Defined per RFC-505 §8.1.
 */

export const Channels = {
  DaemonHealth: 'daemon:health',
  LoopsList: 'loops:list',
  LoopsDelete: 'loops:delete',
  LoopsMessages: 'loops:messages',
  SkillsList: 'skills:list',
  TabOpen: 'tab:open',
  TabInput: 'tab:input',
  TabCommand: 'tab:command',
  TabClose: 'tab:close',
  TabEvent: 'tab:event',
  TabStatus: 'tab:status',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  JobsCreate: 'jobs:create',
  JobsStatus: 'jobs:status',
  JobsPause: 'jobs:pause',
  JobsResume: 'jobs:resume',
  JobsCancel: 'jobs:cancel',
  JobsDag: 'jobs:dag',
  JobGuidance: 'job:guidance',
  AutopilotSubscribe: 'autopilot:subscribe',
  AutopilotUnsubscribe: 'autopilot:unsubscribe',
  AutopilotEvent: 'autopilot:event',
  SelectFolder: 'dialog:selectFolder',
  ProjectCheck: 'project:check',
  ProjectInit: 'project:init',
  DaemonLifecycle: 'daemon:lifecycle',
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

export interface DaemonLifecycleStatus {
  managed: boolean;
  processRunning: boolean;
  pid: number | null;
  restartCount: number;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

export interface LoopSummary {
  loop_id: string;
  status?: string;
  client_workspace?: string;
  current_workspace?: string;
  /** Number of CoreAgent threads bound to the loop (0 = never used). */
  threads?: number;
  /** Total goals completed by the loop. */
  goals?: number;
  /** Total thread switches. */
  switches?: number;
  total_goals_completed?: number;
  total_tokens_used?: number;
  /** Truncated ISO string from daemon's loop_list (e.g. "2026-06-04T07:27"). */
  created?: string;
  last_message_at?: string | number | null;
  created_at?: string | number | null;
  is_ephemeral?: boolean;
  /** Sidebar-derived: first user message preview, used as tab title on open. */
  title?: string;
  /** Sidebar-derived: latest conversational message, prefixed You:/AI:. */
  latestPreview?: string;
  /** Sidebar-derived: true if at least one human/user message is recorded. */
  hasUserMessage?: boolean;
  [key: string]: unknown;
}

export interface LoopMessageRow {
  timestamp: string;
  kind: string;
  role: 'user' | 'assistant' | 'system' | null;
  content: string;
  [key: string]: unknown;
}

export interface LoopsMessagesRequest {
  loopId: string;
  limit?: number;
}

export interface LoopsMessagesResponse {
  loopId: string;
  messages: LoopMessageRow[];
  error?: string;
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
  projectPath?: string;
  windowBounds?: { x?: number; y?: number; width: number; height: number };
}

export type SettingsPatch = Partial<Settings>;

export const DefaultSettings: Settings = {
  daemonUrl: 'ws://127.0.0.1:8765',
  theme: 'light',
  windowBounds: { width: 1280, height: 800 },
};

// ---------------------------------------------------------------------------
// Jobs (RFC-228)
// ---------------------------------------------------------------------------

export interface JobCreateRequest {
  goal: string;
  verificationRules?: string;
}

export interface JobCreateIpcResponse {
  job_id: string;
  status: string;
  error?: string;
}

export interface JobIdRequest {
  jobId: string;
}

export interface JobStatusIpcResponse {
  job_id: string;
  status: string;
  active_goals: number;
  completed_goals: number;
  failed_goals: number;
  total_goals: number;
  workers: Array<{ goal_id: string; loop_id: string }>;
  last_error?: string;
  error?: string;
}

export interface JobActionIpcResponse {
  job_id: string;
  status: string;
  error?: string;
}

export interface DagNodeIpc {
  id: string;
  description: string;
  status: string;
  priority: number;
  depends_on: string[];
  assigned_loop_id?: string;
  steps_completed: number;
  steps_total: number;
  tool_calls: number;
  summary?: string;
  findings?: string[];
}

export interface DagEdgeIpc {
  source: string;
  target: string;
}

export interface JobDagIpcResponse {
  job_id: string;
  dag: {
    nodes: DagNodeIpc[];
    edges: DagEdgeIpc[];
    root_id: string;
  };
  error?: string;
}

export interface JobGuidanceRequest {
  jobId: string;
  goalId?: string;
  text: string;
}

export interface JobGuidanceIpcResponse {
  job_id: string;
  goal_id?: string;
  absorbed: boolean;
  error?: string;
}

export interface AutopilotSubscribeIpcResponse {
  subscribed: boolean;
  error?: string;
}

export interface AutopilotEventEnvelope {
  event: Record<string, unknown>;
}

export interface JobSummary {
  id: string;
  goal: string;
  status: string;
  active_goals: number;
  completed_goals: number;
  failed_goals: number;
  total_goals: number;
  last_error?: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Project (RFC-700)
// ---------------------------------------------------------------------------

export interface ProjectCheckRequest {
  path: string;
}

export interface ProjectCheckResponse {
  path: string;
  initialized: boolean;
  name: string;
  error?: string;
}

export interface ProjectInitRequest {
  path: string;
}

export interface ProjectInitResponse {
  path: string;
  name: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Bridge surface — what preload exposes on window.soothe.
// ---------------------------------------------------------------------------

export interface SootheBridge {
  daemonHealth(): Promise<DaemonHealthResponse>;
  daemonLifecycle(): Promise<DaemonLifecycleStatus>;
  loopsList(): Promise<LoopsListResponse>;
  loopsDelete(req: LoopsDeleteRequest): Promise<LoopsDeleteResponse>;
  loopsMessages(req: LoopsMessagesRequest): Promise<LoopsMessagesResponse>;
  skillsList(req: SkillsListRequest): Promise<SkillsListResponse>;
  tabOpen(req: TabOpenRequest): Promise<TabOpenResponse>;
  tabInput(req: TabInputRequest): Promise<void>;
  tabCommand(req: TabCommandRequest): Promise<void>;
  tabClose(req: TabCloseRequest): Promise<void>;
  settingsGet(): Promise<Settings>;
  settingsSet(patch: SettingsPatch): Promise<Settings>;
  selectFolder(): Promise<string | null>;
  projectCheck(req: ProjectCheckRequest): Promise<ProjectCheckResponse>;
  projectInit(req: ProjectInitRequest): Promise<ProjectInitResponse>;
  jobCreate(req: JobCreateRequest): Promise<JobCreateIpcResponse>;
  jobStatus(req: JobIdRequest): Promise<JobStatusIpcResponse>;
  jobPause(req: JobIdRequest): Promise<JobActionIpcResponse>;
  jobResume(req: JobIdRequest): Promise<JobActionIpcResponse>;
  jobCancel(req: JobIdRequest): Promise<JobActionIpcResponse>;
  jobDag(req: JobIdRequest): Promise<JobDagIpcResponse>;
  jobGuidance(req: JobGuidanceRequest): Promise<JobGuidanceIpcResponse>;
  autopilotSubscribe(): Promise<AutopilotSubscribeIpcResponse>;
  autopilotUnsubscribe(): Promise<AutopilotSubscribeIpcResponse>;
  onTabEvent(handler: (envelope: TabEventEnvelope) => void): () => void;
  onTabStatus(handler: (status: TabStatusEvent) => void): () => void;
  onAutopilotEvent(handler: (envelope: AutopilotEventEnvelope) => void): () => void;
}
