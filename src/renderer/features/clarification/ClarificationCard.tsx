import { useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';
import { Button } from '../../ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.js';
import { Input } from '../../ui/input.js';
import type { EventCardProps } from '../../event-renderers/registry.js';

function extractQuestions(event: Record<string, unknown>): string[] {
  const data = (event.data ?? event) as Record<string, unknown>;
  const raw = data.questions ?? data.queries ?? data.prompts;
  if (Array.isArray(raw)) {
    return raw
      .map(q => (typeof q === 'string' ? q : (q as { question?: string })?.question))
      .filter((q): q is string => typeof q === 'string' && q.length > 0);
  }
  if (typeof raw === 'string') return [raw];
  return ['Please clarify'];
}

export function ClarificationCard({ event, tabId }: EventCardProps): React.ReactElement {
  const type = event.type;
  const tab = useStore(s => s.tabs.find(t => t.tabId === tabId));
  const setClarification = useStore(s => s.setClarification);
  const questions = extractQuestions(event);

  const isRequest = type === 'soothe.loop.clarification.requested';
  const isAnswered = type === 'soothe.loop.clarification.answered';
  const isDeferred = type === 'soothe.loop.clarification.deferred';

  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [submitting, setSubmitting] = useState(false);

  // If the tab-level clarification has resolved, lock the card.
  const locked = !isRequest || tab?.clarification?.status !== 'pending';

  if (isAnswered || isDeferred) {
    const data = (event.data ?? event) as Record<string, unknown>;
    const source = (data.source as string | undefined) ?? (isDeferred ? 'deferred' : 'human');
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Clarification {isDeferred ? 'deferred' : 'answered'} · {source}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {Array.isArray(data.answers) && data.answers.length > 0 ? (
            <ul className="space-y-1">
              {(data.answers as string[]).map((a, i) => (
                <li key={i} className="font-mono">
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <span>Loop resumed.</span>
          )}
        </CardContent>
      </Card>
    );
  }

  const submit = async (): Promise<void> => {
    if (submitting || locked) return;
    setSubmitting(true);
    try {
      const text = questions
        .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]?.trim() ?? ''}`)
        .join('\n\n');
      await soothe().tabInput({
        tabId,
        text,
        clarificationAnswer: true,
        intentHint: 'resume_clarification',
      });
      if (tab?.clarification) {
        setClarification(tabId, { ...tab.clarification, status: 'resolved' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-amber-500/60 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Awaiting your answer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1">
            <div className="text-sm">{q}</div>
            <Input
              value={answers[i] ?? ''}
              onChange={e =>
                setAnswers(prev => prev.map((a, j) => (j === i ? e.target.value : a)))
              }
              disabled={locked || submitting}
              placeholder="Your answer…"
              autoFocus={i === 0}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
        ))}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={locked || submitting || answers.some(a => !a.trim())}
          >
            {submitting ? 'Sending…' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
