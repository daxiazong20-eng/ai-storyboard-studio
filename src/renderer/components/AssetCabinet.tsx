import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Folder, FolderOpen, ImagePlus, Sparkles, X } from 'lucide-react';
import type { Asset, AssetType } from '@shared/types';
import { ASSET_LABELS } from '@shared/constants';
import { DEFAULT_MODELS } from '@shared/modelRegistry';
import { useStudioStore } from '../stores/studioStore';

const TYPES = Object.keys(ASSET_LABELS) as AssetType[];

type Props = {
  targetProjectId: string;
  selectedIds?: string[];
  maxSelection?: number;
  actionLabel?: string;
  onApply(assetIds: string[]): void | Promise<void>;
};

export function AssetCabinet({ targetProjectId, selectedIds = [], maxSelection = 7, actionLabel = '用于本次生成', onApply }: Props) {
  const { projects, assets: currentAssets, models, setError } = useStudioStore();
  const [open, setOpen] = useState(false);
  const [folderProjectId, setFolderProjectId] = useState(targetProjectId);
  const [folderAssets, setFolderAssets] = useState<Asset[]>([]);
  const [type, setType] = useState<AssetType>('character');
  const [picked, setPicked] = useState<string[]>([]);
  const [generatingType, setGeneratingType] = useState<AssetType>();
  const [generationPrompt, setGenerationPrompt] = useState('');

  const loadFolder = async (projectId = folderProjectId) => {
    const next = projectId === targetProjectId ? useStudioStore.getState().assets : await window.api.assets.list(projectId);
    setFolderAssets(next);
  };
  useEffect(() => { if (open) void loadFolder(folderProjectId); }, [open, folderProjectId, currentAssets]);
  useEffect(() => window.api.on('assets:created', (payload) => {
    const asset = payload as Asset;
    if (asset.projectId === folderProjectId) setFolderAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)]);
  }), [folderProjectId]);

  const visibleAssets = useMemo(() => folderAssets.filter((asset) => asset.type === type), [folderAssets, type]);
  const toggle = (id: string) => {
    if (picked.includes(id)) return setPicked(picked.filter((item) => item !== id));
    if (picked.length >= maxSelection) return setError(`最多选择 ${maxSelection} 个资产。`);
    setPicked([...picked, id]);
  };
  const upload = async () => {
    const added = await window.api.assets.import({ projectId: folderProjectId, type });
    setFolderAssets((items) => [...added, ...items]);
    if (folderProjectId === targetProjectId) useStudioStore.setState((state) => ({ assets: [...added, ...state.assets] }));
  };
  const generate = async () => {
    if (!generatingType || !generationPrompt.trim()) return setError('请输入资产生成提示词。');
    try {
      await window.api.generation.createTask({
        projectId: folderProjectId,
        mode: 'text-to-image',
        model: models.find((item) => item.id === 'grok-imagine-image-quality')?.id || DEFAULT_MODELS.image[0].id,
        prompt: generationPrompt,
        inputAssetIds: [],
        outputAssetType: generatingType,
        params: { aspectRatio: generatingType === 'character' ? '3:4' : '16:9', resolution: '1K', n: 1 }
      });
      setGeneratingType(undefined);
      setGenerationPrompt('');
    } catch (cause) { setError(cleanError(cause)); }
  };
  const apply = async () => {
    if (!picked.length) return setError('请先选择资产。');
    try {
      const resolved = folderProjectId === targetProjectId ? folderAssets.filter((asset) => picked.includes(asset.id)) : await window.api.assets.copyToProject(picked, targetProjectId);
      if (folderProjectId !== targetProjectId) useStudioStore.setState((state) => ({ assets: [...resolved, ...state.assets] }));
      await onApply(resolved.map((asset) => asset.id));
      setPicked([]);
      setOpen(false);
    } catch (cause) { setError(cleanError(cause)); }
  };

  return <>
    <aside className="asset-cabinet-rail"><button title="打开资产收纳夹" onClick={() => setOpen(true)}><Folder size={21}/><span>资产</span></button></aside>
    {open && <div className="asset-cabinet-layer"><button className="asset-cabinet-backdrop" aria-label="关闭资产收纳夹" onClick={() => setOpen(false)}/><section className="asset-cabinet">
      <header><div><FolderOpen size={19}/><strong>资产收纳夹</strong></div><button className="btn btn-icon btn-ghost" title="关闭" onClick={() => setOpen(false)}><X size={17}/></button></header>
      <div className="cabinet-projects"><div className="cabinet-caption">项目文件夹</div>{projects.map((project) => <button className={project.id === folderProjectId ? 'active' : ''} key={project.id} onClick={() => { setFolderProjectId(project.id); setPicked([]); }}><Folder size={15}/><span>{project.name}</span><ChevronRight size={13}/></button>)}</div>
      <div className="cabinet-types">{TYPES.map((item) => <button className={item === type ? 'active' : ''} key={item} onClick={() => setType(item)}>{ASSET_LABELS[item]}<span>{folderAssets.filter((asset) => asset.type === item).length}</span></button>)}</div>
      <div className="cabinet-toolbar"><span>{ASSET_LABELS[type]}</span><div className="spacer"/>{type !== 'video' && <button className="btn" onClick={() => setGeneratingType(type)}><Sparkles size={14}/>Grok 生成</button>}<button className="btn" onClick={() => void upload()}><ImagePlus size={14}/>上传</button></div>
      <div className="cabinet-assets">{visibleAssets.map((asset) => <button className={`cabinet-asset ${picked.includes(asset.id) || selectedIds.includes(asset.id) ? 'selected' : ''}`} key={asset.id} onClick={() => toggle(asset.id)} onDoubleClick={() => { setPicked([asset.id]); }}>
        {previewable(asset.filePath) ? <img src={window.api.mediaUrl(asset.thumbnailPath || asset.filePath)}/> : <div><ImagePlus size={20}/></div>}<span>@{asset.name}</span>{(picked.includes(asset.id) || selectedIds.includes(asset.id)) && <i><Check size={13}/></i>}
      </button>)}{!visibleAssets.length && <div className="cabinet-empty">这个分类还没有资产，可以上传或用 Grok 生成。</div>}</div>
      <footer><span>已选择 {picked.length}/{maxSelection}</span><div className="spacer"/><button className="btn" onClick={() => setPicked([])}>清空</button><button className="btn btn-primary" disabled={!picked.length} onClick={() => void apply()}>{actionLabel}</button></footer>
    </section></div>}
    {generatingType && <div className="modal-backdrop"><div className="modal"><h2 style={{marginTop:0}}>Grok 生成{ASSET_LABELS[generatingType]}</h2><label className="label">提示词</label><textarea className="field" autoFocus style={{minHeight:120}} value={generationPrompt} onChange={(event) => setGenerationPrompt(event.target.value)} placeholder="输入内容会原样发送给图片模型"/><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}><button className="btn" onClick={() => setGeneratingType(undefined)}>取消</button><button className="btn btn-primary" onClick={() => void generate()}><Sparkles size={15}/>生成</button></div></div></div>}
  </>;
}

const previewable = (path: string) => /\.(png|jpe?g|webp|svg)$/i.test(path);
const cleanError = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');
