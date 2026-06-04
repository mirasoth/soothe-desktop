import { describe, expect, it } from 'vitest';
import { filesToAttachments } from '@renderer/lib/attachments';

function makeFile(name: string, type: string, contents: string): File {
  return new File([contents], name, { type });
}

describe('filesToAttachments', () => {
  it('encodes files to base64', async () => {
    // jsdom's FileReader.readAsDataURL works; verify the round-trip
    const file = makeFile('hello.txt', 'text/plain', 'hi');
    const out = await filesToAttachments([file]);
    expect(out).toHaveLength(1);
    expect(out[0]!.filename).toBe('hello.txt');
    expect(out[0]!.mimeType).toBe('text/plain');
    expect(Buffer.from(out[0]!.base64, 'base64').toString()).toBe('hi');
  });

  it('skips files over the size limit', async () => {
    const big = makeFile('big.bin', 'application/octet-stream', 'x'.repeat(8 * 1024 * 1024 + 1));
    const out = await filesToAttachments([big]);
    expect(out).toHaveLength(0);
  });

  it('synthesizes a name when missing', async () => {
    const file = new File(['x'], '', { type: 'image/png' });
    const out = await filesToAttachments([file]);
    expect(out[0]!.filename).toMatch(/^pasted-\d+\.png$/);
  });
});
