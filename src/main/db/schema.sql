PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('normal', 'story')),
  cover_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  description TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  final_prompt TEXT,
  status TEXT NOT NULL,
  input_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  output_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  hermes_task_id TEXT,
  request_id TEXT,
  source_video_id TEXT,
  output_asset_type TEXT,
  story_shot_id TEXT,
  error TEXT,
  params_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id TEXT,
  shot_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 8,
  video_model TEXT NOT NULL DEFAULT 'grok-imagine-video',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  resolution TEXT NOT NULL DEFAULT '720p',
  characters_json TEXT NOT NULL DEFAULT '[]',
  scene TEXT,
  props_json TEXT NOT NULL DEFAULT '[]',
  camera TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  dialogue_cn TEXT,
  dialogue_en TEXT,
  prompt TEXT NOT NULL DEFAULT '',
  reference_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  first_frame_asset_id TEXT,
  last_frame_asset_id TEXT,
  generated_video_asset_id TEXT,
  previous_shot_id TEXT,
  next_shot_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id TEXT,
  node_type TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_cache (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON generation_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_shots_project_index ON story_shots(project_id, shot_index);
CREATE INDEX IF NOT EXISTS idx_episodes_project_index ON story_episodes(project_id, episode_index);
PRAGMA user_version = 3;
