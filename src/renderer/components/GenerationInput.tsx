import { useEffect, useState } from 'react';
import { Check, ImagePlus, Library, Play, Send, X } from 'lucide-react';
import type { AspectRatio, AssetType, GenerateMode, ImageResolution, VideoResolution } from '@shared/types';
import { DEFAULT_MODELS } from '@shared/modelRegistry';
import { ASSET_LABELS, MAX_REFERENCE_IMAGES } from '@shared/constants';
import { useStudioStore } from '../stores/studioStore';
import { ModeSelector } from './ModeSelector';
import { isCompatible, ModelSelector } from './ModelSelector';

export function GenerationInput({ projectId }: { projectId: string }) {
  const [mode,setMode]=useState<GenerateMode>('text-to-image'); const [model,setModel]=useState(DEFAULT_MODELS.image[0].id); const [prompt,setPrompt]=useState('');
  const [imageParams,setImageParams]=useState<{aspectRatio:AspectRatio;resolution:ImageResolution;n:number;seed?:number}>({aspectRatio:'1:1',resolution:'1K',n:1});
  const [videoParams,setVideoParams]=useState<{aspectRatio:AspectRatio;resolution:VideoResolution;duration:number}>({aspectRatio:'16:9',resolution:'720p',duration:8});
  const [assetPickerOpen,setAssetPickerOpen]=useState(false);
  const { selectedAssetIds, assets, models, importAssets, createTask, clearSelection, setError } = useStudioStore();
  useEffect(() => {
    const type = mode === 'text-to-image' || mode === 'image-edit' ? 'image' : 'video';
    const compatible = models.filter((item) => item.type === type && isCompatible(mode, item.id));
    const preferred = type === 'image' ? compatible.find((item) => item.id === 'grok-imagine-image-quality') : undefined;
    setModel(preferred?.id || compatible[0]?.id || DEFAULT_MODELS[type].find((item) => isCompatible(mode, item.id))?.id || DEFAULT_MODELS[type][0].id);
  }, [mode,models]);
  useEffect(() => {
    const minimum = mode === 'video-extension' ? 2 : 1;
    const maximum = mode === 'reference-to-video' || mode === 'video-extension' ? 10 : 15;
    setVideoParams((current) => ({ ...current, duration: Math.max(minimum, Math.min(maximum, Math.trunc(current.duration) || 8)) }));
  }, [mode]);
  const selectionLimit = mode === 'image-edit' ? 3 : mode === 'image-to-video' || mode === 'video-extension' ? 1 : MAX_REFERENCE_IMAGES;
  const selectImported = async (type: AssetType) => {
    const added = await importAssets(projectId, type);
    if (!added.length) return;
    const current = useStudioStore.getState().selectedAssetIds;
    const next = [...new Set([...current, ...added.map((asset) => asset.id)])].slice(0, selectionLimit);
    useStudioStore.setState({ selectedAssetIds: next });
    setAssetPickerOpen(true);
  };
  const generate = async () => {
    if (!prompt.trim()) return setError('请输入提示词。');
    const selected=selectedAssetIds.map(id=>assets.find(asset=>asset.id===id)).filter(Boolean);
    const selectedImages=selected.filter(asset=>asset?.type!=='video');
    if (mode === 'image-edit' && (selectedImages.length < 1 || selectedImages.length > 3)) return setError('图片编辑需要选择 1 至 3 张参考图片。');
    if (mode === 'image-to-video' && selectedImages.length < 1) return setError('图生视频需要选择一张首帧图片。');
    if (mode === 'reference-to-video' && selectedImages.length < 1) return setError('多参考图视频需要选择至少一张参考图片。');
    if (mode === 'reference-to-video' && selectedAssetIds.length > MAX_REFERENCE_IMAGES) return setError('Grok 多参考图最多支持 7 张，请减少参考图数量。');
    const sourceVideoId = mode === 'video-extension' ? selectedAssetIds.map((id) => assets.find((asset) => asset.id===id)).find((asset) => asset?.type==='video')?.id : undefined;
    if(mode==='video-extension'&&!sourceVideoId)return setError('视频接续需要先选择一个 MP4 视频资产。');
    const params = mode === 'text-to-image' || mode === 'image-edit' ? imageParams : videoParams;
    try { await createTask({projectId,mode,model,prompt,inputAssetIds:selectedAssetIds,sourceVideoId,params}); setPrompt(''); clearSelection(); } catch {}
  };
  const chooseAsset = (id: string) => {
    if (!selectedAssetIds.includes(id) && selectedAssetIds.length >= selectionLimit) return setError(`当前模式最多选择 ${selectionLimit} 个资产。`);
    useStudioStore.getState().toggleAsset(id);
  };
  const groupedAssets = (Object.keys(ASSET_LABELS) as AssetType[]).map((type) => ({ type, items: assets.filter((asset) => asset.type === type) })).filter((group) => group.items.length);
  return <div className="bottom-composer"><textarea className="field composer-input" placeholder="直接输入要发送给模型的提示词；参考素材可在下方选择资产" value={prompt} onChange={(e)=>setPrompt(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&e.ctrlKey) void generate();}}/>
    {!!selectedAssetIds.length && <div style={{display:'flex',gap:6,flexWrap:'wrap',margin:'7px 0'}}>{selectedAssetIds.map((id)=><span className="tag" key={id}>{assets.find((a)=>a.id===id)?.name || id}<X size={11} onClick={()=>useStudioStore.getState().toggleAsset(id)}/></span>)}</div>}
    <div className="composer-row"><div style={{width:155}}><ModeSelector value={mode} onChange={setMode} compact/></div><div style={{width:240}}><ModelSelector mode={mode} value={model} onChange={setModel}/></div>
      <div className="asset-picker-wrap"><button className={`btn ${selectedAssetIds.length ? 'asset-picker-active' : ''}`} title="从资产库选择参考素材" onClick={()=>setAssetPickerOpen(!assetPickerOpen)}><Library size={16}/>选择资产{selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}</button>
        {assetPickerOpen && <div className="asset-picker"><div className="asset-picker-head"><strong>选择参考资产</strong><div className="spacer"/><button className="btn" title="上传本地图片并自动选中" onClick={()=>void selectImported('reference')}><ImagePlus size={14}/>上传图片</button><button className="btn btn-icon btn-ghost" title="关闭" onClick={()=>setAssetPickerOpen(false)}><X size={15}/></button></div>
          <div className="asset-picker-list">{groupedAssets.length ? groupedAssets.map(({type,items})=><div key={type}><div className="asset-picker-group">{ASSET_LABELS[type]}</div>{items.map((asset)=><button type="button" className={`asset-picker-item ${selectedAssetIds.includes(asset.id)?'selected':''}`} key={asset.id} onClick={()=>chooseAsset(asset.id)}>{validPreview(asset.filePath)?<img src={window.api.mediaUrl(asset.thumbnailPath||asset.filePath)}/>:<span className="asset-picker-thumb">{asset.type==='video'?<Play size={14}/>:<Library size={14}/>}</span>}<span>{asset.name}</span>{selectedAssetIds.includes(asset.id)&&<Check size={15}/>}</button>)}</div>) : <div className="asset-picker-empty">资产库还是空的，请先上传或生成资产。</div>}</div>
        </div>}
      </div>
      <button className="btn" title="上传参考图片并自动选中" onClick={()=>void selectImported('reference')}><ImagePlus size={16}/>参考图</button>
      <button className="btn" title="上传 MP4 并自动选中" onClick={()=>void selectImported('video')}><Play size={16}/>视频</button><span className="muted" style={{fontSize:11}}>已选 {selectedAssetIds.length}/{selectionLimit}</span><div className="spacer"/>
      {(mode === 'text-to-image' || mode === 'image-edit') ? <>
        <select className="field" style={{width:90}} title="图片比例" value={imageParams.aspectRatio} onChange={(e)=>setImageParams({...imageParams,aspectRatio:e.target.value as AspectRatio})}>{['1:1','16:9','9:16','4:3','3:4','3:2','2:3'].map(v=><option key={v}>{v}</option>)}</select>
        <select className="field" style={{width:76}} title="图片清晰度" value={imageParams.resolution} onChange={e=>setImageParams({...imageParams,resolution:e.target.value as ImageResolution})}>{['1K','2K'].map(v=><option key={v}>{v}</option>)}</select>
        <div style={{display:'flex',alignItems:'center',gap:5}} title="图片生成数量"><input className="field" style={{width:62}} type="number" min={1} max={10} value={imageParams.n} aria-label="图片生成数量" onChange={e=>setImageParams({...imageParams,n:Number(e.target.value)})}/><span className="muted">张</span></div>
      </> : <>
        <select className="field" style={{width:90}} title="视频比例" value={videoParams.aspectRatio} onChange={(e)=>setVideoParams({...videoParams,aspectRatio:e.target.value as AspectRatio})}>{['16:9','9:16','1:1','4:3','3:4','3:2','2:3'].map(v=><option key={v}>{v}</option>)}</select>
        <select className="field" style={{width:82}} title="视频清晰度" value={videoParams.resolution} onChange={e=>setVideoParams({...videoParams,resolution:e.target.value as VideoResolution})}>{['480p','720p'].map(v=><option key={v}>{v}</option>)}</select>
        <div style={{display:'flex',alignItems:'center',gap:5}} title={mode==='video-extension'?'新增接续秒数':'生成视频秒数'}><input className="field" style={{width:70}} type="number" step={1} min={mode==='video-extension'?2:1} max={mode==='reference-to-video'||mode==='video-extension'?10:15} value={videoParams.duration} aria-label={mode==='video-extension'?'新增接续秒数':'生成视频秒数'} onChange={(e)=>setVideoParams({...videoParams,duration:Number(e.target.value)})}/><span className="muted">秒</span></div>
      </>}<button className="btn btn-primary" onClick={()=>void generate()}><Send size={16}/>生成</button></div>
  </div>;
}

const validPreview = (path: string) => /\.(png|jpe?g|webp|svg)$/i.test(path);
