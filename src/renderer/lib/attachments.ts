import type { Attachment } from '@shared/ipc';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MiB per file

export async function filesToAttachments(files: File[]): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) continue;
    const base64 = await readAsBase64(file);
    result.push({
      filename: file.name || synthName(file.type),
      mimeType: file.type || 'application/octet-stream',
      base64,
    });
  }
  return result;
}

function synthName(mime: string): string {
  const ext = mime.split('/')[1] ?? 'bin';
  return `pasted-${Date.now()}.${ext}`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
