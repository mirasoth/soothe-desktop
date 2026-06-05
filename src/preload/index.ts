import { contextBridge, ipcRenderer } from 'electron';
import {
  Channels,
  type SootheBridge,
  type SettingsPatch,
  type TabCloseRequest,
  type TabCommandRequest,
  type TabEventEnvelope,
  type TabInputRequest,
  type TabOpenRequest,
  type TabStatusEvent,
  type SkillsListRequest,
  type LoopsDeleteRequest,
  type LoopsMessagesRequest,
  type JobCreateRequest,
  type JobIdRequest,
  type JobGuidanceRequest,
  type AutopilotEventEnvelope,
  type ProjectCheckRequest,
  type ProjectInitRequest,
} from '../shared/ipc.js';

const bridge: SootheBridge = {
  daemonHealth: () => ipcRenderer.invoke(Channels.DaemonHealth),
  daemonLifecycle: () => ipcRenderer.invoke(Channels.DaemonLifecycle),
  loopsList: () => ipcRenderer.invoke(Channels.LoopsList),
  loopsDelete: (req: LoopsDeleteRequest) => ipcRenderer.invoke(Channels.LoopsDelete, req),
  loopsMessages: (req: LoopsMessagesRequest) => ipcRenderer.invoke(Channels.LoopsMessages, req),
  skillsList: (req: SkillsListRequest) => ipcRenderer.invoke(Channels.SkillsList, req),
  tabOpen: (req: TabOpenRequest) => ipcRenderer.invoke(Channels.TabOpen, req),
  tabInput: (req: TabInputRequest) => ipcRenderer.invoke(Channels.TabInput, req),
  tabCommand: (req: TabCommandRequest) => ipcRenderer.invoke(Channels.TabCommand, req),
  tabClose: (req: TabCloseRequest) => ipcRenderer.invoke(Channels.TabClose, req),
  settingsGet: () => ipcRenderer.invoke(Channels.SettingsGet),
  settingsSet: (patch: SettingsPatch) => ipcRenderer.invoke(Channels.SettingsSet, patch),
  selectFolder: () => ipcRenderer.invoke(Channels.SelectFolder),
  projectCheck: (req: ProjectCheckRequest) => ipcRenderer.invoke(Channels.ProjectCheck, req),
  projectInit: (req: ProjectInitRequest) => ipcRenderer.invoke(Channels.ProjectInit, req),
  jobCreate: (req: JobCreateRequest) => ipcRenderer.invoke(Channels.JobsCreate, req),
  jobStatus: (req: JobIdRequest) => ipcRenderer.invoke(Channels.JobsStatus, req),
  jobPause: (req: JobIdRequest) => ipcRenderer.invoke(Channels.JobsPause, req),
  jobResume: (req: JobIdRequest) => ipcRenderer.invoke(Channels.JobsResume, req),
  jobCancel: (req: JobIdRequest) => ipcRenderer.invoke(Channels.JobsCancel, req),
  jobDag: (req: JobIdRequest) => ipcRenderer.invoke(Channels.JobsDag, req),
  jobGuidance: (req: JobGuidanceRequest) => ipcRenderer.invoke(Channels.JobGuidance, req),
  autopilotSubscribe: () => ipcRenderer.invoke(Channels.AutopilotSubscribe),
  autopilotUnsubscribe: () => ipcRenderer.invoke(Channels.AutopilotUnsubscribe),
  onTabEvent(handler) {
    const listener = (_evt: unknown, envelope: TabEventEnvelope) => handler(envelope);
    ipcRenderer.on(Channels.TabEvent, listener);
    return () => {
      ipcRenderer.removeListener(Channels.TabEvent, listener);
    };
  },
  onTabStatus(handler) {
    const listener = (_evt: unknown, status: TabStatusEvent) => handler(status);
    ipcRenderer.on(Channels.TabStatus, listener);
    return () => {
      ipcRenderer.removeListener(Channels.TabStatus, listener);
    };
  },
  onAutopilotEvent(handler) {
    const listener = (_evt: unknown, envelope: AutopilotEventEnvelope) => handler(envelope);
    ipcRenderer.on(Channels.AutopilotEvent, listener);
    return () => {
      ipcRenderer.removeListener(Channels.AutopilotEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld('soothe', bridge);

declare global {
  interface Window {
    soothe: SootheBridge;
  }
}
