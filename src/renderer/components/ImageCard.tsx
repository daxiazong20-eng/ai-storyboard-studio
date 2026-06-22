import type { Asset } from '@shared/types';
import { useStudioStore } from '../stores/studioStore';
import { AssetCardActions } from './AssetCardActions';
export function ImageCard({ asset }: { asset: Asset }) {
  const selected = useStudioStore((state) => state.selectedAssetIds.includes(asset.id));
  return <div className={`media-node ${selected ? 'selected' : ''}`}><img src={window.api.mediaUrl(asset.filePath)} alt={asset.name}/><div className="media-node-body"><strong>{asset.name}</strong><div className="muted" style={{fontSize:11,marginTop:4}}>{asset.description || '本地图片资产'}</div><AssetCardActions asset={asset}/></div></div>;
}
