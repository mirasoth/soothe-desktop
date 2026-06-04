import { createPatch } from 'diff';

export interface FileChange {
  path: string;
  before?: string;
  after?: string;
  unifiedDiff?: string;
  language?: string;
  operation?: 'create' | 'modify' | 'delete' | 'rename';
}

export function extractFileChange(event: Record<string, unknown>): FileChange | null {
  const data = (event.data ?? event) as Record<string, unknown>;
  const path =
    (data.path as string | undefined) ??
    (data.file_path as string | undefined) ??
    (data.filename as string | undefined);
  if (!path) return null;
  const unified =
    (data.unified_diff as string | undefined) ??
    (data.diff as string | undefined) ??
    (data.patch as string | undefined);
  const before = (data.before as string | undefined) ?? (data.old as string | undefined);
  const after = (data.after as string | undefined) ?? (data.new as string | undefined);
  const operation = (data.operation as FileChange['operation']) ?? undefined;
  return {
    path,
    before,
    after,
    unifiedDiff: unified,
    language: detectLanguage(path),
    operation,
  };
}

export function synthDiff(change: FileChange): string {
  if (change.unifiedDiff) return change.unifiedDiff;
  return createPatch(change.path, change.before ?? '', change.after ?? '', '', '');
}

function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    default:
      return undefined;
  }
}
