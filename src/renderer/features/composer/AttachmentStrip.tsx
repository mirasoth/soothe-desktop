import type { Attachment } from '@shared/ipc';
import { cn } from '../../lib/utils.js';

interface Props {
  attachments: Attachment[];
  onRemove(index: number): void;
}

export function AttachmentStrip({ attachments, onRemove }: Props): React.ReactElement | null {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att, idx) => {
        const isImage = att.mimeType.startsWith('image/');
        return (
          <div
            key={`${att.filename}-${idx}`}
            className={cn(
              'group relative flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs',
            )}
          >
            {isImage ? (
              <img
                src={`data:${att.mimeType};base64,${att.base64}`}
                alt={att.filename}
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <span className="font-mono">📄</span>
            )}
            <span className="max-w-[140px] truncate" title={att.filename}>
              {att.filename}
            </span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              title="Remove"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
