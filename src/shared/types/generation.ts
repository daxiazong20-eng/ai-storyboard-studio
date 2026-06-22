import type { AssetType } from './asset';

export type GenerateMode =
  | 'text-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'
  | 'video-extension';

export type TaskStatus = 'pending' | 'running' | 'polling' | 'success' | 'failed' | 'cancelled';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
export type ImageResolution = '1K' | '2K';
export type VideoResolution = '480p' | '720p';

export type GenerationParams = {
  aspectRatio: AspectRatio;
  resolution: ImageResolution | VideoResolution;
  duration?: number;
  n?: number;
  seed?: number;
};

export type GenerationTask = {
  id: string;
  projectId: string;
  mode: GenerateMode;
  provider: 'hermes-grok' | 'mock';
  model: string;
  prompt: string;
  finalPrompt?: string;
  status: TaskStatus;
  inputAssetIds: string[];
  outputAssetIds: string[];
  hermesTaskId?: string;
  requestId?: string;
  sourceVideoId?: string;
  outputAssetType?: AssetType;
  error?: string;
  params: GenerationParams;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  projectId: string;
  mode: GenerateMode;
  model: string;
  prompt: string;
  inputAssetIds: string[];
  sourceVideoId?: string;
  outputAssetType?: AssetType;
  params: GenerationParams;
  storyShotId?: string;
  queueKind?: 'normal' | 'story';
};

export type PromptAsset = {
  id: string;
  name: string;
  type: AssetType;
  filePath: string;
};

export type HermesTaskResult = {
  status: 'queued' | 'running' | 'success' | 'failed';
  taskId?: string;
  requestId?: string;
  localPath?: string;
  localPaths?: string[];
  url?: string;
  urls?: string[];
  outputType?: 'image' | 'video';
  actualDuration?: number;
  error?: string;
  raw?: unknown;
};
