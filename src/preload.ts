import { contextBridge, ipcRenderer } from 'electron';
import type { StudioApi } from '@shared/types';

const api: StudioApi = {
  projects: {
    create: (input) => ipcRenderer.invoke('projects:create', input), list: () => ipcRenderer.invoke('projects:list'),
    get: (id) => ipcRenderer.invoke('projects:get', id), delete: (id, deleteFiles) => ipcRenderer.invoke('projects:delete', id, deleteFiles)
  },
  assets: {
    import: (input) => ipcRenderer.invoke('assets:import', input), list: (projectId, type) => ipcRenderer.invoke('assets:list', projectId, type),
    copyToProject: (assetIds, projectId) => ipcRenderer.invoke('assets:copy-to-project', assetIds, projectId),
    delete: (id, deleteFile) => ipcRenderer.invoke('assets:delete', id, deleteFile), reveal: (id) => ipcRenderer.invoke('assets:reveal', id)
  },
  generation: {
    createTask: (input) => ipcRenderer.invoke('generation:create', input), retryTask: (id) => ipcRenderer.invoke('generation:retry', id),
    cancelTask: (id) => ipcRenderer.invoke('generation:cancel', id), listTasks: (projectId) => ipcRenderer.invoke('generation:list', projectId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'), set: (changes) => ipcRenderer.invoke('settings:set', changes),
    openStorage: () => ipcRenderer.invoke('settings:open-storage'), openLogs: () => ipcRenderer.invoke('settings:open-logs'),
    openLoginGuide: () => ipcRenderer.invoke('settings:login-guide')
  },
  models: { refresh: () => ipcRenderer.invoke('models:refresh'), list: () => ipcRenderer.invoke('models:list') },
  hermes: { checkStatus: () => ipcRenderer.invoke('hermes:check'), login: () => ipcRenderer.invoke('hermes:login') },
  story: {
    createEpisode: (projectId) => ipcRenderer.invoke('story:episode-create', projectId), listEpisodes: (projectId) => ipcRenderer.invoke('story:episode-list', projectId),
    updateEpisode: (id, changes) => ipcRenderer.invoke('story:episode-update', id, changes), deleteEpisode: (id) => ipcRenderer.invoke('story:episode-delete', id),
    createShot: (projectId, episodeId) => ipcRenderer.invoke('story:create', projectId, episodeId), listShots: (projectId, episodeId) => ipcRenderer.invoke('story:list', projectId, episodeId),
    updateShot: (id, changes) => ipcRenderer.invoke('story:update', id, changes), deleteShot: (id) => ipcRenderer.invoke('story:delete', id),
    generateShot: (input) => ipcRenderer.invoke('story:generate', input), generateAllShots: (input) => ipcRenderer.invoke('story:generate-all', input),
    exportJson: (projectId) => ipcRenderer.invoke('story:export', projectId)
  },
  canvas: {
    load: (projectId) => ipcRenderer.invoke('canvas:load', projectId), saveNode: (node) => ipcRenderer.invoke('canvas:save-node', node),
    saveEdge: (edge) => ipcRenderer.invoke('canvas:save-edge', edge)
  },
  mediaUrl: (path) => `studio-file://file/${encodeURIComponent(path)}`,
  on: (channel, callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('api', api);
