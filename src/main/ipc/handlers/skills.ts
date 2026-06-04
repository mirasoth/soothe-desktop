import { ipcMain } from 'electron';
import { Channels, type SkillEntry, type SkillsListRequest, type SkillsListResponse } from '@shared/ipc';
import { wsManager } from '../../daemon/manager.js';

export function registerSkillsHandlers(): void {
  ipcMain.handle(
    Channels.SkillsList,
    async (_evt, req: SkillsListRequest): Promise<SkillsListResponse> => {
      try {
        const resp = (await wsManager.listSkills(req.tabId)) as { skills?: SkillEntry[] };
        return { skills: resp?.skills ?? [] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { skills: [], error: message };
      }
    },
  );
}
