import { ipcMain } from 'electron';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Channels, type ProjectCheckResponse, type ProjectInitResponse } from '../../../shared/ipc.js';

export function registerProjectHandlers(): void {
  ipcMain.handle(
    Channels.ProjectCheck,
    async (_evt, req: { path: string }): Promise<ProjectCheckResponse> => {
      try {
        const name = basename(req.path);
        const projectYml = join(req.path, '.soothe', 'project.yml');
        try {
          await access(projectYml);
          return { path: req.path, initialized: true, name };
        } catch {
          return { path: req.path, initialized: false, name };
        }
      } catch (err) {
        return { path: req.path, initialized: false, name: '', error: String(err) };
      }
    },
  );

  ipcMain.handle(
    Channels.ProjectInit,
    async (_evt, req: { path: string }): Promise<ProjectInitResponse> => {
      try {
        const name = basename(req.path);
        const sootheDir = join(req.path, '.soothe');
        await mkdir(sootheDir, { recursive: true });
        const yml = `name: ${name}\n`;
        await writeFile(join(sootheDir, 'project.yml'), yml, 'utf-8');
        return { path: req.path, name };
      } catch (err) {
        return { path: req.path, name: '', error: String(err) };
      }
    },
  );
}
