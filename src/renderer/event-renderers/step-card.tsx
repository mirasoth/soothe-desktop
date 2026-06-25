import { useEffect, useState, useMemo } from 'react';
import { cn } from '../lib/utils.js';

export interface StepEventData {
  step_id: string;
  description: string;
  status: 'queued' | 'running' | 'completed' | 'error';
}

export interface ToolEventEntry {
  id: string;
  event: Record<string, unknown> & { type: string };
  receivedAt: number;
}

export interface StepCompletionData {
  success: boolean;
  summary: string;
  duration_ms: number;
  tool_call_count: number;
}

interface StepCardProps {
  stepEvent: StepEventData;
  toolEvents: ToolEventEntry[];
  completionEvent?: StepCompletionData;
}

interface ToolRowData {
  id: string;
  toolCallId: string;
  name: string;
  primaryArg: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  isTask: boolean;
  parentToolCallId?: string;
}

const MAX_VISIBLE_TOOLS = 5;
const MAX_STAT_TOOL_KINDS = 4;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

function extractToolName(data: Record<string, unknown>): string {
  return (
    (data.name as string | undefined) ??
    (data.tool_name as string | undefined) ??
    (data.tool as string | undefined) ??
    'tool'
  );
}

const PRIMARY_ARG_KEYS: Record<string, string[]> = {
  read: ['file_path', 'path'],
  read_file: ['file_path', 'path'],
  write: ['file_path', 'path'],
  write_file: ['file_path', 'path'],
  edit: ['file_path', 'path'],
  edit_file: ['file_path', 'path'],
  bash: ['command', 'cmd'],
  shell: ['command', 'cmd'],
  execute: ['command', 'cmd'],
  shellexecute: ['command', 'cmd'],
  run_command: ['command', 'cmd', 'script'],
  glob: ['pattern'],
  grep: ['pattern', 'query'],
  search: ['query'],
  ls: ['path', 'directory'],
  list: ['path', 'directory'],
  task: ['description', 'goal', 'prompt'],
};

function truncateArg(s: string, maxLen = 80): string {
  const collapsed = s.replace(/\s+/g, ' ');
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen - 1) + '…' : collapsed;
}

function extractPrimaryArg(toolName: string, data: Record<string, unknown>): string {
  const args = (data.args ?? data.arguments ?? data.input ?? data) as Record<string, unknown>;
  if (typeof args !== 'object' || args === null) return '';
  const lowerName = toolName.toLowerCase();
  for (const [key, argKeys] of Object.entries(PRIMARY_ARG_KEYS)) {
    if (lowerName.includes(key)) {
      for (const ak of argKeys) {
        const val = args[ak];
        if (typeof val === 'string' && val.trim()) return truncateArg(val.trim());
      }
    }
  }
  for (const val of Object.values(args)) {
    if (typeof val === 'string' && val.trim() && val.length < 200) return truncateArg(val.trim());
  }
  return '';
}

function parseUnifiedToolCallId(tcid: string): { stepId: string; isTask: boolean } {
  const parts = tcid.split(':');
  if (parts.length < 3) return { stepId: '', isTask: false };
  const frag = parts[0]!;
  if (!frag.includes('_') || frag.includes('-')) return { stepId: '', isTask: false };
  const typeCode = parts[1]!;
  if (typeCode !== 's' && !/^t\d+$/.test(typeCode)) return { stepId: '', isTask: false };
  const stepId = frag.replace(/_/g, '-');
  const toolInfo = parts.slice(2).join(':');
  const isTask = typeCode === 's' && toolInfo.startsWith('task');
  return { stepId, isTask };
}

