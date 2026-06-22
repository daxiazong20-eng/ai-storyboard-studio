import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { app, shell } from 'electron';
import type { AppSettings, GenerationParams, HermesStatus, HermesTaskResult, ModelInfo } from '@shared/types';
import { ALL_DEFAULT_MODELS } from '@shared/modelRegistry';

type MediaRequest = {
  model: string;
  prompt: string;
  inputPaths?: string[];
  sourceVideoPath?: string;
  params: GenerationParams;
};

type HermesRuntime = {
  agentDir: string;
  python: string;
  bridge: string;
  hermesHome: string;
  bundled: boolean;
  sitePackages?: string;
  launcher?: string;
};

type HermesHttpMap = {
  status: string[];
  models: string[];
  imageGenerate: string;
  imageEdit: string;
  videoGenerate: string;
  videoExtension: string;
  task: (id: string) => string;
  videoTask: (id: string) => string;
};

// Hermes installations can expose different local APIs. Keep every uncertain field here.
const HTTP: HermesHttpMap = {
  status: ['/v1/status', '/status', '/health'],
  models: ['/v1/models', '/models'],
  imageGenerate: '/v1/images/generations',
  imageEdit: '/v1/images/edits',
  videoGenerate: '/v1/videos/generations',
  videoExtension: '/v1/videos/extensions',
  task: (id) => `/v1/tasks/${encodeURIComponent(id)}`,
  videoTask: (id) => `/v1/videos/${encodeURIComponent(id)}`
};

export class HermesClient {
  constructor(private readonly getSettings: () => AppSettings) {}

