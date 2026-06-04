import { useEffect, useMemo, useState } from 'react';
import type { SkillEntry } from '@shared/ipc';
import { cn } from '../../lib/utils.js';

const STATIC: Array<{ name: string; description: string }> = [
  { name: '/clear', description: 'Clear the current chat scroll' },
  { name: '/cancel', description: 'Interrupt the running agent' },
  { name: '/exit', description: 'Detach from this loop' },
  { name: '/quit', description: 'Quit the daemon session' },
];

interface Props {
  query: string;
  skills: SkillEntry[];
  onPick(value: string): void;
  onClose(): void;
}

export function SlashPalette({ query, skills, onPick, onClose }: Props): React.ReactElement | null {
  const items = useMemo(() => {
    const skillItems = skills.map(s => ({
      name: `/skill:${s.name}`,
      description: s.description ?? 'Skill',
    }));
    const all = [...STATIC, ...skillItems];
    const q = query.toLowerCase();
    return all.filter(i => i.name.toLowerCase().startsWith(q)).slice(0, 10);
  }, [query, skills]);

  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(idx => Math.min(idx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(idx => Math.max(idx - 1, 0));
      } else if (e.key === 'Enter') {
        const choice = items[activeIdx];
        if (choice) {
          e.preventDefault();
          onPick(`${choice.name} `);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items, activeIdx, onPick, onClose]);

  if (items.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-60 overflow-auto rounded-md border bg-card shadow-lg scrollbar-thin">
      {items.map((item, idx) => (
        <button
          key={item.name}
          type="button"
          onClick={() => onPick(`${item.name} `)}
          onMouseEnter={() => setActiveIdx(idx)}
          className={cn(
            'flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm',
            idx === activeIdx ? 'bg-accent' : '',
          )}
        >
          <span className="font-mono text-xs">{item.name}</span>
          <span className="truncate text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
