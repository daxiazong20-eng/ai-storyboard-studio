import type { GenerationTask } from '@shared/types';
import { MODE_LABELS } from '@shared/constants';
export function GenerationCard({ task, onClick }: { task: GenerationTask; onClick?(): void }) {
  return <div className="task" onClick={onClick}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{MODE_LABELS[task.mode]}</strong><span className="task-status">{task.status}</span></div>
    <div className="muted" style={{fontSize:11,marginTop:5}}>{task.prompt.slice(0,80)}</div>{task.error && <div style={{color:'#ff8592',fontSize:11,marginTop:5}}>{task.error}</div>}</div>;
}
