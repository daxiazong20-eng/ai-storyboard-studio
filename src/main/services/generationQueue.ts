import { EventEmitter } from 'node:events';
import { extname } from 'node:path';
import type { CreateTaskInput, GenerationTask, HermesTaskResult } from '@shared/types';
import { MAX_REFERENCE_IMAGES } from '@shared/constants';
import { AppDatabase } from '../db/database';
import { FileManager } from './fileManager';
import { HermesClient } from './hermesClient';
import { buildPrompt } from './promptBuilder';

type QueueItem = { taskId: string; queueKind: 'normal' | 'story' };

export class GenerationQueue extends EventEmitter {
  private pending: QueueItem[] = [];
  private runningNormal = 0;
  private runningStory = 0;
  private cancelled = new Set<string>();

  constructor(private db: AppDatabase, private files: FileManager, private hermes: HermesClient) { super(); }

  create(input: CreateTaskInput): GenerationTask {
    if (input.mode === 'reference-to-video' && input.inputAssetIds.length > MAX_REFERENCE_IMAGES) throw new Error('Grok 多参考图最多支持 7 张，请减少参考图数量。');
    if (input.mode === 'video-extension') {
      const source = input.sourceVideoId ? this.db.getAsset(input.sourceVideoId) : undefined;
      if (!source || extname(source.filePath).toLowerCase() !== '.mp4') throw new Error('视频接续仅支持 mp4 文件。');
    }
    const projectAssets = this.db.listAssets(input.projectId);
    const built = buildPrompt(input.prompt, projectAssets, input.mode, this.db.getAssets(input.inputAssetIds));
    const mergedIds = [...new Set([...input.inputAssetIds, ...built.referencedAssets.map((asset) => asset.id)])];
    const mergedAssets = this.db.getAssets(mergedIds);
    const imageInputs = mergedAssets.filter((asset) => asset.type !== 'video');
    if (input.mode === 'image-edit' && (imageInputs.length < 1 || imageInputs.length > 3)) {
      throw new Error('图片编辑需要选择 1 至 3 张参考图片。');
    }
    if (input.mode === 'image-to-video' && imageInputs.length < 1) throw new Error('图生视频需要选择一张首帧图片。');
    if (input.mode === 'reference-to-video' && imageInputs.length < 1) throw new Error('多参考图视频需要选择至少一张参考图片。');
    if (['image-edit', 'image-to-video', 'reference-to-video'].includes(input.mode) && imageInputs.length !== mergedAssets.length) {
      throw new Error('当前模式只接受图片参考，请取消选择视频资产。');
    }
    if (input.mode === 'reference-to-video' && mergedIds.length > MAX_REFERENCE_IMAGES) throw new Error('Grok 多参考图最多支持 7 张，请减少参考图数量。');
    const provider = this.db.getAppSettings().hermesMode === 'mock' ? 'mock' : 'hermes-grok';
    const params = normalizeParams(input.mode, input.params);
    const model = normalizeModel(input.mode, input.model);
    const task = this.db.createTask({ ...input, model, inputAssetIds: mergedIds, params }, built.finalPrompt, provider);
    this.pending.push({ taskId: task.id, queueKind: input.queueKind || 'normal' });
    this.emitUpdate(task);
    void this.pump();
    return task;
  }

  cancel(taskId: string): GenerationTask {
    this.cancelled.add(taskId);
    this.pending = this.pending.filter((item) => item.taskId !== taskId);
    const task = this.db.updateTask(taskId, { status: 'cancelled', error: '用户取消任务' });
    this.emitUpdate(task, 'generation:task-updated');
    return task;
  }

  retry(taskId: string): GenerationTask {
    const old = this.db.getTask(taskId);
    if (!old) throw new Error('任务不存在');
    return this.create({ projectId: old.projectId, mode: old.mode, model: old.model, prompt: old.prompt,
      inputAssetIds: old.inputAssetIds, sourceVideoId: old.sourceVideoId, params: old.params,
      outputAssetType: old.outputAssetType,
      storyShotId: this.db.getStoryShotIdForTask(old.id), queueKind: this.db.getStoryShotIdForTask(old.id) ? 'story' : 'normal' });
  }

