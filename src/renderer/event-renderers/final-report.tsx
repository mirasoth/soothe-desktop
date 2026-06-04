import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { Markdown } from '../lib/markdown.js';
import type { EventCardProps } from './registry.js';

function extractReport(event: Record<string, unknown>): string {
  const data = (event.data ?? event) as Record<string, unknown>;
  return (
    (data.final_report as string | undefined) ??
    (data.summary as string | undefined) ??
    (data.report as string | undefined) ??
    ''
  );
}

export function FinalReportCard({ event }: EventCardProps): React.ReactElement | null {
  const text = extractReport(event);
  if (!text.trim()) return null;
  return (
    <Card className="border-emerald-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Result
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Markdown>{text}</Markdown>
      </CardContent>
    </Card>
  );
}
