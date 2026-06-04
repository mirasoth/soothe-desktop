import { useMemo, useState } from 'react';
import { Diff, Hunk, parseDiff, type DiffType, type HunkData } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js';
import { extractFileChange, synthDiff } from '../lib/diff.js';
import type { EventCardProps } from './registry.js';

interface ParsedFile {
  type?: DiffType;
  hunks: HunkData[];
}

const VALID_DIFF_TYPES: ReadonlySet<DiffType> = new Set([
  'add',
  'delete',
  'modify',
  'rename',
  'copy',
]);

function asDiffType(value: string | undefined): DiffType {
  if (value && VALID_DIFF_TYPES.has(value as DiffType)) return value as DiffType;
  return 'modify';
}

export function DiffCard({ event }: EventCardProps): React.ReactElement | null {
  const change = useMemo(() => extractFileChange(event), [event]);
  const [open, setOpen] = useState(true);

  if (!change) return null;

  const diffText = synthDiff(change);
  const files = parseDiff(diffText) as ParsedFile[];
  const totalHunks = files.reduce((n, f) => n + f.hunks.length, 0);

  return (
    <Card>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="rounded border bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {change.operation ?? 'edit'}
            </span>
            <span className="truncate font-mono text-xs">{change.path}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {totalHunks} hunk{totalHunks === 1 ? '' : 's'} {open ? '▾' : '▸'}
            </span>
          </CardTitle>
        </CardHeader>
      </button>
      {open ? (
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-md border text-xs scrollbar-thin">
            {files.length === 0 ? (
              <pre className="bg-muted p-2 font-mono">{diffText}</pre>
            ) : (
              files.map((file, fi) => (
                <Diff
                  key={fi}
                  viewType="unified"
                  diffType={asDiffType(file.type as string | undefined)}
                  hunks={file.hunks}
                >
                  {(hunks: HunkData[]) =>
                    hunks.map(hunk => <Hunk key={hunk.content} hunk={hunk} />)
                  }
                </Diff>
              ))
            )}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
