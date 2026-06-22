import type { AspectRatio, VideoResolution } from './generation';

export type StoryEpisode = {
  id: string;
  projectId: string;
  index: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryShot = {
  id: string;
  projectId: string;
  episodeId: string;
  index: number;
  title: string;
  duration: number;
  model: string;
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  characters: string[];
  scene?: string;
  props: string[];
  camera: string;
  action: string;
  dialogueCN?: string;
  dialogueEN?: string;
  prompt: string;
  referenceAssetIds: string[];
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  generatedVideoAssetId?: string;
  previousShotId?: string;
  nextShotId?: string;
  createdAt: string;
  updatedAt: string;
};
