import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Play, RotateCcw, Save, X } from 'lucide-react';
import type { AspectRatio, Asset, StoryShot, VideoResolution } from '@shared/types';
import { MAX_REFERENCE_IMAGES } from '@shared/constants';
import { DEFAULT_MODELS } from '@shared/modelRegistry';
import { useStudioStore } from '../stores/studioStore';

export function StoryShotEditor({ shot, assets, onSaved, onGenerated }: { projectId: string; shot?: StoryShot; assets: Asset[]; onSaved(shot: StoryShot): void; onGenerated(): void }) {
  const { models, setError } = useStudioStore();
  const [draft, setDraft] = useState<StoryShot>();
  const [busy, setBusy] = useState(false);
  const compatibleModels = useMemo(() => models.filter((item) => item.type === 'video' && !/video-1\.5/i.test(item.id)), [models]);
  useEffect(() => setDraft(shot), [shot]);
  useEffect(() => {
    if (!draft) return;
    const available = compatibleModels.length ? compatibleModels : DEFAULT_MODELS.video.filter((item) => !/video-1\.5/i.test(item.id));
    if (!available.some((item) => item.id === draft.model)) setDraft({ ...draft, model: available[0]?.id || 'grok-imagine-video' });
  }, [compatibleModels, draft?.id]);
  if (!draft) return <main className="shot-editor shot-editor-simple"><div className="story-welcome"><Play size={34}/><strong>选择或新增一个镜头</strong><span>每个镜头用参考图和提示词直接生成视频。</span></div></main>;

  const save = async () => {
    if (!draft.prompt.trim()) throw new Error('请输入镜头提示词。');
    if (!draft.referenceAssetIds.length) throw new Error('至少选择一张参考图。');
    const result = await window.api.story.updateShot(draft.id, { ...draft, duration: Math.max(1, Math.min(10, Math.trunc(draft.duration) || 8)) });
    setDraft(result);
    onSaved(result);
    return result;
  };
  const generate = async () => {
    setBusy(true);
    try { await save(); await window.api.story.generateShot({ shotId: draft.id }); onGenerated(); }
    catch (cause) { setError(cleanError(cause)); }
    finally { setBusy(false); }
  };
  const toggleReference = (id: string) => {
    if (draft.referenceAssetIds.includes(id)) return setDraft({ ...draft, referenceAssetIds: draft.referenceAssetIds.filter((item) => item !== id) });
    if (draft.referenceAssetIds.length >= MAX_REFERENCE_IMAGES) return setError('Grok 多参考图最多支持 7 张，请减少参考图数量。');
    setDraft({ ...draft, referenceAssetIds: [...draft.referenceAssetIds, id] });
  };
  const selectedAssets = draft.referenceAssetIds.map((id) => assets.find((asset) => asset.id === id)).filter(Boolean) as Asset[];
  const video = draft.generatedVideoAssetId ? assets.find((asset) => asset.id === draft.generatedVideoAssetId) : undefined;
  const modelOptions = compatibleModels.length ? compatibleModels : DEFAULT_MODELS.video.filter((item) => !/video-1\.5/i.test(item.id));

  return <main className="shot-editor shot-editor-simple">
    <header className="shot-editor-header"><div><h2>镜 {draft.index}</h2><span>多参考图生成视频</span></div><button className="btn" onClick={() => void save().catch((cause) => setError(cleanError(cause)))}><Save size={15}/>保存</button></header>
    <section className="story-section"><div className="story-section-title"><span>镜头名称</span></div><input className="field" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></section>
    <section className="story-section"><div className="story-section-title"><span>参考图</span><small>按选择顺序传给模型，最多 7 张</small></div>
      {selectedAssets.length ? <div className="story-selected-assets">{selectedAssets.map((asset, index) => <button className="story-selected-asset" key={asset.id} title="点击移除引用" onClick={() => toggleReference(asset.id)}>{validPreview(asset.filePath) ? <img src={window.api.mediaUrl(asset.thumbnailPath || asset.filePath)}/> : <div><ImagePlus size={18}/></div>}<span><b>{index + 1}</b>@{asset.name}</span><X size={13}/></button>)}</div> : <div className="story-reference-empty"><ImagePlus size={20}/><span>从左侧“资产”收纳夹多选人物、分镜板、场景或道具，然后引用到当前镜头。</span></div>}
    </section>
    <section className="story-section"><div className="story-section-title"><span>提示词</span><small>输入内容会原样发送</small></div><textarea className="field story-prompt" value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="描述人物动作、镜头运动、环境变化和台词……"/></section>
    <section className="story-section"><div className="story-section-title"><span>视频参数</span></div><div className="story-params">
      <label><span className="label">模型</span><select className="field" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })}>{modelOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span className="label">画面比例</span><select className="field" value={draft.aspectRatio} onChange={(event) => setDraft({ ...draft, aspectRatio: event.target.value as AspectRatio })}>{['9:16','16:9','1:1','4:3','3:4','3:2','2:3'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span className="label">清晰度</span><select className="field" value={draft.resolution} onChange={(event) => setDraft({ ...draft, resolution: event.target.value as VideoResolution })}><option>480p</option><option>720p</option></select></label>
      <label><span className="label">秒数</span><input className="field" type="number" step={1} min={1} max={10} value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: Number(event.target.value) })}/></label>
    </div></section>
    {video && <section className="story-section"><div className="story-section-title"><span>生成结果</span></div><video className="story-result-video" src={window.api.mediaUrl(video.filePath)} controls/></section>}
    <div className="story-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void generate()}><Play size={16}/>{busy ? '提交中' : '生成当前镜头'}</button>{draft.generatedVideoAssetId && <button className="btn" disabled={busy} onClick={() => void generate()}><RotateCcw size={15}/>重新生成</button>}</div>
  </main>;
}

const validPreview = (path: string) => /\.(png|jpe?g|webp|svg)$/i.test(path);
const cleanError = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');