function buildToolRows(toolEvents: ToolEventEntry[]): ToolRowData[] {
  const rows: ToolRowData[] = [];
  const byToolCallId = new Map<string, number>();
  // ToolMessage may arrive before tool_call_update — collect completions to apply after.
  const completedIds = new Set<string>();
  // Also collect ToolMessage name+args as fallback if tool_call_update never arrives.
  const toolMessageInfo = new Map<string, { name: string; receivedAt: number }>();

  for (const entry of toolEvents) {
    const type = entry.event.type;
    const data = (entry.event.data ?? entry.event) as Record<string, unknown>;

    if (type === 'soothe.stream.tool_call.update') {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : '';
      const name = extractToolName(data);
      const primaryArg = extractPrimaryArg(name, data);
      const { isTask } = parseUnifiedToolCallId(toolCallId);

      const existingIdx = toolCallId ? byToolCallId.get(toolCallId) : undefined;
      if (existingIdx !== undefined) {
        const existing = rows[existingIdx]!;
        if (primaryArg && !existing.primaryArg) {
          rows[existingIdx] = { ...existing, primaryArg };
        }
        if (name !== 'tool' && existing.name === 'tool') {
          rows[existingIdx] = { ...rows[existingIdx]!, name };
        }
      } else {
        const idx = rows.length;
        rows.push({
          id: entry.id,
          toolCallId,
          name,
          primaryArg,
          status: completedIds.has(toolCallId) ? 'completed' : 'running',
          isTask,
        });
        if (toolCallId) byToolCallId.set(toolCallId, idx);
      }
      continue;
    }

    if (type.startsWith('soothe.tool.execution.')) {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : entry.id;
      const name = extractToolName(data);
      const primaryArg = extractPrimaryArg(name, data);

      if (type.endsWith('.started')) {
        const idx = rows.length;
        rows.push({ id: entry.id, toolCallId, name, primaryArg, status: 'running', isTask: false });
        byToolCallId.set(toolCallId, idx);
      } else if (type.endsWith('.completed')) {
        const existingIdx = byToolCallId.get(toolCallId);
        if (existingIdx !== undefined) {
          rows[existingIdx] = { ...rows[existingIdx]!, status: 'completed' };
        } else {
          rows.push({ id: entry.id, toolCallId, name, primaryArg, status: 'completed', isTask: false });
        }
      } else if (type.endsWith('.error')) {
        const existingIdx = byToolCallId.get(toolCallId);
        if (existingIdx !== undefined) {
          rows[existingIdx] = { ...rows[existingIdx]!, status: 'error' };
        } else {
          rows.push({ id: entry.id, toolCallId, name, primaryArg, status: 'error', isTask: false });
        }
      }
      continue;
    }

    if (type === 'tool' || type === 'ToolMessage') {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : '';
      if (toolCallId) {
        completedIds.add(toolCallId);
        const existingIdx = byToolCallId.get(toolCallId);
        if (existingIdx !== undefined) {
          rows[existingIdx] = { ...rows[existingIdx]!, status: 'completed' };
        } else {
          const name = typeof data.name === 'string' ? data.name : '';
          if (name) toolMessageInfo.set(toolCallId, { name, receivedAt: entry.receivedAt });
        }
      }
    }
  }

  // Create rows for ToolMessages that never got a tool_call_update
  for (const [tcid, info] of toolMessageInfo) {
    if (!byToolCallId.has(tcid)) {
      rows.push({
        id: tcid,
        toolCallId: tcid,
        name: info.name,
        primaryArg: '',
        status: 'completed',
        isTask: parseUnifiedToolCallId(tcid).isTask,
      });
    }
  }

  // Apply completion status for any rows created by tool_call_update after ToolMessage
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.status === 'running' && completedIds.has(rows[i]!.toolCallId)) {
      rows[i] = { ...rows[i]!, status: 'completed' };
    }
  }

  return rows;
}

function StatusDot({ status }: { status: string }): React.ReactElement {
  if (status === 'running') {
    return (
      <span className="relative flex h-3 w-3 flex-none items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  }
  const icon = status === 'completed' ? '●' : status === 'error' ? '✗' : status === 'queued' ? '○' : '·';
  return <span className={cn('flex-none text-sm', statusColor(status))}>{icon}</span>;
}

function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'text-emerald-500';
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'error':
      return 'text-red-500';
    case 'queued':
      return 'text-amber-500';
    default:
      return 'text-muted-foreground';
  }
}

