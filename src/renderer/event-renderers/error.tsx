import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import type { EventCardProps } from './registry.js';

export function ErrorBanner({ event }: EventCardProps): React.ReactElement {
  const data = (event.data ?? event) as Record<string, unknown>;
  const message =
    (data.message as string | undefined) ??
    (data.error as string | undefined) ??
    `Error: ${event.type}`;
  const code = (data.code as string | undefined) ?? undefined;
  return (
    <Card className="border-destructive/60 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-destructive">
          {code ? `Error · ${code}` : 'Error'}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{message}</CardContent>
    </Card>
  );
}
