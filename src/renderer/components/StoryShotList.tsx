import { Film, GripVertical, Plus, Trash2, Video } from 'lucide-react';
import type { StoryEpisode, StoryShot } from '@shared/types';

type Props = {
  episodes: StoryEpisode[];
  episodeId?: string;
  shots: StoryShot[];
  selectedId?: string;
  onEpisodeSelect(id: string): void;
  onEpisodeCreate(): void;
  onEpisodeDelete(id: string): void;
  onSelect(id: string): void;
  onCreate(): void;
  onDelete(id: string): void;
  onReorder(from: string, to: string): void;
};

export function StoryShotList(props: Props) {
  return <aside className="episode-sidebar">
    <div className="episode-heading"><span>剧集</span><button className="btn btn-icon btn-ghost" title="新建一集" onClick={props.onEpisodeCreate}><Plus size={16}/></button></div>
    <div className="episode-list">{props.episodes.map((episode) => <button className={`episode-row ${episode.id === props.episodeId ? 'active' : ''}`} key={episode.id} onClick={() => props.onEpisodeSelect(episode.id)}>
      <Film size={15}/><span>{episode.title}</span>{props.episodes.length > 1 && <Trash2 size={13} onClick={(event) => { event.stopPropagation(); props.onEpisodeDelete(episode.id); }}/>} </button>)}</div>
    <div className="episode-heading episode-shot-heading"><span>本集镜头</span><button className="btn btn-icon" title="新增镜头" onClick={props.onCreate}><Plus size={16}/></button></div>
    <div className="episode-shots">{props.shots.map((shot) => <div key={shot.id} draggable onDragStart={(event) => event.dataTransfer.setData('shotId', shot.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => props.onReorder(event.dataTransfer.getData('shotId'), shot.id)} className={`shot-card ${shot.id === props.selectedId ? 'active' : ''}`} onClick={() => props.onSelect(shot.id)}>
      <div className="shot-card-line"><GripVertical size={14} className="muted"/><span className="tag">镜 {shot.index}</span><strong>{shot.title}</strong>{shot.generatedVideoAssetId && <Video size={14} color="#36d5aa"/>}<button className="btn btn-icon btn-ghost" title="删除镜头" onClick={(event) => { event.stopPropagation(); props.onDelete(shot.id); }}><Trash2 size={14}/></button></div>
      <div className="muted shot-card-meta">{shot.duration} 秒 · {shot.resolution} · {shot.referenceAssetIds.length} 张参考图</div>
    </div>)}{!props.shots.length && <div className="episode-empty">点击“+”添加本集第一个镜头</div>}</div>
  </aside>;
}
