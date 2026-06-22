export type Project = {
  id: string;
  name: string;
  type: 'normal' | 'story';
  coverPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasNode = {
  id: string;
  projectId: string;
  assetId?: string;
  nodeType: 'asset' | 'storyShot' | 'group';
  x: number;
  y: number;
  data: Record<string, unknown>;
};

export type CanvasEdge = {
  id: string;
  projectId: string;
  source: string;
  target: string;
  edgeType: 'default' | 'video-extension';
};
