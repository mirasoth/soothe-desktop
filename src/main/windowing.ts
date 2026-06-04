import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings, patchSettings } from './daemon/settings.js';
import { wsManager } from './daemon/manager.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function createMainWindow(): BrowserWindow {
  const settings = getSettings();
  const bounds = settings.windowBounds ?? { width: 1280, height: 800 };

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  wsManager.registerSender(win.webContents);

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', () => {
    const { x, y, width, height } = win.getBounds();
    patchSettings({ windowBounds: { x, y, width, height } });
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
    // DevTools is NOT auto-opened to avoid the noisy Autofill CDP warnings
    // ("Autofill.enable wasn't found") that Chromium DevTools emits against
    // Electron. Press Cmd+Option+I (or F12) when you need it. Set
    // SOOTHE_DEVTOOLS=1 to auto-open anyway.
    if (process.env.SOOTHE_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
