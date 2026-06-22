import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  AppSettings,
  Asset,
  AssetType,
  CanvasEdge,
  CanvasNode,
  CreateTaskInput,
  GenerationTask,
  ModelInfo,
  Project,
  StoryEpisode,
  StoryShot,
  TaskStatus
} from '@shared/types';

type Row = Record<string, unknown>;

const DEFAULT_SETTINGS: AppSettings = {
  hermesMode: 'cli',
  hermesBaseUrl: 'http://127.0.0.1:8787',
  hermesCliPath: 'hermes',
  normalConcurrency: 2,
  storyConcurrency: 1
};

const parse = <T>(value: unknown, fallback: T): T => {
  try {
    return value ? (JSON.parse(String(value)) as T) : fallback;
  } catch {
    return fallback;
  }
};

const now = () => new Date().toISOString();

export class AppDatabase {
  private db!: DatabaseSync;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  init(): void {
    mkdirSync(this.rootDir, { recursive: true });
    this.db = new DatabaseSync(join(this.rootDir, 'database.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    this.migrate();
    if (!this.getSetting<AppSettings>('app')) this.setSetting('app', DEFAULT_SETTINGS);
  }

  private migrate(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    let schema = '';
    try {
      schema = readFileSync(schemaPath, 'utf8');
    } catch {
      schema = FALLBACK_SCHEMA;
    }
    this.db.exec(schema);
    const taskColumns = this.db.prepare('PRAGMA table_info(generation_tasks)').all() as Row[];
    if (!taskColumns.some((column) => String(column.name) === 'output_asset_type')) {
      this.db.exec('ALTER TABLE generation_tasks ADD COLUMN output_asset_type TEXT');
    }
    const shotColumns = this.db.prepare('PRAGMA table_info(story_shots)').all() as Row[];
    const addShotColumn = (name: string, definition: string) => {
      if (!shotColumns.some((column) => String(column.name) === name)) this.db.exec(`ALTER TABLE story_shots ADD COLUMN ${name} ${definition}`);
    };
    addShotColumn('episode_id', 'TEXT');
    addShotColumn('video_model', "TEXT NOT NULL DEFAULT 'grok-imagine-video'");
    addShotColumn('aspect_ratio', "TEXT NOT NULL DEFAULT '9:16'");
    addShotColumn('resolution', "TEXT NOT NULL DEFAULT '720p'");
    const legacyModel = this.db.prepare("SELECT * FROM model_cache WHERE id IN ('grok-imagine-video-1.5','grok-imagine-video-1.5-2026-05-30') LIMIT 1").get() as Row | undefined;
    if (legacyModel) {
      this.db.prepare('INSERT OR REPLACE INTO model_cache(id,name,type,provider,updated_at) VALUES(?,?,?,?,?)')
        .run('grok-imagine-video-1.5-preview', 'Grok Imagine Video 1.5 Preview', 'video', String(legacyModel.provider || 'hermes-grok'), now());
      this.db.exec("DELETE FROM model_cache WHERE id IN ('grok-imagine-video-1.5','grok-imagine-video-1.5-2026-05-30')");
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_episodes_project_index ON story_episodes(project_id,episode_index)');
    const projects = this.db.prepare("SELECT id FROM projects WHERE type='story'").all() as Row[];
    projects.forEach((project) => {
      const projectId = String(project.id);
      let episode = this.db.prepare('SELECT id FROM story_episodes WHERE project_id=? ORDER BY episode_index LIMIT 1').get(projectId) as Row | undefined;
      if (!episode) {
        const stamp = now();
        const id = randomUUID();
        this.db.prepare('INSERT INTO story_episodes(id,project_id,episode_index,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, projectId, 1, '第 1 集', stamp, stamp);
        episode = { id };
      }
      this.db.prepare('UPDATE story_shots SET episode_id=? WHERE project_id=? AND (episode_id IS NULL OR episode_id=\'\')').run(String(episode.id), projectId);
    });
  }

  createProject(input: Pick<Project, 'name' | 'type'>): Project {
    const stamp = now();
    const project: Project = { id: randomUUID(), name: input.name.trim() || '未命名项目', type: input.type, createdAt: stamp, updatedAt: stamp };
    this.db.prepare('INSERT INTO projects(id,name,type,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run(project.id, project.name, project.type, stamp, stamp);
    return project;
  }

  listProjects(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(rowToProject);
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as Row | undefined;
    return row ? rowToProject(row) : undefined;
  }

  touchProject(id: string, coverPath?: string): void {
    if (coverPath) this.db.prepare('UPDATE projects SET updated_at=?, cover_path=? WHERE id=?').run(now(), coverPath, id);
    else this.db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), id);
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id=?').run(id);
  }

  createAsset(input: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Asset {
    const stamp = now();
    const asset: Asset = { ...input, id: input.id || randomUUID(), createdAt: stamp, updatedAt: stamp };
    this.db.prepare(`INSERT INTO assets(id,project_id,type,name,file_path,thumbnail_path,description,tags_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(asset.id, asset.projectId, asset.type, asset.name, asset.filePath, asset.thumbnailPath || null,
      asset.description || null, JSON.stringify(asset.tags || []), stamp, stamp);
    this.touchProject(asset.projectId, asset.type === 'video' ? undefined : asset.filePath);
    return asset;
  }

  listAssets(projectId: string, type?: AssetType): Asset[] {
    const rows = type
      ? this.db.prepare('SELECT * FROM assets WHERE project_id=? AND type=? ORDER BY created_at DESC').all(projectId, type)
      : this.db.prepare('SELECT * FROM assets WHERE project_id=? ORDER BY created_at DESC').all(projectId);
    return rows.map(rowToAsset);
  }

  getAsset(id: string): Asset | undefined {
    const row = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as Row | undefined;
    return row ? rowToAsset(row) : undefined;
  }

  getAssets(ids: string[]): Asset[] {
    return ids.map((id) => this.getAsset(id)).filter(Boolean) as Asset[];
  }

  deleteAsset(id: string): void {
    const nodeId = `asset-${id}`;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM canvas_edges WHERE source=? OR target=?').run(nodeId, nodeId);
      this.db.prepare('DELETE FROM canvas_nodes WHERE asset_id=? OR id=?').run(id, nodeId);
      this.db.prepare('DELETE FROM assets WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  createTask(input: CreateTaskInput, finalPrompt: string, provider: GenerationTask['provider']): GenerationTask {
    const stamp = now();
    const task: GenerationTask = {
      id: randomUUID(), projectId: input.projectId, mode: input.mode, provider, model: input.model,
      prompt: input.prompt, finalPrompt, status: 'pending', inputAssetIds: input.inputAssetIds,
      outputAssetIds: [], sourceVideoId: input.sourceVideoId, outputAssetType: input.outputAssetType,
      params: input.params, createdAt: stamp, updatedAt: stamp
    };
    this.db.prepare(`INSERT INTO generation_tasks(id,project_id,mode,provider,model,prompt,final_prompt,status,
      input_asset_ids_json,output_asset_ids_json,source_video_id,output_asset_type,story_shot_id,params_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(task.id, task.projectId, task.mode, task.provider, task.model, task.prompt,
      task.finalPrompt || null, task.status, JSON.stringify(task.inputAssetIds), '[]', task.sourceVideoId || null,
      task.outputAssetType || null, input.storyShotId || null, JSON.stringify(task.params), stamp, stamp);
    return task;
  }

  updateTask(id: string, changes: Partial<Pick<GenerationTask, 'status' | 'outputAssetIds' | 'hermesTaskId' | 'requestId' | 'error'>>): GenerationTask {
    const current = this.getTask(id);
    if (!current) throw new Error('任务不存在');
    const next = { ...current, ...changes, updatedAt: now() };
    this.db.prepare(`UPDATE generation_tasks SET status=?,output_asset_ids_json=?,hermes_task_id=?,request_id=?,error=?,updated_at=? WHERE id=?`)
      .run(next.status, JSON.stringify(next.outputAssetIds), next.hermesTaskId || null, next.requestId || null, next.error || null, next.updatedAt, id);
    return next;
  }

  getTask(id: string): GenerationTask | undefined {
    const row = this.db.prepare('SELECT * FROM generation_tasks WHERE id=?').get(id) as Row | undefined;
    return row ? rowToTask(row) : undefined;
  }

  listTasks(projectId?: string): GenerationTask[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM generation_tasks WHERE project_id=? ORDER BY created_at DESC').all(projectId)
      : this.db.prepare('SELECT * FROM generation_tasks ORDER BY created_at DESC LIMIT 200').all();
    return rows.map(rowToTask);
  }

  resetInterruptedTasks(): void {
    this.db.prepare(`UPDATE generation_tasks SET status='failed',error='应用退出导致任务中断',updated_at=? WHERE status IN ('running','polling')`).run(now());
  }

  createEpisode(projectId: string): StoryEpisode {
    const max = this.db.prepare('SELECT COALESCE(MAX(episode_index),0) AS value FROM story_episodes WHERE project_id=?').get(projectId) as Row;
    const stamp = now();
    const episode: StoryEpisode = { id: randomUUID(), projectId, index: Number(max.value) + 1, title: `第 ${Number(max.value) + 1} 集`, createdAt: stamp, updatedAt: stamp };
    this.db.prepare('INSERT INTO story_episodes(id,project_id,episode_index,title,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(episode.id, episode.projectId, episode.index, episode.title, stamp, stamp);
    return episode;
  }

  listEpisodes(projectId: string): StoryEpisode[] {
    let episodes = this.db.prepare('SELECT * FROM story_episodes WHERE project_id=? ORDER BY episode_index').all(projectId).map(rowToEpisode);
    if (!episodes.length) episodes = [this.createEpisode(projectId)];
    return episodes;
  }

  updateEpisode(id: string, changes: Partial<StoryEpisode>): StoryEpisode {
    const row = this.db.prepare('SELECT * FROM story_episodes WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('剧集不存在');
    const current = rowToEpisode(row);
    const next = { ...current, ...changes, id: current.id, projectId: current.projectId, updatedAt: now() };
    this.db.prepare('UPDATE story_episodes SET episode_index=?,title=?,updated_at=? WHERE id=?').run(next.index, next.title, next.updatedAt, id);
    return next;
  }

  deleteEpisode(id: string): void {
    const row = this.db.prepare('SELECT * FROM story_episodes WHERE id=?').get(id) as Row | undefined;
    if (!row) return;
    const episode = rowToEpisode(row);
    const count = this.db.prepare('SELECT COUNT(*) AS value FROM story_episodes WHERE project_id=?').get(episode.projectId) as Row;
    if (Number(count.value) <= 1) throw new Error('短剧项目至少保留一集。');
    this.db.prepare('DELETE FROM story_shots WHERE episode_id=?').run(id);
    this.db.prepare('DELETE FROM story_episodes WHERE id=?').run(id);
    this.listEpisodes(episode.projectId).forEach((item, index) => this.updateEpisode(item.id, { index: index + 1, title: `第 ${index + 1} 集` }));
  }

  createShot(projectId: string, episodeId?: string): StoryShot {
    const resolvedEpisodeId = episodeId || this.listEpisodes(projectId)[0].id;
    const max = this.db.prepare('SELECT COALESCE(MAX(shot_index),0) AS value FROM story_shots WHERE project_id=? AND episode_id=?').get(projectId, resolvedEpisodeId) as Row;
    const stamp = now();
    const shot: StoryShot = {
      id: randomUUID(), projectId, episodeId: resolvedEpisodeId, index: Number(max.value) + 1, title: `镜 ${Number(max.value) + 1}`, duration: 8,
      model: 'grok-imagine-video', aspectRatio: '9:16', resolution: '720p',
      characters: [], props: [], camera: '中景，镜头缓慢推进', action: '', prompt: '', referenceAssetIds: [], createdAt: stamp, updatedAt: stamp
    };
    this.insertShot(shot);
    return shot;
  }

  private insertShot(shot: StoryShot): void {
    this.db.prepare(`INSERT INTO story_shots(id,project_id,episode_id,shot_index,title,duration,video_model,aspect_ratio,resolution,characters_json,scene,props_json,camera,action,
      dialogue_cn,dialogue_en,prompt,reference_asset_ids_json,first_frame_asset_id,last_frame_asset_id,generated_video_asset_id,
      previous_shot_id,next_shot_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(shot.id, shot.projectId, shot.episodeId, shot.index, shot.title, shot.duration, shot.model, shot.aspectRatio, shot.resolution, JSON.stringify(shot.characters), shot.scene || null,
      JSON.stringify(shot.props), shot.camera, shot.action, shot.dialogueCN || null, shot.dialogueEN || null, shot.prompt,
      JSON.stringify(shot.referenceAssetIds), shot.firstFrameAssetId || null, shot.lastFrameAssetId || null,
      shot.generatedVideoAssetId || null, shot.previousShotId || null, shot.nextShotId || null, shot.createdAt, shot.updatedAt);
  }

  listShots(projectId: string, episodeId?: string): StoryShot[] {
    const rows = episodeId
      ? this.db.prepare('SELECT * FROM story_shots WHERE project_id=? AND episode_id=? ORDER BY shot_index').all(projectId, episodeId)
      : this.db.prepare('SELECT * FROM story_shots WHERE project_id=? ORDER BY episode_id,shot_index').all(projectId);
    return rows.map(rowToShot);
  }

  getShot(id: string): StoryShot | undefined {
    const row = this.db.prepare('SELECT * FROM story_shots WHERE id=?').get(id) as Row | undefined;
    return row ? rowToShot(row) : undefined;
  }

  updateShot(id: string, changes: Partial<StoryShot>): StoryShot {
    const current = this.getShot(id);
    if (!current) throw new Error('分镜不存在');
    const next = { ...current, ...changes, id: current.id, projectId: current.projectId, updatedAt: now() };
    this.db.prepare(`UPDATE story_shots SET episode_id=?,shot_index=?,title=?,duration=?,video_model=?,aspect_ratio=?,resolution=?,characters_json=?,scene=?,props_json=?,camera=?,action=?,
      dialogue_cn=?,dialogue_en=?,prompt=?,reference_asset_ids_json=?,first_frame_asset_id=?,last_frame_asset_id=?,generated_video_asset_id=?,
      previous_shot_id=?,next_shot_id=?,updated_at=? WHERE id=?`).run(next.episodeId, next.index, next.title, next.duration, next.model, next.aspectRatio, next.resolution, JSON.stringify(next.characters),
      next.scene || null, JSON.stringify(next.props), next.camera, next.action, next.dialogueCN || null, next.dialogueEN || null,
      next.prompt, JSON.stringify(next.referenceAssetIds), next.firstFrameAssetId || null, next.lastFrameAssetId || null,
      next.generatedVideoAssetId || null, next.previousShotId || null, next.nextShotId || null, next.updatedAt, id);
    return next;
  }

  deleteShot(id: string): void {
    const shot = this.getShot(id);
    if (!shot) return;
    this.db.prepare('DELETE FROM story_shots WHERE id=?').run(id);
    const rest = this.listShots(shot.projectId, shot.episodeId);
    rest.forEach((item, index) => this.updateShot(item.id, { index: index + 1 }));
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key=?').get(key) as Row | undefined;
    return row ? parse<T>(row.value_json, undefined as T) : undefined;
  }

  setSetting<T>(key: string, value: T): void {
    this.db.prepare(`INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
      .run(key, JSON.stringify(value), now());
  }

  getAppSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...(this.getSetting<AppSettings>('app') || {}) };
  }

  setAppSettings(changes: Partial<AppSettings>): AppSettings {
    const settings = { ...this.getAppSettings(), ...changes, storyConcurrency: 1 };
    this.setSetting('app', settings);
    return settings;
  }

  replaceModels(models: ModelInfo[]): void {
    this.db.exec('DELETE FROM model_cache');
    const statement = this.db.prepare('INSERT INTO model_cache(id,name,type,provider,updated_at) VALUES(?,?,?,?,?)');
    models.forEach((model) => statement.run(model.id, model.name, model.type, model.provider, now()));
  }

  listModels(): ModelInfo[] {
    return this.db.prepare('SELECT id,name,type,provider FROM model_cache ORDER BY type,name').all() as unknown as ModelInfo[];
  }

  saveCanvasNode(node: CanvasNode): void {
    this.db.prepare(`INSERT INTO canvas_nodes(id,project_id,asset_id,node_type,x,y,data_json) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,data_json=excluded.data_json`)
      .run(node.id, node.projectId, node.assetId || null, node.nodeType, node.x, node.y, JSON.stringify(node.data));
  }

  saveCanvasEdge(edge: CanvasEdge): void {
    this.db.prepare(`INSERT OR REPLACE INTO canvas_edges(id,project_id,source,target,edge_type) VALUES(?,?,?,?,?)`)
      .run(edge.id, edge.projectId, edge.source, edge.target, edge.edgeType);
  }

  loadCanvas(projectId: string): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
    const nodes = this.db.prepare('SELECT * FROM canvas_nodes WHERE project_id=?').all(projectId).map((row: Row) => ({
      id: String(row.id), projectId: String(row.project_id), assetId: row.asset_id ? String(row.asset_id) : undefined,
      nodeType: String(row.node_type) as CanvasNode['nodeType'], x: Number(row.x), y: Number(row.y), data: parse(row.data_json, {})
    }));
    const edges = this.db.prepare('SELECT * FROM canvas_edges WHERE project_id=?').all(projectId).map((row: Row) => ({
      id: String(row.id), projectId: String(row.project_id), source: String(row.source), target: String(row.target),
      edgeType: String(row.edge_type) as CanvasEdge['edgeType']
    }));
    return { nodes, edges };
  }

  getStoryShotIdForTask(taskId: string): string | undefined {
    const row = this.db.prepare('SELECT story_shot_id FROM generation_tasks WHERE id=?').get(taskId) as Row | undefined;
    return row?.story_shot_id ? String(row.story_shot_id) : undefined;
  }
}

const rowToProject = (row: Row): Project => ({
  id: String(row.id), name: String(row.name), type: String(row.type) as Project['type'],
  coverPath: row.cover_path ? String(row.cover_path) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const rowToAsset = (row: Row): Asset => ({
  id: String(row.id), projectId: String(row.project_id), type: String(row.type) as AssetType, name: String(row.name),
  filePath: String(row.file_path), thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : undefined,
  description: row.description ? String(row.description) : undefined, tags: parse(row.tags_json, []),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const rowToEpisode = (row: Row): StoryEpisode => ({
  id: String(row.id), projectId: String(row.project_id), index: Number(row.episode_index), title: String(row.title),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const rowToTask = (row: Row): GenerationTask => ({
  id: String(row.id), projectId: String(row.project_id), mode: String(row.mode) as GenerationTask['mode'],
  provider: String(row.provider) as GenerationTask['provider'], model: String(row.model), prompt: String(row.prompt),
  finalPrompt: row.final_prompt ? String(row.final_prompt) : undefined, status: String(row.status) as TaskStatus,
  inputAssetIds: parse(row.input_asset_ids_json, []), outputAssetIds: parse(row.output_asset_ids_json, []),
  hermesTaskId: row.hermes_task_id ? String(row.hermes_task_id) : undefined,
  requestId: row.request_id ? String(row.request_id) : undefined, sourceVideoId: row.source_video_id ? String(row.source_video_id) : undefined,
  outputAssetType: row.output_asset_type ? String(row.output_asset_type) as AssetType : undefined,
  error: row.error ? String(row.error) : undefined, params: parse(row.params_json, { aspectRatio: '16:9', resolution: '720p' }),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const rowToShot = (row: Row): StoryShot => ({
  id: String(row.id), projectId: String(row.project_id), episodeId: String(row.episode_id || ''), index: Number(row.shot_index), title: String(row.title), duration: Number(row.duration),
  model: String(row.video_model || 'grok-imagine-video'), aspectRatio: String(row.aspect_ratio || '9:16') as StoryShot['aspectRatio'],
  resolution: (row.resolution === '480p' ? '480p' : '720p'),
  characters: parse(row.characters_json, []), scene: row.scene ? String(row.scene) : undefined, props: parse(row.props_json, []),
  camera: String(row.camera || ''), action: String(row.action || ''), dialogueCN: row.dialogue_cn ? String(row.dialogue_cn) : undefined,
  dialogueEN: row.dialogue_en ? String(row.dialogue_en) : undefined, prompt: String(row.prompt || ''),
  referenceAssetIds: parse(row.reference_asset_ids_json, []), firstFrameAssetId: row.first_frame_asset_id ? String(row.first_frame_asset_id) : undefined,
  lastFrameAssetId: row.last_frame_asset_id ? String(row.last_frame_asset_id) : undefined,
  generatedVideoAssetId: row.generated_video_asset_id ? String(row.generated_video_asset_id) : undefined,
  previousShotId: row.previous_shot_id ? String(row.previous_shot_id) : undefined,
  nextShotId: row.next_shot_id ? String(row.next_shot_id) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const FALLBACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,cover_path TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,type TEXT NOT NULL,name TEXT NOT NULL,file_path TEXT NOT NULL,thumbnail_path TEXT,description TEXT,tags_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS generation_tasks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,mode TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,prompt TEXT NOT NULL,final_prompt TEXT,status TEXT NOT NULL,input_asset_ids_json TEXT NOT NULL DEFAULT '[]',output_asset_ids_json TEXT NOT NULL DEFAULT '[]',hermes_task_id TEXT,request_id TEXT,source_video_id TEXT,output_asset_type TEXT,story_shot_id TEXT,error TEXT,params_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS story_episodes(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,episode_index INTEGER NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS story_shots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,episode_id TEXT,shot_index INTEGER NOT NULL,title TEXT NOT NULL,duration INTEGER NOT NULL DEFAULT 8,video_model TEXT NOT NULL DEFAULT 'grok-imagine-video',aspect_ratio TEXT NOT NULL DEFAULT '9:16',resolution TEXT NOT NULL DEFAULT '720p',characters_json TEXT NOT NULL DEFAULT '[]',scene TEXT,props_json TEXT NOT NULL DEFAULT '[]',camera TEXT NOT NULL DEFAULT '',action TEXT NOT NULL DEFAULT '',dialogue_cn TEXT,dialogue_en TEXT,prompt TEXT NOT NULL DEFAULT '',reference_asset_ids_json TEXT NOT NULL DEFAULT '[]',first_frame_asset_id TEXT,last_frame_asset_id TEXT,generated_video_asset_id TEXT,previous_shot_id TEXT,next_shot_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS canvas_nodes(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,asset_id TEXT,node_type TEXT NOT NULL,x REAL NOT NULL DEFAULT 0,y REAL NOT NULL DEFAULT 0,data_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS canvas_edges(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,source TEXT NOT NULL,target TEXT NOT NULL,edge_type TEXT NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_cache(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,provider TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id); CREATE INDEX IF NOT EXISTS idx_tasks_project ON generation_tasks(project_id); CREATE INDEX IF NOT EXISTS idx_shots_project_index ON story_shots(project_id,shot_index); CREATE INDEX IF NOT EXISTS idx_episodes_project_index ON story_episodes(project_id,episode_index); PRAGMA user_version=3;`;