  async checkHermesStatus(): Promise<HermesStatus> {
    const settings = this.getSettings();
    if (settings.hermesMode === 'mock') return status('mock', 'Mock 模式已启用');
    try {
      const raw = settings.hermesMode === 'http' ? await this.tryHttpGet(HTTP.status) : await this.runBridge({ action: 'status' }, 60_000);
      const loggedIn = detectGrokLogin(raw);
      const runtimeVersion = String(valueOf(raw, ['version']) || '');
      return loggedIn
        ? status('grok-ready', 'Hermes 已连接，Grok OAuth 可用', runtimeVersion)
        : status('grok-logged-out', 'Hermes 已启动，但 Grok 未登录，请先完成 Grok OAuth 登录。', runtimeVersion);
    } catch (error) {
      return status('unavailable', this.normalizeHermesError(error));
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const settings = this.getSettings();
    if (settings.hermesMode === 'mock') return ALL_DEFAULT_MODELS;
    try {
      const raw = settings.hermesMode === 'http' ? await this.tryHttpGet(HTTP.models) : await this.runBridge({ action: 'models' }, 60_000);
      return normalizeModels(raw).length ? normalizeModels(raw) : ALL_DEFAULT_MODELS;
    } catch {
      return ALL_DEFAULT_MODELS;
    }
  }

  generateImage(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('image-generate', request);
  }
  editImage(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('image-edit', request);
  }
  generateVideo(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('text-to-video', request);
  }
  generateImageToVideo(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('image-to-video', request);
  }
  generateReferenceVideo(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('reference-to-video', request);
  }
  extendVideo(request: MediaRequest): Promise<HermesTaskResult> {
    return this.media('video-extension', request);
  }

  async pollTask(taskId: string): Promise<HermesTaskResult> {
    const settings = this.getSettings();
    if (settings.hermesMode === 'mock') return { status: 'success', taskId, outputType: 'video' };
    const raw = settings.hermesMode === 'http'
      ? await this.tryHttpGet([HTTP.task(taskId), HTTP.videoTask(taskId)])
      : await this.runBridge({ action: 'poll', task_id: taskId }, 90_000);
    return normalizeTask(raw);
  }

  async downloadResult(result: HermesTaskResult): Promise<{ localPath?: string; url?: string }> {
    return { localPath: result.localPath, url: result.url };
  }

  async launchOAuthLogin(): Promise<void> {
    const runtime = resolveHermesRuntime(this.getSettings().hermesCliPath);
    const executable = runtime.bundled ? runtime.python : join(runtime.agentDir, 'venv', 'Scripts', 'hermes.exe');
    if (!existsSync(executable)) throw new Error('内置 Hermes 运行时不完整，请重新下载软件。');
    const command = runtime.bundled
      ? `"${runtime.python}" "${runtime.launcher}" auth add xai-oauth`
      : `"${executable}" auth add xai-oauth`;
    const scriptPath = join(app.getPath('userData'), 'Hermes-Grok-OAuth.cmd');
    const script = [
      '@echo off',
      'chcp 65001 >nul',
      'title Hermes Grok OAuth Login',
      `set "HERMES_HOME=${runtime.hermesHome}"`,
      ...(runtime.sitePackages ? [`set "PYTHONPATH=${runtime.sitePackages};${runtime.agentDir}"`] : []),
      command,
      'echo.',
      'echo Hermes OAuth process finished. You can return to AI Storyboard Studio.',
      'pause'
    ].join('\r\n');
    writeFileSync(scriptPath, script, 'utf8');
    const error = await shell.openPath(scriptPath);
    if (error) throw new Error(`无法启动 Hermes OAuth：${error}`);
  }

  normalizeHermesError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not recognized|not found|找不到|Hermes runtime not found/i.test(message)) return '未检测到 Hermes，请先安装并启动 Hermes。';
    if (/401|oauth|login|unauthor/i.test(message)) return 'Hermes 已启动，但 Grok 未登录，请先完成 Grok OAuth 登录。';
    if (/403|quota|credit|spending.limit|额度/i.test(message)) return '当前账号额度不足或模型不可用，请稍后重试或切换模型。';
    if (/timeout|timed out|abort/i.test(message)) return 'Hermes 请求超时，请检查网络或稍后重试。';
    if (/fetch failed|ECONNREFUSED/i.test(message)) return 'Hermes 本地服务不可用，请检查 Base URL 或切换 CLI 模式。';
    return `Hermes 返回错误：${message}`;
  }

  private async media(kind: string, request: MediaRequest): Promise<HermesTaskResult> {
    const settings = this.getSettings();
    const isImageOutput = isImageOutputKind(kind);
    if (settings.hermesMode === 'mock') return { status: 'success', outputType: isImageOutput ? 'image' : 'video', raw: { mock: true } };
    try {
      let raw: unknown;
      if (settings.hermesMode === 'http') {
        const body = buildHttpBody(kind, request);
        const endpoint = isImageOutput
          ? (kind === 'image-edit' ? HTTP.imageEdit : HTTP.imageGenerate)
          : (kind === 'video-extension' ? HTTP.videoExtension : HTTP.videoGenerate);
        raw = await this.http('POST', endpoint, body);
      } else {
        raw = await this.runBridge({
          action: 'submit',
          mode: bridgeMode(kind),
          model: request.model,
          prompt: request.prompt,
          input_paths: request.inputPaths || [],
          source_video_path: request.sourceVideoPath,
          aspect_ratio: request.params.aspectRatio,
          resolution: request.params.resolution,
          ...(isImageOutput ? { n: request.params.n, seed: request.params.seed } : { duration: request.params.duration })
        }, isImageOutput ? 240_000 : 300_000);
      }
      return normalizeTask(raw, isImageOutput ? 'image' : 'video');
    } catch (error) {
      throw new Error(this.normalizeHermesError(error));
    }
  }

  private async tryHttpGet(paths: string[]): Promise<unknown> {
    let last: unknown;
    for (const path of paths) {
      try { return await this.http('GET', path); } catch (error) { last = error; }
    }
    throw last;
  }

  private async http(method: string, path: string, body?: unknown): Promise<unknown> {
    const base = this.getSettings().hermesBaseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal
      });
      const text = await response.text();
      const data = text ? safeJson(text) : {};
      if (!response.ok) throw new Error(`${response.status}: ${String(valueOf(data, ['error', 'message']) || text)}`);
      return data;
    } finally { clearTimeout(timer); }
  }

  private async runBridge(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const runtime = resolveHermesRuntime(this.getSettings().hermesCliPath);
    if (!existsSync(runtime.python) || !existsSync(runtime.agentDir)) {
      throw new Error(`Hermes runtime not found: ${runtime.agentDir}`);
    }
    if (!existsSync(runtime.bridge)) throw new Error(`Hermes media bridge not found: ${runtime.bridge}`);
    return new Promise((resolvePromise, reject) => {
      const child = spawn(runtime.python, [runtime.bridge], {
        cwd: runtime.agentDir,
        windowsHide: true,
        env: {
          ...process.env,
          HERMES_HOME: runtime.hermesHome,
          PYTHONPATH: runtime.sitePackages ? `${runtime.sitePackages};${runtime.agentDir}` : process.env.PYTHONPATH,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Hermes bridge timed out'));
      }, timeoutMs);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', () => {
        clearTimeout(timer);
        const raw = safeJson(stdout.trim());
        const data = raw as Record<string, unknown>;
        if (data && data.success === false) reject(new Error(String(data.error || stderr || 'Hermes bridge failed')));
        else if (!stdout.trim()) reject(new Error(stderr.trim() || 'Hermes bridge returned no data'));
        else resolvePromise(raw);
      });
      child.stdin.end(JSON.stringify(payload));
    });
  }
}

