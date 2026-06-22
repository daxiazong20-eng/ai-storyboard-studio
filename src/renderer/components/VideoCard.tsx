import { Film } from 'lucide-react';
import type { Asset } from '@shared/types';
import { useStudioStore } from '../stores/studioStore';
import { AssetCardActions } from './AssetCardActions';
export function VideoCard({ asset }: { asset: Asset }) {
  const mock = asset.filePath.endsWith('.json');
  const selected = useStudioStore((state) => state.selectedAssetIds.includes(asset.id));
  return <div className={`media-node ${selected ? 'selected' : ''}`}>{mock ? <div style={{height:130,display:'grid',placeItems:'center',background:'#080e18'}}><Film size={40} color="#4f8fff"/></div>
    : <video className="nodrag" src={window.api.mediaUrl(asset.filePath)} controls preload="metadata"/>}<div className="media-node-body"><strong>{asset.name}</strong><div className="muted" style={{fontSize:11,marginTop:4}}>{mock ? 'Mock 视频占位结果' : '本地视频片段'}</div><AssetCardActions asset={asset}/></div></div>;
}
