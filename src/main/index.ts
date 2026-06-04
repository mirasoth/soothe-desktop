import { app, BrowserWindow, nativeImage } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from './windowing.js';
import { registerDaemonHandlers } from './ipc/handlers/daemon.js';
import { registerTabHandlers, disposeAllTabs } from './ipc/handlers/tab.js';
import { registerLoopsHandlers } from './ipc/handlers/loops.js';
import { registerSkillsHandlers } from './ipc/handlers/skills.js';

app.setName('Soothe');

// Packaged builds carry the platform-native icon via electron-builder
// (build/icon.icns, build/icon.ico, build/icon.png). Dev runs would otherwise
// show the default Electron icon — point the macOS dock at our source PNG.
if (!app.isPackaged && process.platform === 'darwin') {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const devIcon = nativeImage.createFromPath(join(here, '../../build/icon.png'));
  if (!devIcon.isEmpty()) {
    app.dock?.setIcon(devIcon);
  }
}

// Enable Chrome DevTools Protocol on a fixed port when debugging is requested.
// Useful for attaching external CDP clients (chrome-devtools MCP, etc.).
if (process.env.SOOTHE_DEVTOOLS === '1' || process.env.SOOTHE_REMOTE_DEBUG) {
  const port = process.env.SOOTHE_REMOTE_DEBUG ?? '9222';
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

void app.whenReady().then(() => {
  registerDaemonHandlers();
  registerTabHandlers();
  registerLoopsHandlers();
  registerSkillsHandlers();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  disposeAllTabs();
});
