import { useEffect, useMemo, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { StoryEpisode, StoryShot } from '@shared/types';
import { AppLayout } from '../components/AppLayout';
import { AssetCabinet } from '../components/AssetCabinet';
import { StoryShotList } from '../components/StoryShotList';
import { StoryShotEditor } from '../components/StoryShotEditor';
import { useStudioStore } from '../stores/studioStore';

export function StoryModePage() {
  const { projectId = '' } = useParams();
  const { currentProject, assets, shots, loadProject, loadShots, error, setError } = useStudioStore();
  const [episodes, setEpisodes] = useState<StoryEpisode[]>([]);
  const [episodeId, setEpisodeId] = useState<string>();
  const [shotId, setShotId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const episodeShots = useMemo(() => shots.filter((shot) => shot.episodeId === episodeId), [shots, episodeId]);

  const refreshEpisodes = async (preferredId?: string) => {
    const next = await window.api.story.listEpisodes(projectId);
    setEpisodes(next);
    setEpisodeId(preferredId && next.some((item) => item.id === preferredId) ? preferredId : (episodeId && next.some((item) => item.id === episodeId) ? episodeId : next[0]?.id));
  };

  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId);
    void loadShots(projectId);
    void refreshEpisodes();
  }, [projectId]);

  useEffect(() => {
    if (!episodeShots.some((shot) => shot.id === shotId)) setShotId(episodeShots[0]?.id);
  }, [episodeId, episodeShots, shotId]);

  const createEpisode = async () => {
    const episode = await window.api.story.createEpisode(projectId);
    await refreshEpisodes(episode.id);
    setShotId(undefined);
  };
  const deleteEpisode = async (id: string) => {
    try { await window.api.story.deleteEpisode(id); await loadShots(projectId); await refreshEpisodes(); }
    catch (cause) { setError(String(cause)); }
  };
  const createShot = async () => {
    if (!episodeId) return;
    const shot = await window.api.story.createShot(projectId, episodeId);
    await loadShots(projectId);
    setShotId(shot.id);
  };
  const deleteShot = async (id: string) => {
    await window.api.story.deleteShot(id);
    setShotId(undefined);
    await loadShots(projectId);
  };
  const reorder = async (from: string, to: string) => {
    if (from === to) return;
    const a = episodeShots.find((shot) => shot.id === from);
    const b = episodeShots.find((shot) => shot.id === to);
    if (!a || !b) return;
    await Promise.all([window.api.story.updateShot(a.id, { index: b.index }), window.api.story.updateShot(b.id, { index: a.index })]);
    await loadShots(projectId);
  };
  const generateEpisode = async () => {
    if (!episodeId) return;
    setBusy(true);
    try { await window.api.story.generateAllShots({ projectId, episodeId }); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); await loadShots(projectId); }
  };

  const selectedShot = shots.find((shot) => shot.id === shotId);
  const currentEpisode = episodes.find((episode) => episode.id === episodeId);
  const applyReferences = async (ids: string[]) => {
    if (!selectedShot) return setError('请先新建或选择一个镜头。');
    const referenceAssetIds = [...new Set([...selectedShot.referenceAssetIds, ...ids])];
    if (referenceAssetIds.length > 7) return setError('Grok 多参考图最多支持 7 张，请减少参考图数量。');
    const updated = await window.api.story.updateShot(selectedShot.id, { referenceAssetIds });
    useStudioStore.setState((state) => ({ shots: state.shots.map((item) => item.id === updated.id ? updated : item) }));
  };
  return <AppLayout back title={`${currentProject?.name || '短剧项目'} · ${currentEpisode?.title || '短剧模式'}`} actions={<>
    <button className="btn" onClick={() => void window.api.story.exportJson(projectId)}><Download size={16}/>导出工程</button>
    <button className="btn btn-primary" disabled={busy || !episodeShots.length} onClick={() => void generateEpisode()}><Play size={16}/>{busy ? '生成中' : '生成本集全部镜头'}</button>
  </>}>
    <div className="story-layout story-layout-simple">
      <AssetCabinet targetProjectId={projectId} selectedIds={selectedShot?.referenceAssetIds || []} maxSelection={Math.max(1, 7 - (selectedShot?.referenceAssetIds.length || 0))} actionLabel="引用到当前镜头" onApply={applyReferences}/>
      <StoryShotList episodes={episodes} episodeId={episodeId} shots={episodeShots} selectedId={shotId}
        onEpisodeSelect={setEpisodeId} onEpisodeCreate={() => void createEpisode()} onEpisodeDelete={(id) => void deleteEpisode(id)}
        onSelect={setShotId} onCreate={() => void createShot()} onDelete={(id) => void deleteShot(id)} onReorder={(a, b) => void reorder(a, b)}/>
      <StoryShotEditor projectId={projectId} shot={selectedShot} assets={assets}
        onSaved={(shot: StoryShot) => useStudioStore.setState((state) => ({ shots: state.shots.map((item) => item.id === shot.id ? shot : item) }))}
        onGenerated={() => void loadShots(projectId)}/>
    </div>
    {error && <div className="error-banner" onClick={() => setError()}>{error}</div>}
  </AppLayout>;
}
