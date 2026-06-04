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
} from '../shared/ipc.js';

const bridge: SootheBridge = {
  daemonHealth: () => ipcRenderer.invoke(Channels.DaemonHealth),
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
};

contextBridge.exposeInMainWorld('soothe', bridge);

declare global {
  interface Window {
    soothe: SootheBridge;
  }
}
