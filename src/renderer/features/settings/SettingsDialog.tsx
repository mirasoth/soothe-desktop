import { useEffect, useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';
import type { ThemeMode } from '@shared/ipc';
import { Button } from '../../ui/button.js';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog.js';
import { Input } from '../../ui/input.js';
import { cn } from '../../lib/utils.js';

export function SettingsDialog(): React.ReactElement {
  const open = useStore(s => s.settingsOpen);
  const setOpen = useStore(s => s.setSettingsOpen);
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const setDaemon = useStore(s => s.setDaemon);

  const [daemonUrl, setDaemonUrl] = useState(settings.daemonUrl);
  const [theme, setTheme] = useState<ThemeMode>(settings.theme);
  const [projectPath, setProjectPath] = useState(settings.projectPath ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDaemonUrl(settings.daemonUrl);
      setTheme(settings.theme);
      setProjectPath(settings.projectPath ?? '');
    }
  }, [open, settings.daemonUrl, settings.theme, settings.projectPath]);

  const valid = /^wss?:\/\/.+/.test(daemonUrl);

  const browseFolder = async (): Promise<void> => {
    const selected = await soothe().selectFolder();
    if (selected) setProjectPath(selected);
  };

  const save = async (): Promise<void> => {
    if (!valid) return;
    setSaving(true);
    try {
      const next = await soothe().settingsSet({
        daemonUrl,
        theme,
        projectPath: projectPath || undefined,
      });
      setSettings(next);
      const health = await soothe().daemonHealth();
      setDaemon(health);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Reconnects new tabs after save. Existing tabs keep their current connection.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {/* Project workspace */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Project Workspace
          </label>
          <div className="flex gap-2">
            <Input
              value={projectPath}
              onChange={e => setProjectPath(e.target.value)}
              placeholder="/path/to/your/project"
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={browseFolder}>
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Working directory for agent loops
          </p>
        </div>

        {/* Daemon URL */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Daemon URL
          </label>
          <Input
            value={daemonUrl}
            onChange={e => setDaemonUrl(e.target.value)}
            placeholder="ws://127.0.0.1:8765"
            className={cn(valid ? '' : 'border-destructive focus-visible:ring-destructive')}
          />
          {!valid ? (
            <p className="text-xs text-destructive">Must start with ws:// or wss://</p>
          ) : null}
        </div>

        {/* Theme */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Theme
          </label>
          <div className="flex gap-2">
            {(['system', 'light', 'dark'] as ThemeMode[]).map(opt => (
              <Button
                key={opt}
                size="sm"
                variant={theme === opt ? 'default' : 'outline'}
                onClick={() => setTheme(opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
