import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../../state/store.js';
import { DagNodeComponent } from './DagNode.js';
import { DagToolbar } from './DagToolbar.js';
import { useDagData, type DagNodeData } from './useDagData.js';
import { LorView } from '../lor/LorView.js';
import type { Node } from '@xyflow/react';

const nodeTypes: NodeTypes = {
  dagNode: DagNodeComponent,
};

export function DagView(): React.ReactElement {
  const activeJobId = useStore(s => s.activeJobId);
  const { nodes, edges, jobStatus, loading, error, refresh } = useDagData(activeJobId);
  const [lorTarget, setLorTarget] = useState<{
    jobId: string;
    goalId: string;
    loopId: string;
    description: string;
  } | null>(null);

  const onNodeClick: NodeMouseHandler<Node<DagNodeData>> = useCallback((_event, node) => {
    const data = node.data;
    if (data.assignedLoopId && activeJobId) {
      setLorTarget({
        jobId: activeJobId,
        goalId: node.id,
        loopId: data.assignedLoopId,
        description: data.description,
      });
    }
  }, [activeJobId]);

  if (lorTarget) {
    return (
      <LorView
        jobId={lorTarget.jobId}
        goalId={lorTarget.goalId}
        loopId={lorTarget.loopId}
        goalDescription={lorTarget.description}
        onBack={() => setLorTarget(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <DagToolbar jobStatus={jobStatus} onRefresh={refresh} />
      <div className="relative flex-1">
        {loading && nodes.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            Loading DAG...
          </div>
        )}
        {error && (
          <div className="absolute left-4 top-4 z-10 rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
