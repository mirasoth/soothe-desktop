import { useEffect, useRef, useState } from 'react';
import { soothe } from '../../lib/ipc.js';
import { useStore } from '../../state/store.js';
import type { TabState } from '../../state/store.js';
import { Button } from '../../ui/button.js';
import { Textarea } from '../../ui/input.js';
import { AttachmentStrip } from './AttachmentStrip.js';
import { SlashPalette } from './SlashPalette.js';
import { filesToAttachments } from '../../lib/attachments.js';
import { cn } from '../../lib/utils.js';

const STATIC_COMMANDS = ['/clear', '/cancel', '/exit', '/quit'];

interface Props {
  tab: TabState;
}

export function Composer({ tab }: Props): React.ReactElement {
  const draft = tab.draft;
  const attachments = tab.attachments;
  const setDraft = useStore(s => s.setDraft);
  const addAttachment = useStore(s => s.addAttachment);
  const setAttachments = useStore(s => s.setAttachments);
  const toggleMode = useStore(s => s.toggleClarificationMode);
  const setSkills = useStore(s => s.setSkills);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-show palette when draft starts with "/"
  useEffect(() => {
    setPaletteOpen(draft.startsWith('/'));
  }, [draft]);

  // Lazy load skills on first focus
  const loadSkillsOnce = (): void => {
    if (tab.skills.length > 0) return;
    void soothe()
      .skillsList({ tabId: tab.tabId })
      .then(resp => {
        if (!resp.error) setSkills(tab.tabId, resp.skills);
      });
  };

  const appendTabEvent = useStore(s => s.appendTabEvent);
  const patchTab = useStore(s => s.patchTab);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;

    // Slash-command routing
    if (text.startsWith('/') && !text.startsWith('/skill:')) {
      const cmd = text.split(/\s+/)[0]!;
      if (STATIC_COMMANDS.includes(cmd)) {
        await soothe().tabCommand({ tabId: tab.tabId, cmd });
        setDraft(tab.tabId, '');
        return;
      }
    }

    const isClarification = tab.clarification?.status === 'pending';
    const intentHint = text.startsWith('/skill:') ? extractSkillIntent(text) : undefined;

    // Optimistic UI: append the user's text to the chat scroll immediately
    // and promote the tab title if it's still generic. The daemon does not
    // echo user input back to subscribers.
    if (text) {
      appendTabEvent(tab.tabId, { type: 'human', content: text });
      const generic =
        !tab.title ||
        tab.title === 'New chat' ||
        tab.title.startsWith(tab.loopId.slice(0, 8));
      if (generic) {
        patchTab(tab.tabId, { title: text.slice(0, 60) });
      }
    }

    await soothe().tabInput({
      tabId: tab.tabId,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      clarificationAnswer: isClarification || undefined,
      intentHint: isClarification ? 'resume_clarification' : intentHint,
    });
    setDraft(tab.tabId, '');
    setAttachments(tab.tabId, []);
  };

  const onKey = async (e: React.KeyboardEvent<HTMLTextAreaElement>): Promise<void> => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (paletteOpen) return; // palette handles Enter
      await send();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      await soothe().tabCommand({ tabId: tab.tabId, cmd: '/cancel' });
      return;
    }
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      toggleMode(tab.tabId);
      return;
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    const newAttachments = await filesToAttachments(files);
    for (const a of newAttachments) addAttachment(tab.tabId, a);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const newAttachments = await filesToAttachments(files);
    for (const a of newAttachments) addAttachment(tab.tabId, a);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  return (
    <div
      className="flex-none border-t border-border bg-card/40 p-3"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="mx-auto max-w-3xl space-y-2">
        <AttachmentStrip
          attachments={attachments}
          onRemove={index => {
            const next = attachments.filter((_, i) => i !== index);
            setAttachments(tab.tabId, next);
          }}
        />
        <div className="relative">
          {paletteOpen ? (
            <SlashPalette
              query={draft}
              skills={tab.skills}
              onPick={value => {
                setDraft(tab.tabId, value);
                setPaletteOpen(false);
                textareaRef.current?.focus();
              }}
              onClose={() => setPaletteOpen(false)}
            />
          ) : null}
          <Textarea
            ref={textareaRef}
            value={draft}
            placeholder={
              tab.clarification?.status === 'pending'
                ? 'Answer the agent…'
                : 'Type a message — / for commands, drop images to attach'
            }
            onChange={e => setDraft(tab.tabId, e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            onFocus={loadSkillsOnce}
            rows={3}
            className={cn(
              tab.clarification?.status === 'pending'
                ? 'border-amber-500/60 focus-visible:ring-amber-500'
                : '',
            )}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-muted px-1">↵</kbd> send ·{' '}
            <kbd className="rounded border bg-muted px-1">⇧↵</kbd> newline ·{' '}
            <kbd className="rounded border bg-muted px-1">Esc</kbd> cancel ·{' '}
            <kbd className="rounded border bg-muted px-1">⇧⇥</kbd> {tab.clarificationMode}
          </span>
          <div className="flex items-center gap-2">
            {tab.isRunning && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void soothe().tabCommand({ tabId: tab.tabId, cmd: '/cancel' })}
              >
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={send} disabled={!draft.trim() && attachments.length === 0}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function extractSkillIntent(text: string): string | undefined {
  const m = text.match(/^\/skill:([\w-]+)/);
  return m ? `skill:${m[1]}` : undefined;
}
