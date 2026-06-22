export type AssetType =
  | 'character'
  | 'scene'
  | 'prop'
  | 'storyboard'
  | 'firstFrame'
  | 'lastFrame'
  | 'video'
  | 'reference';

export type Asset = {
  id: string;
  projectId: string;
  type: AssetType;
  name: string;
  filePath: string;
  thumbnailPath?: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
