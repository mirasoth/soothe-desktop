import { ipcMain } from 'electron';
import { Client } from 'soothe-client-typescript';
import {
  Channels,
  type LoopSummary,
  type LoopsDeleteRequest,
  type LoopsDeleteResponse,
  type LoopsListResponse,
} from '@shared/ipc';
import { getSettings } from '../../daemon/settings.js';

async function withEphemeralClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(getSettings().daemonUrl);
  try {
    await client.connect();
    await client.waitForDaemonReady(5_000);
    return await fn(client);
  } finally {
    client.close();
  }
}

export function registerLoopsHandlers(): void {
  ipcMain.handle(Channels.LoopsList, async (): Promise<LoopsListResponse> => {
    try {
      const resp = await withEphemeralClient(client => client.listLoops(15_000));
      const loops = (resp.loops as LoopSummary[] | undefined) ?? [];
      return { loops };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { loops: [], error: message };
    }
  });

  ipcMain.handle(
    Channels.LoopsDelete,
    async (_evt, req: LoopsDeleteRequest): Promise<LoopsDeleteResponse> => {
      try {
        await withEphemeralClient(client => client.deleteLoop(req.loopId, 10_000));
        return { loopId: req.loopId, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { loopId: req.loopId, success: false, error: message };
      }
    },
  );
}