  waitForCompletion(taskId: string, timeoutMs = 30 * 60_000): Promise<GenerationTask> {
    const current = this.db.getTask(taskId);
    if (!current) return Promise.reject(new Error('任务不存在'));
    if (isTerminal(current.status)) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const finish = (task: GenerationTask) => {
        if (task.id !== taskId || !isTerminal(task.status)) return;
        clearTimeout(timer);
        this.off('generation:task-updated', finish);
        resolve(task);
      };
      const timer = setTimeout(() => {
        this.off('generation:task-updated', finish);
        reject(new Error('等待生成任务完成超时'));
      }, timeoutMs);
      this.on('generation:task-updated', finish);
    });
  }

  private async pump(): Promise<void> {
    const settings = this.db.getAppSettings();
    const nextIndex = this.pending.findIndex((item) => item.queueKind === 'story' ? this.runningStory < 1 : this.runningNormal < settings.normalConcurrency);
    if (nextIndex < 0) return;
    const [item] = this.pending.splice(nextIndex, 1);
    if (item.queueKind === 'story') this.runningStory += 1; else this.runningNormal += 1;
    void this.run(item).finally(() => {
      if (item.queueKind === 'story') this.runningStory -= 1; else this.runningNormal -= 1;
      void this.pump();
    });
    void this.pump();
  }

  private async run(item: QueueItem): Promise<void> {
    let task = this.db.getTask(item.taskId);
    if (!task || this.cancelled.has(task.id)) return;
    try {
      task = this.db.updateTask(task.id, { status: 'running', error: undefined });
      this.emitUpdate(task);
      const inputs = this.db.getAssets(task.inputAssetIds);
      const source = task.sourceVideoId ? this.db.getAsset(task.sourceVideoId) : undefined;
      const request = { model: task.model, prompt: task.finalPrompt || task.prompt, inputPaths: inputs.map((asset) => asset.filePath),
        sourceVideoPath: source?.filePath, params: task.params };
      let result: HermesTaskResult;
      switch (task.mode) {
        case 'text-to-image': result = await this.hermes.generateImage(request); break;
        case 'image-edit': result = await this.hermes.editImage(request); break;
        case 'text-to-video': result = await this.hermes.generateVideo(request); break;
        case 'image-to-video': result = await this.hermes.generateImageToVideo(request); break;
        case 'reference-to-video': result = await this.hermes.generateReferenceVideo(request); break;
        case 'video-extension': result = await this.hermes.extendVideo(request); break;
      }
      if (result.status === 'queued' || result.status === 'running') {
        if (!result.taskId) throw new Error('Hermes 返回了异步任务，但没有 taskId/requestId');
        task = this.db.updateTask(task.id, { status: 'polling', hermesTaskId: result.taskId, requestId: result.requestId });
        this.emitUpdate(task);
        result = await this.poll(task.id, result.taskId);
      }
      if (result.status === 'failed') throw new Error(result.error || 'Hermes 生成失败');
      if (task.mode !== 'video-extension' && task.params.duration !== undefined && result.actualDuration !== undefined &&
          Math.abs(result.actualDuration - task.params.duration) > 0.25) {
        throw new Error(`Grok 返回的视频时长不一致：请求 ${task.params.duration} 秒，实际 ${result.actualDuration} 秒。请重试或切换视频模型。`);
      }
      if (this.cancelled.has(task.id)) return;
      const outputType = task.mode === 'text-to-image' || task.mode === 'image-edit' ? 'image' : 'video';
      const localSources = [...new Set([...(result.localPaths || []), ...(result.localPath ? [result.localPath] : [])])];
      const remoteSources = [...new Set([...(result.urls || []), ...(result.url ? [result.url] : [])])];
      const localPaths: string[] = [];
      for (const path of localSources) localPaths.push(this.files.importGenerated(task.projectId, path, outputType));
      for (const url of remoteSources) localPaths.push(await this.files.download(task.projectId, url, outputType));
      if (!localPaths.length && task.provider === 'mock') {
        const count = outputType === 'image' ? Math.max(1, Math.min(10, task.params.n || 1)) : 1;
        for (let index = 0; index < count; index += 1) localPaths.push(this.files.createMock(task.projectId, outputType, task.prompt));
      }
      if (!localPaths.length) throw new Error('Hermes 任务完成，但没有返回本地路径或下载地址');
      const completedTask = task;
      const assetType = outputType === 'image' ? (completedTask.outputAssetType || 'storyboard') : 'video';
      const assets = localPaths.map((filePath, index) => this.db.createAsset({
        projectId: completedTask.projectId,
        type: assetType,
        name: `${outputType === 'image' ? '生成图片' : '生成视频'} ${new Date().toLocaleTimeString('zh-CN')}${localPaths.length > 1 ? `-${index + 1}` : ''}`,
        filePath,
        description: completedTask.prompt,
        tags: ['generated', completedTask.mode]
      }));
      task = this.db.updateTask(task.id, { status: 'success', outputAssetIds: assets.map((asset) => asset.id) });
      const shotId = this.db.getStoryShotIdForTask(task.id);
      if (shotId && outputType === 'video') this.db.updateShot(shotId, { generatedVideoAssetId: assets[0].id });
      if (task.sourceVideoId) {
        this.db.saveCanvasEdge({ id: `extension-${task.id}`, projectId: task.projectId, source: `asset-${task.sourceVideoId}`,
          target: `asset-${assets[0].id}`, edgeType: 'video-extension' });
      }
      assets.forEach((asset) => this.emit('assets:created', asset));
      this.emitUpdate(task, 'generation:task-completed');
    } catch (error) {
      if (!task) return;
      const message = error instanceof Error ? error.message : String(error);
      task = this.db.updateTask(task.id, { status: 'failed', error: message });
      this.emitUpdate(task, 'generation:task-failed');
    }
  }

  private async poll(localTaskId: string, hermesTaskId: string): Promise<HermesTaskResult> {
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline) {
      if (this.cancelled.has(localTaskId)) return { status: 'failed', error: '用户取消任务' };
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const result = await this.hermes.pollTask(hermesTaskId);
      if (result.status === 'success' || result.status === 'failed') return result;
    }
    return { status: 'failed', error: '视频轮询超时，请稍后重试。' };
  }

  private emitUpdate(task: GenerationTask, event = 'generation:task-updated'): void {
    this.emit(event, task);
    if (event !== 'generation:task-updated') this.emit('generation:task-updated', task);
  }
}

