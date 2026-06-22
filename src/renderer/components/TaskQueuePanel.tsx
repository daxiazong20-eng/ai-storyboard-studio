import { GenerationCard } from './GenerationCard';
import { useStudioStore } from '../stores/studioStore';
export function TaskQueuePanel({ limit = 12 }: { limit?: number }) {
  const tasks = useStudioStore((state) => state.tasks); const select = useStudioStore((state) => state.setSelectedTask);
  return <div><div className="section-title">任务队列</div>{!tasks.length && <div className="muted" style={{padding:14,fontSize:12}}>还没有生成任务</div>}
    {tasks.slice(0,limit).map((task) => <GenerationCard key={task.id} task={task} onClick={() => select(task.id)}/>)}</div>;
}
