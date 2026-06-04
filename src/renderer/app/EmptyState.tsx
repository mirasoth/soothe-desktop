import { useState } from 'react';
import { Button } from '../ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { BrandMark } from '../ui/brand.js';
import { soothe } from '../lib/ipc.js';
import { useStore } from '../state/store.js';

export function EmptyState(): React.ReactElement {
  const daemon = useStore(s => s.daemon);
  const setDaemon = useStore(s => s.setDaemon);
  const [retrying, setRetrying] = useState(false);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    try {
      const health = await soothe().daemonHealth();
      setDaemon(health);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-3">
          <BrandMark size={36} />
          <CardTitle>Soothe daemon not reachable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Soothe talks to a running <code className="font-mono">soothed</code> over WebSocket.
            Start the daemon in a terminal:
          </p>
          <pre className="rounded-md border bg-muted px-3 py-2 font-mono text-xs">soothed start</pre>
          <p className="text-xs text-muted-foreground">
            Connecting to <code className="font-mono">{daemon?.url ?? 'ws://127.0.0.1:8765'}</code>.
            {daemon?.error ? (
              <>
                <br />
                Last error: <span className="text-destructive">{daemon.error}</span>
              </>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button onClick={retry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
            <Button variant="outline" onClick={() => useStore.getState().setSettingsOpen(true)}>
              Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
