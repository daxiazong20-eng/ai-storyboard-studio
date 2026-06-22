import { create } from 'zustand';
import type { AppSettings, Asset, CreateTaskInput, GenerationTask, HermesStatus, ModelInfo, Project, StoryShot } from '@shared/types';

type SettingsWithPath = AppSettings & { storageDir: string };
type StudioState = {
  projects: Project[]; currentProject?: Project; assets: Asset[]; tasks: GenerationTask[]; shots: StoryShot[];
  models: ModelInfo[]; settings?: SettingsWithPath; hermesStatus: HermesStatus; selectedAssetIds: string[]; selectedTaskId?: string;
  loading: boolean; error?: string;
  initialize(): Promise<void>; refreshProjects(): Promise<void>; loadProject(id: string): Promise<void>; loadShots(projectId: string): Promise<void>;
  createProject(name: string, type: Project['type']): Promise<Project>; importAssets(projectId: string, type: Asset['type']): Promise<Asset[]>;
  deleteAsset(id: string): Promise<void>;
  createTask(input: CreateTaskInput): Promise<GenerationTask>; refreshTasks(projectId?: string): Promise<void>;
  toggleAsset(id: string): void; clearSelection(): void; setSelectedTask(id?: string): void; setError(error?: string): void;
};

const unchecked: HermesStatus = { state: 'unchecked', message: '未检测', checkedAt: '' };
let unsubscribers: Array<() => void> = [];

export const useStudioStore = create<StudioState>((set, get) => ({
  projects: [], assets: [], tasks: [], shots: [], models: [], hermesStatus: unchecked, selectedAssetIds: [], loading: false,
  initialize: async () => {
    set({ loading: true });
    try {
      const [projects, models, settings, tasks] = await Promise.all([window.api.projects.list(), window.api.models.list(), window.api.settings.get(), window.api.generation.listTasks()]);
      set({ projects, models, settings, tasks, loading: false });
      unsubscribers.forEach((fn) => fn());
      unsubscribers = [
        window.api.on('generation:task-updated', (payload) => set((state) => ({ tasks: upsert(state.tasks, payload as GenerationTask) }))),
        window.api.on('assets:created', (payload) => set((state) => state.currentProject?.id === (payload as Asset).projectId ? { assets: upsert(state.assets, payload as Asset) } : {})),
        window.api.on('hermes:status-changed', (payload) => set({ hermesStatus: payload as HermesStatus })),
        window.api.on('models:updated', (payload) => set({ models: payload as ModelInfo[] }))
      ];
      void window.api.hermes.checkStatus().then(async (hermesStatus) => {
        set({ hermesStatus });
        if (hermesStatus.state !== 'grok-ready') return;
        const refreshedModels = await window.api.models.refresh();
        set({ models: refreshedModels });
      }).catch((error) => set({ error: message(error) }));
    } catch (error) { set({ loading: false, error: message(error) }); }
  },
  refreshProjects: async () => set({ projects: await window.api.projects.list() }),
  loadProject: async (id) => {
    set({ loading: true, selectedAssetIds: [] });
    try {
      const [currentProject, assets, tasks] = await Promise.all([window.api.projects.get(id), window.api.assets.list(id), window.api.generation.listTasks(id)]);
      set({ currentProject, assets, tasks, loading: false });
    } catch (error) { set({ loading: false, error: message(error) }); }
  },
  loadShots: async (projectId) => set({ shots: await window.api.story.listShots(projectId) }),
  createProject: async (name, type) => { const project = await window.api.projects.create({ name, type }); set((state) => ({ projects: [project, ...state.projects] })); return project; },
  importAssets: async (projectId, type) => {
    try {
      const added = await window.api.assets.import({ projectId, type });
      set((state) => ({ assets: [...added, ...state.assets] }));
      return added;
    } catch (error) {
      set({ error: message(error) });
      return [];
    }
  },
  deleteAsset: async (id) => {
    try {
      await window.api.assets.delete(id, true);
      set((state) => ({
        assets: state.assets.filter((asset) => asset.id !== id),
        selectedAssetIds: state.selectedAssetIds.filter((assetId) => assetId !== id)
      }));
    } catch (error) { set({ error: message(error) }); throw error; }
  },
  createTask: async (input) => {
    try { const task = await window.api.generation.createTask(input); set((state) => ({ tasks: upsert(state.tasks, task), error: undefined })); return task; }
    catch (error) { const text = message(error); set({ error: text }); throw error; }
  },
  refreshTasks: async (projectId) => set({ tasks: await window.api.generation.listTasks(projectId) }),
  toggleAsset: (id) => set((state) => ({ selectedAssetIds: state.selectedAssetIds.includes(id) ? state.selectedAssetIds.filter((item) => item !== id) : [...state.selectedAssetIds, id] })),
  clearSelection: () => set({ selectedAssetIds: [] }), setSelectedTask: (id) => set({ selectedTaskId: id }), setError: (error) => set({ error })
}));

const upsert = <T extends { id: string }>(items: T[], item: T): T[] => [item, ...items.filter((current) => current.id !== item.id)];
const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error);