function resolveHermesRuntime(cliPath: string): HermesRuntime {
  const bridge = app.isPackaged ? join(process.resourcesPath, 'hermes_bridge.py') : resolve(app.getAppPath(), 'resources', 'hermes_bridge.py');
  const bundledRoot = app.isPackaged ? join(process.resourcesPath, 'hermes-runtime') : resolve(app.getAppPath(), 'resources', 'hermes-runtime');
  const bundledPython = join(bundledRoot, 'python', 'python.exe');
  const bundledAgent = join(bundledRoot, 'agent');
  const bundledSitePackages = join(bundledRoot, 'site-packages');
  const bundledLauncher = join(bundledRoot, 'hermes_launcher.py');
  if ([bundledPython, bundledAgent, bundledSitePackages, bundledLauncher].every(existsSync)) {
    return {
      agentDir: bundledAgent,
      python: bundledPython,
      bridge,
      hermesHome: join(app.getPath('userData'), 'hermes'),
      bundled: true,
      sitePackages: bundledSitePackages,
      launcher: bundledLauncher
    };
  }
  const localAppData = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const hermesHome = join(localAppData, 'hermes');
  let agentDir = join(hermesHome, 'hermes-agent');
  const configured = String(cliPath || '').trim();
  if (configured && isAbsolute(configured)) {
    const name = basename(configured).toLowerCase();
    if (name.startsWith('hermes') && dirname(configured).toLowerCase().endsWith(join('venv', 'scripts').toLowerCase())) {
      agentDir = dirname(dirname(dirname(configured)));
    } else if (name.startsWith('hermes') && existsSync(join(dirname(configured), 'hermes-agent'))) {
      agentDir = join(dirname(configured), 'hermes-agent');
    }
  }
  return { agentDir, python: join(agentDir, 'venv', 'Scripts', 'python.exe'), bridge, hermesHome, bundled: false };
}

const bridgeMode = (kind: string): string => kind === 'image-generate' ? 'text-to-image' : kind;
const isImageOutputKind = (kind: string): boolean => kind === 'image-generate' || kind === 'image-edit';

