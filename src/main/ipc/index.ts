import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { AssetType, CreateTaskInput, StoryShot } from '@shared/types';
import { ALL_DEFAULT_MODELS } from '@shared/modelRegistry';
import { AppDatabase } from '../db/database';
import { FileManager } from '../services/fileManager';
import { GenerationQueue } from '../services/generationQueue';
import { HermesClient } from '../services/hermesClient';

type Context = { db: AppDatabase; files: FileManager; queue: GenerationQueue; hermes: HermesClient };

const validImage = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function registerIpc(ctx: Context): void {
  const { db, files, queue, hermes } = ctx;
  ipcMain.handle('projects:create', (_, input) => db.createProject(input));
  ipcMain.handle('projects:list', () => db.listProjects());
  ipcMain.handle('projects:get', (_, id) => db.getProject(id));
  ipcMain.handle('projects:delete', (_, id, deleteFiles) => { db.deleteProject(id); if (deleteFiles) files.deleteProject(id); });

  ipcMain.handle('assets:import', async (_, input: { projectId: string; type: AssetType }) => {
    const isVideo = input.type === 'video';
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [isVideo
      ? { name: 'MP4 视频', extensions: ['mp4'] }
      : { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled) return [];
    return result.filePaths.map((path) => {
      const ext = extname(path).toLowerCase();
      if (isVideo && ext !== '.mp4') throw new Error('视频接续仅支持 mp4 文件。');
      if (!isVideo && !validImage.has(ext)) throw new Error('文件格式不支持，请选择 PNG、JPG 或 WebP 图片。');
      const copied = files.copyIntoProject(input.projectId, path, input.type);
      return db.createAsset({ projectId: input.projectId, type: input.type, name: basename(path, ext), filePath: copied, tags: ['imported'] });
    });
  });
  ipcMain.handle('assets:list', (_, projectId, type) => db.listAssets(projectId, type));
  ipcMain.handle('assets:copy-to-project', (_, assetIds: string[], projectId: string) => assetIds.map((id) => {
    const source = db.getAsset(id);
    if (!source) throw new Error('引用的资产不存在。');
    if (source.projectId === projectId) return source;
    const copied = files.copyIntoProject(projectId, source.filePath, source.type);
    return db.createAsset({ projectId, type: source.type, name: source.name, filePath: copied, description: source.description, tags: [...source.tags, `copied-from:${source.projectId}`] });
  }));
  ipcMain.handle('assets:delete', (_, id, deleteFile) => {
    const asset = db.getAsset(id);
    if (!asset) return;
    db.deleteAsset(id);
    if (deleteFile) {
      files.deleteFile(asset.filePath);
      if (asset.thumbnailPath) files.deleteFile(asset.thumbnailPath);
    }
  });
  ipcMain.handle('assets:reveal', (_, id) => { const asset = db.getAsset(id); if (asset) files.reveal(asset.filePath); });

  ipcMain.handle('generation:create', (_, input: CreateTaskInput) => queue.create(input));
  ipcMain.handle('generation:retry', (_, id) => queue.retry(id));
  ipcMain.handle('generation:cancel', (_, id) => queue.cancel(id));
  ipcMain.handle('generation:list', (_, projectId) => db.listTasks(projectId));

  ipcMain.handle('settings:get', () => ({ ...db.getAppSettings(), storageDir: files.rootDir }));
  ipcMain.handle('settings:set', (_, changes) => db.setAppSettings(changes));
  ipcMain.handle('settings:open-storage', () => files.openRoot());
  ipcMain.handle('settings:open-logs', () => files.openLogs());
  ipcMain.handle('settings:login-guide', () => shell.openExternal('https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth'));
  ipcMain.handle('hermes:login', () => hermes.launchOAuthLogin());

  ipcMain.handle('hermes:check', async () => {
    const result = await hermes.checkHermesStatus();
    sendAll('hermes:status-changed', result);
    return result;
  });
  ipcMain.handle('models:list', () => db.listModels().length ? db.listModels() : ALL_DEFAULT_MODELS);
  ipcMain.handle('models:refresh', async () => {
    const models = await hermes.listModels(); db.replaceModels(models); sendAll('models:updated', models); return models;
  });

  ipcMain.handle('story:episode-create', (_, projectId) => db.createEpisode(projectId));
  ipcMain.handle('story:episode-list', (_, projectId) => db.listEpisodes(projectId));
  ipcMain.handle('story:episode-update', (_, id, changes) => db.updateEpisode(id, changes));
  ipcMain.handle('story:episode-delete', (_, id) => db.deleteEpisode(id));
  ipcMain.handle('story:create', (_, projectId, episodeId) => db.createShot(projectId, episodeId));
  ipcMain.handle('story:list', (_, projectId, episodeId) => db.listShots(projectId, episodeId));
  ipcMain.handle('story:update', (_, id, changes) => db.updateShot(id, changes));
  ipcMain.handle('story:delete', (_, id) => db.deleteShot(id));
  ipcMain.handle('story:generate', (_, input) => createStoryTask(db, queue, input.shotId));
  ipcMain.handle('story:generate-all', async (_, input) => {
    const shots = db.listShots(input.projectId, input.episodeId);
    const tasks = [];
    for (const shot of shots) {
      const task = createStoryTask(db, queue, shot.id);
      tasks.push(task);
      const completed = await queue.waitForCompletion(task.id);
      if (completed.status !== 'success') throw new Error(`分镜 ${shot.index} 生成失败：${completed.error || '任务未完成'}`);
    }
    return tasks;
  });
  ipcMain.handle('story:export', async (_, projectId) => {
    const project = db.getProject(projectId); if (!project) throw new Error('项目不存在');
    const result = await dialog.showSaveDialog({ defaultPath: `${project.name}-分镜工程.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return undefined;
    writeFileSync(result.filePath, JSON.stringify({ version: 2, project, episodes: db.listEpisodes(projectId), assets: db.listAssets(projectId), shots: db.listShots(projectId) }, null, 2), 'utf8');
    return result.filePath;
  });

  ipcMain.handle('canvas:load', (_, projectId) => db.loadCanvas(projectId));
  ipcMain.handle('canvas:save-node', (_, node) => db.saveCanvasNode(node));
  ipcMain.handle('canvas:save-edge', (_, edge) => db.saveCanvasEdge(edge));

  ['generation:task-updated', 'generation:task-completed', 'generation:task-failed', 'assets:created'].forEach((event) => {
    queue.on(event, (payload) => sendAll(event, payload));
  });
}

function createStoryTask(db: AppDatabase, queue: GenerationQueue, shotId: string) {
  const shot = db.getShot(shotId); if (!shot) throw new Error('分镜不存在');
  const boundIds = [...shot.characters, ...(shot.scene ? [shot.scene] : []), ...shot.props, ...(shot.lastFrameAssetId ? [shot.lastFrameAssetId] : [])];
  const inputs = [...new Set([...shot.referenceAssetIds, ...boundIds])].filter((id) => Boolean(db.getAsset(id))).slice(0, 7);
  if (!inputs.length) throw new Error('当前镜头至少需要选择一张人物、分镜、场景或道具参考图。');
  return queue.create({ projectId: shot.projectId, mode: 'reference-to-video', model: shot.model, prompt: shot.prompt, inputAssetIds: inputs,
    params: { aspectRatio: shot.aspectRatio, resolution: shot.resolution, duration: shot.duration }, storyShotId: shot.id, queueKind: 'story' });
}

const sendAll = (channel: string, payload: unknown) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channel, payload));
