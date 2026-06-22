import type { ReactNode } from 'react';
import { ChevronLeft, Home, LogIn, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStudioStore } from '../stores/studioStore';
import { HermesStatusBadge } from './HermesStatusBadge';

export function AppLayout({ children, title, back = false, actions }: { children: ReactNode; title?: string; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate();
  const { hermesStatus, setError } = useStudioStore();
  const login = async () => {
    try {
      await window.api.settings.set({ hermesMode: 'cli' });
      await window.api.hermes.login();
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await window.api.hermes.checkStatus();
        useStudioStore.setState({ hermesStatus: status });
        if (status.state === 'grok-ready') break;
      }
    } catch (error) { setError(String(error)); }
  };
  return <div className="app"><header className="topbar">
    {back && <button className="btn btn-icon" title="返回" onClick={() => navigate(-1)}><ChevronLeft size={18}/></button>}
    <div><div className="brand">{title || 'AI Storyboard Studio'}</div><div className="brand-sub">由 Hermes 驱动的本地 AI 创作工作台</div></div>
    <div className="spacer"/>{actions}{!['grok-ready','mock'].includes(hermesStatus.state) && <button className="btn btn-primary" onClick={() => void login()}><LogIn size={16}/>登录 Grok</button>}<HermesStatusBadge/>
    <button className="btn btn-icon" title="首页" onClick={() => navigate('/')}><Home size={17}/></button>
    <button className="btn btn-icon" title="设置" onClick={() => navigate('/settings')}><Settings size={17}/></button>
  </header>{children}</div>;
}
