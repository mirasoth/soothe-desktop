import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepCard, type StepEventData, type ToolEventEntry } from '@renderer/event-renderers/step-card';

/**
 * Integration test reproducing regression where stats don't appear in running status line.
 *
 * Issue: Desktop app shows only total tool count (e.g., "3 tools") during running state,
 * while TUI shows per-tool breakdown (e.g., "Grep(3), Glob(1)").
 *
 * Expected: Running status line should show per-tool breakdown like completed footer.
 *
 * Reference: docs/analysis/tool-stat-display-comparison.md
 */

function makeStepEvent(overrides: Partial<StepEventData> = {}): StepEventData {
  return {
    step_id: 'ABC-01',
    description: 'Scan workspace',
    status: 'running',
    ...overrides,
  };
}

function makeToolEvent(
  type: string,
  data: Record<string, unknown>,
  id = `evt-${Date.now()}-${Math.random()}`,
): ToolEventEntry {
  return {
    id,
    event: { type, ...data },
    receivedAt: Date.now(),
  };
}

describe('StepCard running stats regression', () => {
  it('shows per-tool breakdown in running status line (not just total count)', () => {
    const stepEvent = makeStepEvent();
    const toolEvents: ToolEventEntry[] = [
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'ABC_01:s:grep:0',
        name: 'grep',
        args: { pattern: 'TODO' },
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'ABC_01:s:grep:1',
        name: 'grep',
        args: { pattern: 'FIXME' },
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'ABC_01:s:glob:0',
        name: 'glob',
        args: { pattern: '**/*.py' },
      }),
    ];

    render(<StepCard stepEvent={stepEvent} toolEvents={toolEvents} />);

    // REGRESSION: Currently shows "3 tools" but should show "Grep(2), Glob(1)"
    // The running header should display per-tool stats like the completed footer does.

    // Check for per-tool breakdown (what we WANT)
    const runningHeader = screen.getByRole('button', { name: /scan workspace/i });
    expect(runningHeader).toBeTruthy();

    // The current implementation only shows "3 tools" but we expect "Grep(2), Glob(1)"
    // This assertion will FAIL, demonstrating the regression
    expect(runningHeader.textContent).toMatch(/Grep\(2\)/);
    expect(runningHeader.textContent).toMatch(/Glob\(1\)/);
  });

  it('running status shows tool breakdown matching completed footer format', () => {
    const stepEvent = makeStepEvent();

    // Multiple tool types with varying counts
    const toolEvents: ToolEventEntry[] = [
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'XYZ_99:s:read_file:0',
        name: 'read_file',
        args: { file_path: '/src/a.py' },
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'XYZ_99:s:read_file:1',
        name: 'read_file',
        args: { file_path: '/src/b.py' },
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'XYZ_99:s:write_file:0',
        name: 'write_file',
        args: { file_path: '/src/c.py' },
      }),
    ];

    render(<StepCard stepEvent={stepEvent} toolEvents={toolEvents} />);

    // Should show stats during running, not just "3 tools"
    const button = screen.getByRole('button');
    const headerContent = button.textContent ?? '';

    // Expected format: "Scan workspace · ReadFile(2) WriteFile(1) ▾"
    // Actual format: "Scan workspace · 3 tools ▾" (regression)
    expect(headerContent).toMatch(/ReadFile\(2\)/);
    expect(headerContent).toMatch(/WriteFile\(1\)/);
  });

  it('running status respects MAX_STAT_TOOL_KINDS limit with overflow', () => {
    const stepEvent = makeStepEvent();

    // 5 different tool types (exceeds MAX_STAT_TOOL_KINDS = 4)
    const toolEvents: ToolEventEntry[] = [
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'MNO_11:s:grep:0',
        name: 'grep',
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'MNO_11:s:glob:0',
        name: 'glob',
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'MNO_11:s:read:0',
        name: 'read',
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'MNO_11:s:write:0',
        name: 'write',
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'MNO_11:s:edit:0',
        name: 'edit',
      }),
    ];

    render(<StepCard stepEvent={stepEvent} toolEvents={toolEvents} />);

    const button = screen.getByRole('button');
    const headerContent = button.textContent ?? '';

    // Should show top 4 tools + "+1 more" (matching TUI behavior)
    expect(headerContent).toMatch(/\+1 more/);
  });

  it('running status excludes task tools from breakdown', () => {
    const stepEvent = makeStepEvent();

    const toolEvents: ToolEventEntry[] = [
      // Regular tool
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'PQR_22:s:grep:0',
        name: 'grep',
      }),
      // Task delegation (should be excluded from stats)
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'PQR_22:s:task:0',
        name: 'task',
        args: { subagent_type: 'explore', description: 'search codebase' },
      }),
    ];

    render(<StepCard stepEvent={stepEvent} toolEvents={toolEvents} />);

    const button = screen.getByRole('button');
    const headerContent = button.textContent ?? '';

    // Should only show Grep(1), NOT Task
    expect(headerContent).toMatch(/Grep\(1\)/);
    expect(headerContent).not.toMatch(/Task\(/);
  });

  it('completed footer already shows correct per-tool breakdown', () => {
    // This test documents current WORKING behavior for completed steps
    const stepEvent = makeStepEvent({ status: 'completed' });
    const toolEvents: ToolEventEntry[] = [
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'COM_33:s:run_command:0',
        name: 'run_command',
      }),
      makeToolEvent('soothe.stream.tool_call.update', {
        tool_call_id: 'COM_33:s:run_command:1',
        name: 'run_command',
      }),
    ];

    const completionEvent = {
      success: true,
      summary: 'Done',
      duration_ms: 1234,
      tool_call_count: 2,
    };

    render(
      <StepCard
        stepEvent={stepEvent}
        toolEvents={toolEvents}
        completionEvent={completionEvent}
      />,
    );

    // Footer shows per-tool breakdown (this WORKS correctly)
    expect(screen.getByText(/RunCommand\(2\)/)).toBeTruthy();
  });
});