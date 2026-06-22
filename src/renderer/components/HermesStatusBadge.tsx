import { PlugZap } from 'lucide-react';
import { useStudioStore } from '../stores/studioStore';

export function HermesStatusBadge() {
  const status = useStudioStore((state) => state.hermesStatus);
  const ok = status.state === 'grok-ready' || status.state === 'mock';
  const warn = status.state === 'unchecked' || status.state === 'grok-logged-out';
  return <div className="btn btn-ghost" title={status.message}><span className={`status-dot ${ok ? 'ok' : warn ? 'warn' : 'error'}`} />
    <PlugZap size={15}/><span>{status.state === 'grok-ready' ? 'Grok 可用' : status.state === 'mock' ? 'Mock 模式' : status.state === 'grok-logged-out' ? 'Grok 未登录' : status.state === 'unavailable' ? 'Hermes 不可用' : '未检测'}</span></div>;
}
