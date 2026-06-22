import { useEffect } from 'react';
import { Clapperboard } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AssetCabinet } from '../components/AssetCabinet';
import { Canvas } from '../components/Canvas';
import { GenerationInput } from '../components/GenerationInput';
import { RightInspector } from '../components/RightInspector';
import { useStudioStore } from '../stores/studioStore';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { currentProject, assets, selectedAssetIds, loadProject, error, setError } = useStudioStore();
  useEffect(() => { if (projectId) void loadProject(projectId); }, [projectId, loadProject]);
  const applyAssets = (ids: string[]) => useStudioStore.setState((state) => ({ selectedAssetIds: [...new Set([...state.selectedAssetIds, ...ids])] }));
  return <AppLayout back title={currentProject?.name || '创作工作台'} actions={<button className="btn" onClick={() => navigate(`/story/${projectId}`)}><Clapperboard size={16}/>短剧模式</button>}>
    <div className="workspace workspace-cabinet"><AssetCabinet targetProjectId={projectId} selectedIds={selectedAssetIds} onApply={applyAssets}/><main className="canvas-wrap"><Canvas projectId={projectId} assets={assets}/><GenerationInput projectId={projectId}/></main><RightInspector/></div>
    {error && <div className="error-banner" onClick={() => setError()}>{error}</div>}
  </AppLayout>;
}
