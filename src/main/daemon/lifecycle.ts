/**
 * Daemon process lifecycle manager.
 *
 * Spawns the PyInstaller-bundled soothed binary as a child process,
 * monitors its health, handles crash recovery, and performs graceful
 * shutdown when the Electron app quits.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { app, dialog } from 'electron';
import { probeDaemon } from './health.js';
import { getSettings, patchSettings } from './settings.js';

export interface DaemonLifecycleStatus {
  managed: boolean;
  processRunning: boolean;
  pid: number | null;
  restartCount: number;
  lastError: string | null;
}

const MAX_CRASHES = 5;
const CRASH_WINDOW_MS = 60_000;
const HEALTH_POLL_MS = 500;
const HEALTH_TIMEOUT_MS = 45_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const DEFAULT_PORT = 8765;
const PORT_SCAN_RANGE = 10;

let daemonProcess: ChildProcess | null = null;
let restartCount = 0;
let lastError: string | null = null;
let crashTimestamps: number[] = [];
let stopping = false;
let managedPort = DEFAULT_PORT;

function getDaemonPath(): string | null {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'daemon', 'soothed');
  }
  // Dev mode: look for PyInstaller output relative to the Electron app source
  const devPath = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'soothe-daemon', 'dist', 'soothed', 'soothed');
  if (existsSync(devPath)) return devPath;
  return null;
}

function ensureExecutable(binPath: string): void {
  try {
    chmodSync(binPath, 0o755);
  } catch {
    // may fail on read-only filesystems — spawn will surface the real error
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  const { createConnection } = await import('node:net');
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' }, () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(true);
    });
    sock.setTimeout(1_000, () => {
      sock.destroy();
      resolve(true);
    });
  });
}

async function findAvailablePort(): Promise<number> {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + PORT_SCAN_RANGE; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return DEFAULT_PORT;
}

async function isDaemonAlreadyRunning(): Promise<boolean> {
  try {
    const health = await probeDaemon();
    return health.live;
  } catch {
    return false;
  }
}

function spawnDaemon(binPath: string, port: number): ChildProcess {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (port !== DEFAULT_PORT) {
    env['SOOTHE_DAEMON_TRANSPORTS__WEBSOCKET__PORT'] = String(port);
  }

  const child = spawn(binPath, ['--foreground'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    detached: false,
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[soothed] ${chunk.toString().trimEnd()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[soothed] ${chunk.toString().trimEnd()}`);
  });

  return child;
}

async function waitForHealthy(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const health = await probeDaemon();
      if (health.live) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

function recordCrash(): boolean {
  const now = Date.now();
  crashTimestamps.push(now);
  crashTimestamps = crashTimestamps.filter((t) => now - t < CRASH_WINDOW_MS);
  restartCount++;
  return crashTimestamps.length <= MAX_CRASHES;
}

async function attemptStart(): Promise<void> {
  const binPath = getDaemonPath();
  if (!binPath) {
    lastError = 'Daemon binary not found';
    console.error(`[lifecycle] ${lastError}`);
    return;
  }

  if (!existsSync(binPath)) {
    lastError = `Daemon binary missing at ${binPath}`;
    console.error(`[lifecycle] ${lastError}`);
    return;
  }

  ensureExecutable(binPath);

  // Check if a daemon is already running on the default port
  if (await isDaemonAlreadyRunning()) {
    console.log('[lifecycle] Daemon already running, reusing existing instance');
    managedPort = DEFAULT_PORT;
    return;
  }

  // Find an available port
  managedPort = await findAvailablePort();
  if (managedPort !== DEFAULT_PORT) {
    console.log(`[lifecycle] Port ${DEFAULT_PORT} occupied, using ${managedPort}`);
    patchSettings({ daemonUrl: `ws://127.0.0.1:${managedPort}` });
  }

  console.log(`[lifecycle] Spawning daemon on port ${managedPort}`);
  daemonProcess = spawnDaemon(binPath, managedPort);

  daemonProcess.on('exit', (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[lifecycle] Daemon exited (${reason})`);
    lastError = `Daemon exited (${reason})`;
    daemonProcess = null;

    if (recordCrash()) {
      console.log(`[lifecycle] Restarting daemon (attempt ${restartCount})`);
      setTimeout(() => {
        if (!stopping) void attemptStart();
      }, 2_000);
    } else {
      console.error(`[lifecycle] Too many crashes (${crashTimestamps.length} in ${CRASH_WINDOW_MS / 1000}s), giving up`);
      dialog.showErrorBox(
        'Soothe Daemon Error',
        `The daemon crashed ${crashTimestamps.length} times in ${CRASH_WINDOW_MS / 1000} seconds.\n\nLast error: ${lastError}\n\nPlease check the logs at ~/.soothe/logs/ and restart the application.`,
      );
    }
  });

  // Wait for daemon to become healthy
  const healthy = await waitForHealthy(HEALTH_TIMEOUT_MS);
  if (healthy) {
    console.log('[lifecycle] Daemon is healthy');
    lastError = null;
  } else if (daemonProcess && !daemonProcess.killed) {
    console.warn('[lifecycle] Daemon started but health check timed out');
    lastError = 'Daemon started but health check timed out';
  }
}

export async function startDaemon(): Promise<void> {
  stopping = false;
  restartCount = 0;
  crashTimestamps = [];
  lastError = null;
  await attemptStart();
}

export async function stopDaemon(): Promise<void> {
  stopping = true;
  if (!daemonProcess) return;

  const child = daemonProcess;
  daemonProcess = null;

  return new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      console.warn('[lifecycle] Daemon did not exit in time, sending SIGKILL');
      try {
        child.kill('SIGKILL');
      } catch {
        // already dead
      }
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);

    child.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });

    console.log('[lifecycle] Sending SIGTERM to daemon');
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
  });
}

export function getDaemonLifecycleStatus(): DaemonLifecycleStatus {
  return {
    managed: getDaemonPath() !== null,
    processRunning: daemonProcess !== null && !daemonProcess.killed,
    pid: daemonProcess?.pid ?? null,
    restartCount,
    lastError,
  };
}
