import { ipcMain } from 'electron';
import {
  Channels,
  type TabCloseRequest,
  type TabCommandRequest,
  type TabInputRequest,
  type TabOpenRequest,
  type TabOpenResponse,
} from '@shared/ipc';
import { wsManager } from '../../daemon/manager.js';

export function registerTabHandlers(): void {
  ipcMain.handle(
    Channels.TabOpen,
    async (_evt, req: TabOpenRequest): Promise<TabOpenResponse> => {
      try {
        const { tabId, loopId } = await wsManager.open({ loopId: req?.loopId });
        return { tabId, loopId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { tabId: '', loopId: '', error: message };
      }
    },
  );

  ipcMain.handle(Channels.TabInput, async (_evt, req: TabInputRequest) => {
    const extras: Record<string, unknown> = {};
    if (req.clarificationAnswer) extras.clarification_answer = true;
    if (req.intentHint) extras.intent_hint = req.intentHint;

    await wsManager.input(
      req.tabId,
      req.text,
      {
        attachments: req.attachments as unknown as Record<string, unknown>[] | undefined,
        ...(req.modelOverride ? { model: req.modelOverride } : {}),
      },
      extras,
    );
  });

  ipcMain.handle(Channels.TabCommand, async (_evt, req: TabCommandRequest) => {
    await wsManager.command(req.tabId, req.cmd);
  });

  ipcMain.handle(Channels.TabClose, async (_evt, req: TabCloseRequest) => {
    await wsManager.close(req.tabId, req.mode);
  });
}

export function disposeAllTabs(): void {
  wsManager.disposeAll();
}
