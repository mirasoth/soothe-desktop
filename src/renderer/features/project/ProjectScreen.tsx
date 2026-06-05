import { useState } from 'react';
import { Button } from '../../ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.js';
import { BrandMark } from '../../ui/brand.js';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';

type Stage = 'pick' | 'confirm-init';

export function ProjectScreen(): React.ReactElement {
  const setProject = useStore(s => s.setProject);
  const [stage, setStage] = useState<Stage>('pick');
  const [selectedPath, setSelectedPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickFolder = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const path = await soothe().selectFolder();
      if (!path) return;
      const resp = await soothe().projectCheck({ path });
      if (resp.error) {
        setError(resp.error);
        return;
      }
      if (resp.initialized) {
        await activateProject(path, resp.name);
      } else {
        setSelectedPath(path);
        setStage('confirm-init');
      }
    } finally {
      setBusy(false);
    }
  };

  const initProject = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const resp = await soothe().projectInit({ path: selectedPath });
      if (resp.error) {
        setError(resp.error);
        return;
      }
      await activateProject(selectedPath, resp.name);
    } finally {
      setBusy(false);
    }
  };

  const activateProject = async (path: string, name: string): Promise<void> => {
    await soothe().settingsSet({ projectPath: path });
    setProject({ path, name, initialized: true, loading: false });
  };

  const cancelInit = (): void => {
    setSelectedPath('');
    setStage('pick');
    setError('');
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-3">
          <BrandMark size={36} />
          <CardTitle>
            {stage === 'pick' ? 'Open a Project' : 'Initialize Project'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stage === 'pick' ? (
            <>
              <p className="text-muted-foreground">
                Select a workspace directory to open as a Soothe project.
                Each project tracks its own chats and autopilot jobs.
              </p>
              <Button onClick={pickFolder} disabled={busy}>
                {busy ? 'Opening…' : 'Open Folder'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                The selected directory does not have a Soothe project yet.
              </p>
              <pre className="truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                {selectedPath}
              </pre>
              <p className="text-sm">
                Initialize a Soothe project in this workspace?
              </p>
              <div className="flex gap-2">
                <Button onClick={initProject} disabled={busy}>
                  {busy ? 'Initializing…' : 'Initialize'}
                </Button>
                <Button variant="outline" onClick={cancelInit} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </>
          )}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
