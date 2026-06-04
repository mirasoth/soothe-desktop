import { describe, expect, it } from 'vitest';
import { extractFileChange, synthDiff } from '@renderer/lib/diff';

describe('extractFileChange', () => {
  it('reads unified_diff field when present', () => {
    const change = extractFileChange({
      type: 'soothe.tool.execution.file_change',
      path: 'src/foo.ts',
      unified_diff: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-a\n+b\n',
    });
    expect(change?.path).toBe('src/foo.ts');
    expect(change?.unifiedDiff).toContain('@@');
  });

  it('infers language from extension', () => {
    expect(extractFileChange({ type: 'x', path: 'foo.py' })?.language).toBe('python');
    expect(extractFileChange({ type: 'x', path: 'foo.tsx' })?.language).toBe('typescript');
    expect(extractFileChange({ type: 'x', path: 'README' })?.language).toBeUndefined();
  });

  it('returns null when path is missing', () => {
    expect(extractFileChange({ type: 'x' })).toBeNull();
  });
});

describe('synthDiff', () => {
  it('returns the unified_diff verbatim when supplied', () => {
    const diff = synthDiff({ path: 'a.txt', unifiedDiff: 'patch-text' });
    expect(diff).toBe('patch-text');
  });

  it('synthesizes a diff from before/after when missing', () => {
    const diff = synthDiff({ path: 'a.txt', before: 'hello\n', after: 'hello world\n' });
    expect(diff).toContain('-hello');
    expect(diff).toContain('+hello world');
  });
});
