import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useStore, makeTab } from '../../state/store.js';
import { soothe } from '../../lib/ipc.js';
import { cn } from '../../lib/utils.js';

export function CommandPalette(): React.ReactElement | null {
  const open = useStore(s => s.paletteOpen);
  const setOpen = useStore(s => s.setPaletteOpen);
  const setActiveTab = useStore(s => s.setActiveTab);
  const tabs = useStore(s => s.tabs);
  const loops = useStore(s => s.loops);
  const addTab = useStore(s => s.addTab);
  const setSettingsOpen = useStore(s => s.setSettingsOpen);
  const [value, setValue] = useState('');

  const tabActions = useMemo(
    () =>
      tabs.map(t => ({
        kind: 'tab' as const,
        id: t.tabId,
        label: `Switch to: ${t.title} (${t.loopId.slice(0, 8)})`,
      })),
    [tabs],
  );

  const loopActions = useMemo(
    () =>
      loops
        .filter(l => !tabs.some(t => t.loopId === l.loop_id))
        .slice(0, 10)
        .map(l => ({
          kind: 'loop' as const,
          id: l.loop_id,
          label: `Open loop: ${l.loop_id.slice(0, 24)}`,
        })),
    [loops, tabs],
  );

  if (!open) return null;

  const onSelect = async (key: string): Promise<void> => {
    if (key === 'new-chat') {
      const resp = await soothe().tabOpen({});
      if (resp.tabId) addTab(makeTab({ tabId: resp.tabId, loopId: resp.loopId, title: 'New chat' }));
    } else if (key === 'settings') {
      setSettingsOpen(true);
    } else if (key.startsWith('tab:')) {
      setActiveTab(key.slice(4));
    } else if (key.startsWith('loop:')) {
      const loopId = key.slice(5);
      const resp = await soothe().tabOpen({ loopId });
      if (resp.tabId) addTab(makeTab({ tabId: resp.tabId, loopId: resp.loopId, title: loopId.slice(0, 24) }));
    }
    setOpen(false);
    setValue('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={() => setOpen(false)}
    >
      <Command
        className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          value={value}
          onValueChange={setValue}
          placeholder="Type a command…"
          className="h-11 w-full border-b bg-transparent px-4 outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-80 overflow-y-auto p-1 scrollbar-thin">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results
          </Command.Empty>
          <Command.Group heading="Actions" className={groupHeader}>
            <PaletteItem keyName="new-chat" label="New chat" hint="↵" onSelect={onSelect} />
            <PaletteItem keyName="settings" label="Open settings" onSelect={onSelect} />
          </Command.Group>
          {tabActions.length > 0 ? (
            <Command.Group heading="Tabs" className={groupHeader}>
              {tabActions.map(t => (
                <PaletteItem key={t.id} keyName={`tab:${t.id}`} label={t.label} onSelect={onSelect} />
              ))}
            </Command.Group>
          ) : null}
          {loopActions.length > 0 ? (
            <Command.Group heading="Loops" className={groupHeader}>
              {loopActions.map(l => (
                <PaletteItem key={l.id} keyName={`loop:${l.id}`} label={l.label} onSelect={onSelect} />
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </div>
  );
}

const groupHeader =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground';

interface ItemProps {
  keyName: string;
  label: string;
  hint?: string;
  onSelect(key: string): void;
}

function PaletteItem({ keyName, label, hint, onSelect }: ItemProps): React.ReactElement {
  return (
    <Command.Item
      value={keyName}
      onSelect={() => onSelect(keyName)}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded px-3 py-1.5 text-sm aria-selected:bg-accent',
      )}
    >
      <span>{label}</span>
      {hint ? <kbd className="rounded border bg-muted px-1 text-[10px]">{hint}</kbd> : null}
    </Command.Item>
  );
}
