import type { AppSettings, Asset, AssetType, CanvasEdge, CanvasNode, CreateTaskInput, GenerationTask, HermesStatus, ModelInfo, Project, StoryEpisode, StoryShot } from './index';

export type StudioApi = {
  projects: {
    create(input: { name: string; type: Project['type'] }): Promise<Project>;
    list(): Promise<Project[]>;
    get(id: string): Promise<Project | undefined>;
    delete(id: string, deleteFiles: boolean): Promise<void>;
  };
  assets: {
    import(input: { projectId: string; type: AssetType }): Promise<Asset[]>;
    copyToProject(assetIds: string[], projectId: string): Promise<Asset[]>;
    list(projectId: string, type?: AssetType): Promise<Asset[]>;
    delete(id: string, deleteFile: boolean): Promise<void>;
    reveal(id: string): Promise<void>;
  };
  generation: {
    createTask(input: CreateTaskInput): Promise<GenerationTask>;
    retryTask(id: string): Promise<GenerationTask>;
    cancelTask(id: string): Promise<GenerationTask>;
    listTasks(projectId?: string): Promise<GenerationTask[]>;
  };
  settings: {
    get(): Promise<AppSettings & { storageDir: string }>;
    set(changes: Partial<AppSettings>): Promise<AppSettings>;
    openStorage(): Promise<void>;
    openLogs(): Promise<void>;
    openLoginGuide(): Promise<void>;
  };
  models: { refresh(): Promise<ModelInfo[]>; list(): Promise<ModelInfo[]> };
  hermes: { checkStatus(): Promise<HermesStatus>; login(): Promise<void> };
  story: {
    createEpisode(projectId: string): Promise<StoryEpisode>;
    listEpisodes(projectId: string): Promise<StoryEpisode[]>;
    updateEpisode(id: string, changes: Partial<StoryEpisode>): Promise<StoryEpisode>;
    deleteEpisode(id: string): Promise<void>;
    createShot(projectId: string, episodeId?: string): Promise<StoryShot>;
    listShots(projectId: string, episodeId?: string): Promise<StoryShot[]>;
    updateShot(id: string, changes: Partial<StoryShot>): Promise<StoryShot>;
    deleteShot(id: string): Promise<void>;
    generateShot(input: { shotId: string }): Promise<GenerationTask>;
    generateAllShots(input: { projectId: string; episodeId: string }): Promise<GenerationTask[]>;
    exportJson(projectId: string): Promise<string | undefined>;
  };
  canvas: {
    load(projectId: string): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>;
    saveNode(node: CanvasNode): Promise<void>;
    saveEdge(edge: CanvasEdge): Promise<void>;
  };
  mediaUrl(path: string): string;
  on(channel: string, callback: (payload: unknown) => void): () => void;
};