function toDisplayName(name: string): string {
  return name
    .split(/[_\-.]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toolStatsSuffix(toolRows: ToolRowData[]): string {
  const counts = new Map<string, number>();
  for (const row of toolRows) {
    if (row.isTask) continue;
    const display = toDisplayName(row.name);
    counts.set(display, (counts.get(display) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return '';
  const shown = sorted.slice(0, MAX_STAT_TOOL_KINDS);
  const overflow = sorted.length - shown.length;
  const parts = shown.map(([name, count]) => `${name}(${count})`);
  if (overflow > 0) parts.push(`+${overflow} more`);
  return parts.join(' ');
}

export function StepCard({
  stepEvent,
  toolEvents,
  completionEvent,
}: StepCardProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(completionEvent !== undefined);

  useEffect(() => {
    if (completionEvent !== undefined) setCollapsed(true);
  }, [completionEvent]);

  const status = completionEvent
    ? completionEvent.success
      ? 'completed'
      : 'error'
    : stepEvent.status;
  const toolRows = useMemo(() => buildToolRows(toolEvents), [toolEvents]);
  const visibleRows = collapsed ? [] : toolRows.slice(-MAX_VISIBLE_TOOLS);
  const hiddenCount = Math.max(0, toolRows.length - MAX_VISIBLE_TOOLS);

  return (
    <div className="rounded-lg border border-border/60 bg-card/50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <StatusDot status={status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {stepEvent.description}
        </span>
        {completionEvent && completionEvent.duration_ms > 0 && (
          <span className="flex-none text-[11px] text-muted-foreground">
            {formatDuration(completionEvent.duration_ms)}
            {' · '}
            {completionEvent.tool_call_count} tool
            {completionEvent.tool_call_count !== 1 ? 's' : ''}
          </span>
        )}
        {!completionEvent && toolRows.length > 0 && (
          <span className="flex-none text-[11px] text-muted-foreground">
            {toolStatsSuffix(toolRows)}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {/* Tool rows — latest N activities */}
      {!collapsed && visibleRows.length > 0 && (
        <div className="border-t border-border/30 px-3 pb-1 pt-1">
          {hiddenCount > 0 && (
            <div className="py-0.5 pl-2 text-[11px] text-muted-foreground/60">
              … {hiddenCount} earlier tool{hiddenCount !== 1 ? 's' : ''}
            </div>
          )}
          {visibleRows.map(row => {
            const icon = row.status === 'completed' ? '✓' : row.status === 'error' ? '✗' : '●';
            const color =
              row.status === 'completed'
                ? 'text-emerald-600 dark:text-emerald-400'
                : row.status === 'error'
                  ? 'text-red-500'
                  : 'text-amber-500';
            const displayName = row.isTask ? 'Task' : row.name;
            return (
              <div key={row.id} className={cn('flex items-baseline gap-1.5 py-0.5', row.isTask ? 'pl-2' : 'pl-2')}>
                <span className={cn('flex-none text-xs', color)}>{icon}</span>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {displayName}
                  {row.primaryArg && (
                    <span className="text-foreground/50">({row.primaryArg})</span>
                  )}
                  {row.duration !== undefined && row.duration > 0 && (
                    <span className="text-foreground/30"> {formatDuration(row.duration)}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Completion footer — "✓ Done · 1m 7s · ShellExecute(7) ReadFile(3) +1 more" */}
      {status === 'completed' && completionEvent && (
        <div className="border-t border-border/30 px-3 py-1.5">
          <div className="flex items-center gap-1.5 pl-2 text-xs text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
            <span>
              Done
              {completionEvent.duration_ms > 0 && (
                <> · {formatDuration(completionEvent.duration_ms)}</>
              )}
              {toolRows.length > 0 ? (
                <> · {toolStatsSuffix(toolRows)}</>
              ) : completionEvent.tool_call_count > 0 ? (
                <> · {completionEvent.tool_call_count} tool{completionEvent.tool_call_count !== 1 ? 's' : ''}</>
              ) : null}
            </span>
          </div>
        </div>
      )}

      {status === 'error' && completionEvent?.summary && (
        <div className="border-t border-border/30 px-3 py-1.5">
          <div className="flex items-center gap-1.5 pl-2 text-xs text-red-500">
            <span>✗</span>
            <span className="min-w-0 truncate">{completionEvent.summary}</span>
          </div>
        </div>
      )}
    </div>
  );
}