const isTerminal = (status: GenerationTask['status']): boolean => ['success', 'failed', 'cancelled'].includes(status);

function normalizeParams(mode: CreateTaskInput['mode'], params: CreateTaskInput['params']): CreateTaskInput['params'] {
  const aspectRatio = ['9:16', '16:9', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(params.aspectRatio) ? params.aspectRatio : '16:9';
  if (mode === 'text-to-image' || mode === 'image-edit') {
    return {
      aspectRatio,
      resolution: String(params.resolution).toLowerCase() === '2k' ? '2K' : '1K',
      n: Math.max(1, Math.min(10, Number(params.n) || 1)),
      ...(Number.isFinite(params.seed) ? { seed: Number(params.seed) } : {})
    };
  }
  const minDuration = mode === 'video-extension' ? 2 : 1;
  const maxDuration = mode === 'reference-to-video' || mode === 'video-extension' ? 10 : 15;
  const requestedDuration = Math.trunc(Number(params.duration) || 8);
  return {
    aspectRatio,
    resolution: params.resolution === '480p' ? '480p' : '720p',
    duration: Math.max(minDuration, Math.min(maxDuration, requestedDuration))
  };
}

function normalizeModel(mode: CreateTaskInput['mode'], model: string): string {
  const id = String(model || '').trim();
  const imageMode = mode === 'text-to-image' || mode === 'image-edit';
  if (imageMode && /video/i.test(id)) throw new Error('当前是图片生成模式，请选择 Grok 图片模型。');
  if (!imageMode && /imagine-image(?!-to-video)/i.test(id)) throw new Error('当前是视频生成模式，请选择 Grok 视频模型。');
  if (mode === 'image-edit') return 'grok-imagine-image-quality';
  if (['text-to-video', 'reference-to-video', 'video-extension'].includes(mode) && /video-1\.5/i.test(id)) return 'grok-imagine-video';
  if (mode === 'image-to-video' && /video-1\.5(?:-preview|-2026-05-30)?$/i.test(id)) return 'grok-imagine-video-1.5-preview';
  return id || (imageMode ? 'grok-imagine-image' : mode === 'image-to-video' ? 'grok-imagine-video-1.5-preview' : 'grok-imagine-video');
}
