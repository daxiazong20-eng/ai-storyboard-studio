import { useCallback, useEffect, useMemo } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useEdgesState, useNodesState, type Edge, type Node, type NodeChange } from '@xyflow/react';
import type { Asset, CanvasEdge, CanvasNode } from '@shared/types';
import { ImageCard } from './ImageCard';
import { VideoCard } from './VideoCard';

const AssetNode = ({ data }: { data: { asset: Asset } }) => data.asset.type === 'video' ? <VideoCard asset={data.asset}/> : <ImageCard asset={data.asset}/>;
const nodeTypes = { asset: AssetNode };

export function Canvas({ projectId, assets }: { projectId: string; assets: Asset[] }) {
  const generatedNodes = useMemo(() => assets.map((asset, index): Node => ({ id:`asset-${asset.id}`, type:'asset', position:{x:80+(index%4)*250,y:70+Math.floor(index/4)*205}, data:{asset} })), [assets]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(generatedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    void window.api.canvas.load(projectId).then((saved) => {
      const positions = new Map(saved.nodes.map((node) => [node.id, node]));
      setNodes(generatedNodes.map((node) => positions.has(node.id) ? { ...node, position:{x:positions.get(node.id)!.x,y:positions.get(node.id)!.y} } : node));
      setEdges(saved.edges.map((edge) => ({ id:edge.id, source:edge.source, target:edge.target, animated:edge.edgeType==='video-extension', label:edge.edgeType==='video-extension'?'接续':'', style:{stroke:'#31d5aa',strokeWidth:2} })));
    });
  }, [projectId, generatedNodes, setNodes, setEdges]);
  const handleChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type !== 'position' || !change.position || change.dragging) return;
      const assetId = change.id.replace(/^asset-/, '');
      const node: CanvasNode = { id:change.id, projectId, assetId, nodeType:'asset', x:change.position.x, y:change.position.y, data:{} };
      void window.api.canvas.saveNode(node);
    });
  }, [onNodesChange, projectId]);
  return <ReactFlow nodes={nodes} edges={edges} onNodesChange={handleChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:0.25,maxZoom:0.95}} minZoom={0.2} maxZoom={2}>
    <Background color="#21314a" gap={22}/><Controls/><MiniMap pannable zoomable nodeColor="#245da8" style={{background:'#0c1726'}}/>
  </ReactFlow>;
}
