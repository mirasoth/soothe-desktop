import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windowing.js';
import { registerDaemonHandlers } from './ipc/handlers/daemon.js';
import { registerTabHandlers, disposeAllTabs } from './ipc/handlers/tab.js';
import { registerLoopsHandlers } from './ipc/handlers/loops.js';
import { registerSkillsHandlers } from './ipc/handlers/skills.js';

app.setName('Soothe');

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
