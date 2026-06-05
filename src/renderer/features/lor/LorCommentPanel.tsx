import { useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { Button } from '../../ui/button.js';

interface Comment {
  id: number;
  text: string;
  absorbed: boolean;
  timestamp: number;
}

interface LorCommentPanelProps {
  jobId: string;
  goalId: string;
}

export function LorCommentPanel({ jobId, goalId }: LorCommentPanelProps): React.ReactElement {
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async (): Promise<void> => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const resp = await soothe().jobGuidance({ jobId, goalId, text });
      setComments(prev => [
        ...prev,
        {
          id: Date.now(),
          text,
          absorbed: resp.absorbed,
          timestamp: Date.now(),
        },
      ]);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">
        Observation Room
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {comments.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Send guidance to the worker. Comments are injected into the agent's context.
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map(comment => (
              <div key={comment.id} className="rounded bg-muted/50 px-3 py-2 text-sm">
                <div className="whitespace-pre-wrap break-words">{comment.text}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {comment.absorbed ? 'Absorbed' : 'Queued'} ·{' '}
                  {new Date(comment.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <textarea
          className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Add guidance..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="w-full"
        >
          {sending ? 'Sending...' : 'Send Guidance'}
        </Button>
      </div>
    </div>
  );
}
