import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { soothe } from '../../lib/ipc.js';
import type { DagNodeIpc, JobDagIpcResponse, JobStatusIpcResponse } from '@shared/ipc';

export interface DagNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  status: string;
  priority: number;
  assignedLoopId?: string;
  stepsCompleted: number;
  stepsTotal: number;
  toolCalls: number;
  summary?: string;
  findings?: string[];
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;
const H_GAP = 40;
const V_GAP = 60;

function layoutNodes(
  dagNodes: DagNodeIpc[],
  dagEdges: Array<{ source: string; target: string }>,
  rootId: string,
): Node<DagNodeData>[] {
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string[]>();
  for (const edge of dagEdges) {
    const children = childrenMap.get(edge.source) ?? [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    const parents = parentMap.get(edge.target) ?? [];
    parents.push(edge.source);
    parentMap.set(edge.target, parents);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  const levelWidths = new Map<number, number>();

  function assignLevel(nodeId: string, level: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const w = levelWidths.get(level) ?? 0;
    positions.set(nodeId, { x: w * (NODE_WIDTH + H_GAP), y: level * (NODE_HEIGHT + V_GAP) });
    levelWidths.set(level, w + 1);
    const children = childrenMap.get(nodeId) ?? [];
    for (const child of children) {
      assignLevel(child, level + 1);
    }
  }

  const root = rootId || dagNodes[0]?.id;
  if (root) assignLevel(root, 0);
  for (const node of dagNodes) {
    if (!visited.has(node.id)) assignLevel(node.id, 0);
  }

  return dagNodes.map(node => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      type: 'dagNode',
      position: pos,
      data: {
        label: node.description.slice(0, 60),
        description: node.description,
        status: node.status,
        priority: node.priority,
        assignedLoopId: node.assigned_loop_id,
        stepsCompleted: node.steps_completed,
        stepsTotal: node.steps_total,
        toolCalls: node.tool_calls,
        summary: node.summary,
        findings: node.findings,
      },
    };
  });
}

function buildEdges(
  dagEdges: Array<{ source: string; target: string }>,
): Edge[] {
  return dagEdges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: true,
  }));
}

interface UseDagDataReturn {
  nodes: Node<DagNodeData>[];
  edges: Edge[];
  jobStatus: JobStatusIpcResponse | null;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

export function useDagData(jobId: string | undefined, pollInterval = 2000): UseDagDataReturn {
  const [nodes, setNodes] = useState<Node<DagNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatusIpcResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!jobId) return;
    try {
      const [dagResp, statusResp] = await Promise.all([
        soothe().jobDag({ jobId }),
        soothe().jobStatus({ jobId }),
      ]) as [JobDagIpcResponse, JobStatusIpcResponse];

      if (dagResp.error) {
        setError(dagResp.error);
        return;
      }
      if (statusResp.error) {
        setError(statusResp.error);
        return;
      }
      setError(undefined);
      setJobStatus(statusResp);
      setNodes(layoutNodes(dagResp.dag.nodes, dagResp.dag.edges, dagResp.dag.root_id));
      setEdges(buildEdges(dagResp.dag.edges));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [jobId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  }, [fetchData]);

  useEffect(() => {
    if (!jobId) {
      setNodes([]);
      setEdges([]);
      setJobStatus(null);
      return;
    }
    void refresh();

    intervalRef.current = setInterval(() => {
      void fetchData();
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, pollInterval, refresh, fetchData]);

  return { nodes, edges, jobStatus, loading, error, refresh };
}
