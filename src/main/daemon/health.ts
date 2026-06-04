import { Client, checkDaemonStatus } from '@mirasoth/soothe-client';
import type { DaemonHealthResponse } from '@shared/ipc';
import { getSettings } from './settings.js';

export async function probeDaemon(): Promise<DaemonHealthResponse> {
  const { daemonUrl } = getSettings();
  const client = new Client(daemonUrl);
  try {
    await client.connect();
    const status = (await checkDaemonStatus(client, 3_000)) as Record<string, unknown>;
    // daemon_status_response carries: running, port_live, active_threads, daemon_pid
    const running = Boolean(status?.running);
    if (running) {
      return {
        live: true,
        url: daemonUrl,
        version: (status?.version as string | undefined) ?? undefined,
      };
    }
    return { live: false, url: daemonUrl, error: 'daemon reports running=false' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { live: false, url: daemonUrl, error: message };
  } finally {
    client.close();
  }
}
