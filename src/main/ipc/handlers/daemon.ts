import { ipcMain, dialog, BrowserWindow } from 'electron';
import { Channels, type SettingsPatch } from '@shared/ipc';
import { probeDaemon } from '../../daemon/health.js';
import { getSettings, patchSettings } from '../../daemon/settings.js';

export function registerDaemonHandlers(): void {
  ipcMain.handle(Channels.DaemonHealth, async () => probeDaemon());
  ipcMain.handle(Channels.SettingsGet, async () => getSettings());
  ipcMain.handle(Channels.SettingsSet, async (_evt, patch: SettingsPatch) => patchSettings(patch));
  ipcMain.handle(Channels.SelectFolder, async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const result = await dialog.showOpenDialog({
      ...(win ? { parentWindow: win } : {}),
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Workspace',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