function buildHttpBody(kind: string, request: MediaRequest): Record<string, unknown> {
  const isImage = isImageOutputKind(kind);
  const base: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    ...(isImage
      ? { aspect_ratio: request.params.aspectRatio, resolution: String(request.params.resolution).toLowerCase(), n: request.params.n }
      : { duration: request.params.duration })
  };
  if (kind === 'image-edit') {
    const images = request.inputPaths?.map((path) => ({ path })) || [];
    if (images.length === 1) base.image = images[0]; else base.images = images;
  }
  if (!isImage && kind !== 'video-extension') {
    base.aspect_ratio = request.params.aspectRatio;
    base.resolution = request.params.resolution;
  }
  if (kind === 'image-to-video') base.image = request.inputPaths?.[0] ? { path: request.inputPaths[0] } : undefined;
  if (kind === 'reference-to-video') base.reference_images = request.inputPaths?.map((path) => ({ path }));
  if (kind === 'video-extension') base.video = request.sourceVideoPath ? { path: request.sourceVideoPath } : undefined;
  return base;
}

function normalizeTask(raw: unknown, outputType?: 'image' | 'video'): HermesTaskResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nested = (data.data && typeof data.data === 'object' ? data.data : data) as Record<string, unknown>;
  const state = String(nested.status || data.status || '').toLowerCase();
  const taskId = String(nested.taskId || nested.task_id || nested.requestId || nested.request_id || data.taskId || data.request_id || '') || undefined;
  const localPath = String(nested.localPath || nested.local_path || nested.path || '') || undefined;
  const localPaths = Array.isArray(nested.localPaths || nested.local_paths) ? (nested.localPaths || nested.local_paths) as string[] : undefined;
  const url = String(nested.url || (nested.image as Record<string, unknown>)?.url || (nested.video as Record<string, unknown>)?.url || '') || undefined;
  const urls = Array.isArray(nested.urls) ? nested.urls.map(String) : undefined;
  const video = (nested.video && typeof nested.video === 'object' ? nested.video : {}) as Record<string, unknown>;
  const durationValue = nested.actualDuration ?? nested.actual_duration ?? video.duration;
  const actualDuration = Number.isFinite(Number(durationValue)) ? Number(durationValue) : undefined;
  const error = String(nested.error || nested.message || '') || undefined;
  if (error && /fail|error|denied|invalid/i.test(state)) return { status: 'failed', taskId, error, outputType, actualDuration, raw };
  if (localPath || localPaths?.length || url || urls?.length || ['success', 'succeeded', 'done', 'completed'].includes(state)) return { status: 'success', taskId, localPath, localPaths, url, urls, outputType, actualDuration, raw };
  return { status: ['running', 'processing', 'polling'].includes(state) ? 'running' : 'queued', taskId, requestId: taskId, outputType, actualDuration, raw };
}

function normalizeModels(raw: unknown): ModelInfo[] {
  const data = raw as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
  return list.map((item: unknown) => {
    const model = item as Record<string, unknown>;
    const id = String(model.id || model.name || '');
    const sourceType = String(model.type || model.modality || '');
    const type: ModelInfo['type'] = /video/i.test(sourceType + id) ? 'video' : /image|imagine-image/i.test(sourceType + id) ? 'image' : 'text';
    const name = String(model.display_name || model.displayName || model.name || id);
    return { id, name, type, provider: 'hermes-grok' as const };
  }).filter((model: ModelInfo, index: number, models: ModelInfo[]) => model.id && models.findIndex((item) => item.id === model.id) === index);
}

const safeJson = (text: string): unknown => { try { return JSON.parse(text); } catch { return { message: text }; } };
const valueOf = (raw: unknown, keys: string[]): unknown => {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  for (const key of keys) if (data[key] !== undefined) return data[key];
  return undefined;
};
const detectGrokLogin = (raw: unknown): boolean => {
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).oauth_available === true) return true;
  const text = JSON.stringify(raw).toLowerCase();
  if (/grok.*(not.?logged|unauth|missing)|oauth.*false/.test(text)) return false;
  return /grok|xai|oauth|authenticated|logged.?in/.test(text);
};
const status = (state: HermesStatus['state'], message: string, version?: string): HermesStatus => ({ state, message, version, checkedAt: new Date().toISOString() });
