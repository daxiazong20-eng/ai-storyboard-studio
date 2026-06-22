import type { AssetType, GenerateMode } from '../types';

export const MODE_LABELS: Record<GenerateMode, string> = {
  'text-to-image': '文生图',
  'image-edit': '图片编辑',
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'reference-to-video': '多参考图视频',
  'video-extension': '视频尾帧接续'
};

export const ASSET_LABELS: Record<AssetType, string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  storyboard: '分镜',
  firstFrame: '首帧',
  lastFrame: '尾帧',
  video: '视频片段',
  reference: '临时参考图'
};

export const IMAGE_MODES: GenerateMode[] = ['text-to-image', 'image-edit'];
export const VIDEO_MODES: GenerateMode[] = ['text-to-video', 'image-to-video', 'reference-to-video', 'video-extension'];
export const MAX_REFERENCE_IMAGES = 7;
