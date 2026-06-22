import { RotateCcw, XCircle } from 'lucide-react';
import { MODE_LABELS } from '@shared/constants';
import { useStudioStore } from '../stores/studioStore';

export function RightInspector() {
  const { tasks, selectedTaskId, setError } = useStudioStore();
  const task = tasks.find((item) => item.id === selectedTaskId) || tasks[0];
  if (!task) return <aside className="inspector"><div className="section-title">参数与任务</div><div className="muted" style={{padding:14}}>生成后可在这里查看详情</div></aside>;
  return <aside className="inspector"><div className="section-title">任务详情</div><div style={{padding:14}}>
    <Info label="模式" value={MODE_LABELS[task.mode]}/><Info label="模型" value={task.model}/><Info label="比例" value={task.params.aspectRatio}/><Info label="分辨率" value={task.params.resolution}/><Info label="状态" value={task.status}/>
    {task.params.duration && <Info label="时长" value={`${task.params.duration} 秒`}/>}<label className="label">原始提示词</label><div className="field" style={{fontSize:12,whiteSpace:'pre-wrap'}}>{task.prompt}</div>
    <label className="label" style={{marginTop:12}}>最终提示词</label><div className="field" style={{fontSize:11,whiteSpace:'pre-wrap',maxHeight:190,overflow:'auto'}}>{task.finalPrompt}</div>
    {task.error && <div style={{color:'#ff8592',fontSize:12,marginTop:12}}>{task.error}</div>}
    <div style={{display:'flex',gap:8,marginTop:14}}><button className="btn" onClick={() => void window.api.generation.retryTask(task.id).catch((e) => setError(String(e)))}><RotateCcw size={15}/>重新生成</button>
      {['pending','running','polling'].includes(task.status) && <button className="btn btn-danger" onClick={() => void window.api.generation.cancelTask(task.id)}><XCircle size={15}/>取消</button>}</div>
  </div><TaskTail/></aside>;
}
function Info({label,value}:{label:string;value:string}) { return <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:10}}><span className="muted">{label}</span><span>{value}</span></div>; }
function TaskTail(){return <div/>;}
