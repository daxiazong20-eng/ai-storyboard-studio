import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FolderOpen, ListRestart, PlugZap, Save } from 'lucide-react';
import type { AppSettings, HermesStatus } from '@shared/types';
import { AppLayout } from '../components/AppLayout';
import { useStudioStore } from '../stores/studioStore';

const stateName: Record<HermesStatus['state'], string> = {
  unchecked: '未检测',
  unavailable: 'Hermes 不可用',
  'hermes-ready': 'Hermes 可用',
  'grok-logged-out': 'Grok 未登录',
  'grok-ready': 'Grok 可用',
  mock: 'Mock 模式'
};

export function SettingsPage() {
  const store = useStudioStore();
  const [draft, setDraft] = useState<(AppSettings & { storageDir: string })>();
  const [status, setStatus] = useState<HermesStatus>(store.hermesStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void window.api.settings.get().then(setDraft); }, []);
  if (!draft) return <AppLayout back><div className="settings">加载设置…</div></AppLayout>;

  const persist = () => window.api.settings.set({
    hermesMode: draft.hermesMode,
    hermesBaseUrl: draft.hermesBaseUrl,
    hermesCliPath: draft.hermesCliPath,
    normalConcurrency: Math.max(1, Math.min(4, draft.normalConcurrency)),
    storyConcurrency: 1
  });
  const check = async () => {
    setBusy(true);
    try { await persist(); setStatus(await window.api.hermes.checkStatus()); }
    catch (error) { store.setError(String(error)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    try { await persist(); store.setError('设置已保存'); setTimeout(() => store.setError(), 1600); }
    catch (error) { store.setError(String(error)); }
  };
  const refresh = async () => {
    setBusy(true);
    try { await persist(); await window.api.models.refresh(); }
    catch (error) { store.setError(String(error)); }
    finally { setBusy(false); }
  };
  const login = async () => {
    try { await window.api.settings.set({ hermesMode: 'cli' }); await window.api.hermes.login(); }
    catch (error) { store.setError(String(error)); }
  };

  return <AppLayout back title="设置"><main className="settings"><div className="settings-inner">
    <section className="panel settings-section"><h2 style={{ marginTop: 0 }}>Hermes 连接</h2>
      <div className="segmented">{(['http', 'cli', 'mock'] as const).map((mode) => <button key={mode} className={draft.hermesMode === mode ? 'active' : ''} onClick={() => setDraft({ ...draft, hermesMode: mode })}>{mode === 'http' ? '本地 HTTP' : mode === 'cli' ? 'Hermes OAuth' : 'Mock'}</button>)}</div>
      <div className="form-grid" style={{ marginTop: 14 }}><label><span className="label">Hermes Base URL</span><input className="field" disabled={draft.hermesMode !== 'http'} value={draft.hermesBaseUrl} onChange={(event) => setDraft({ ...draft, hermesBaseUrl: event.target.value })}/></label><label><span className="label">Hermes CLI 路径</span><input className="field" disabled={draft.hermesMode !== 'cli'} value={draft.hermesCliPath} onChange={(event) => setDraft({ ...draft, hermesCliPath: event.target.value })}/></label></div>
      <div className="card" style={{ padding: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}><span className={`status-dot ${['grok-ready', 'mock'].includes(status.state) ? 'ok' : status.state === 'unavailable' ? 'error' : 'warn'}`}/><div><strong>{stateName[status.state]}</strong><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{status.message}</div></div></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}><button className="btn btn-primary" disabled={busy} onClick={() => void check()}><PlugZap size={16}/>检测 Hermes 状态</button><button className="btn" disabled={busy} onClick={() => void refresh()}><ListRestart size={16}/>刷新模型列表</button><button className="btn" onClick={() => void login()}><ExternalLink size={16}/>在 Hermes 中登录 Grok</button><button className="btn" onClick={() => void window.api.settings.openLoginGuide()}><BookOpen size={16}/>登录说明</button></div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>软件不会读取或保存 Grok 密码、Cookie。OAuth 登录与会话刷新均由本机 Hermes 处理。</p>
    </section>
    <section className="panel settings-section"><h2 style={{ marginTop: 0 }}>任务与存储</h2><div className="form-grid"><label><span className="label">普通生成并发数</span><input className="field" type="number" min={1} max={4} value={draft.normalConcurrency} onChange={(event) => setDraft({ ...draft, normalConcurrency: Number(event.target.value) })}/></label><label><span className="label">短剧批量并发数</span><input className="field" disabled value={1}/></label><label className="form-span"><span className="label">本地存储目录</span><div style={{ display: 'flex', gap: 8 }}><input className="field" readOnly value={draft.storageDir}/><button className="btn" onClick={() => void window.api.settings.openStorage()}><FolderOpen size={16}/>打开</button><button className="btn" onClick={() => void window.api.settings.openLogs()}>日志</button></div></label></div></section>
    <button className="btn btn-primary" onClick={() => void save()}><Save size={16}/>保存设置</button>
  </div></main>{store.error && <div className="error-banner" onClick={() => store.setError()}>{store.error}</div>}</AppLayout>;
}
