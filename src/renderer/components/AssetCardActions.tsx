import { AtSign, FolderOpen, Trash2 } from 'lucide-react';
import type { Asset } from '@shared/types';
import { useStudioStore } from '../stores/studioStore';

export function AssetCardActions({ asset }: { asset: Asset }) {
  const selected = useStudioStore((state) => state.selectedAssetIds.includes(asset.id));
  const toggleAsset = useStudioStore((state) => state.toggleAsset);
  const deleteAsset = useStudioStore((state) => state.deleteAsset);

  const remove = async () => {
    if (!window.confirm(`确定删除“${asset.name}”及其本地文件吗？`)) return;
    await deleteAsset(asset.id);
  };

  return <div className="media-node-actions nodrag nopan">
    <button className={selected ? 'active' : ''} title={selected ? '取消引用' : '引用到生成输入'} onClick={() => toggleAsset(asset.id)}><AtSign size={14}/></button>
    <button title="在文件夹中显示" onClick={() => void window.api.assets.reveal(asset.id)}><FolderOpen size={14}/></button>
    <button className="danger" title="删除资产和本地文件" onClick={() => void remove()}><Trash2 size={14}/></button>
  </div>;
}
