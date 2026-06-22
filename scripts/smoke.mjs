import { writeFileSync } from 'node:fs';

const port = Number(process.argv[2] || 9333);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch { /* Electron is still starting. */ }
    await wait(500);
  }
  throw new Error('Electron CDP endpoint did not become ready');
}

const socket = new WebSocket(await connect());
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await command('Runtime.enable');
await command('Page.enable');
const fullExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!window.api) throw new Error('Preload API unavailable. Page: ' + document.body.innerText.slice(0, 300));
  const api = window.api;
  const waitTask = async (id) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const task = (await api.generation.listTasks()).find((item) => item.id === id);
      if (task && ['success', 'failed', 'cancelled'].includes(task.status)) return task;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Renderer task wait timed out');
  };
  await api.settings.set({ hermesMode: 'mock' });
  const normal = await api.projects.create({ name: '[SMOKE] 普通项目', type: 'normal' });
  const imagePrompt = '稳定的测试人物资产';
  const imageTask = await api.generation.createTask({
    projectId: normal.id, mode: 'text-to-image', model: 'grok-imagine-image-quality', prompt: imagePrompt,
    inputAssetIds: [], outputAssetType: 'character', params: { aspectRatio: '3:4', resolution: '720p', duration: 9, n: 2 }
  });
  const completedImage = await waitTask(imageTask.id);
  const characterAssets = await api.assets.list(normal.id, 'character');
  if (completedImage.status !== 'success' || completedImage.outputAssetIds.length !== 2 || characterAssets.length !== 2 ||
      completedImage.params.resolution !== '1K' || completedImage.params.duration !== undefined || completedImage.finalPrompt !== imagePrompt) {
    throw new Error('Image parameter isolation or prompt passthrough failed');
  }
  let validation = '';
  try {
    await api.generation.createTask({ projectId: normal.id, mode: 'image-edit', model: 'grok-imagine-image-quality', prompt: '编辑', inputAssetIds: [], params: { aspectRatio: '1:1', resolution: '1K', n: 1 } });
  } catch (error) { validation = String(error); }
  if (!validation.includes('1 至 3')) throw new Error('Image edit validation did not run');

  const story = await api.projects.create({ name: '[SMOKE] 短剧项目', type: 'story' });
  const copiedReferences = await api.assets.copyToProject([characterAssets[0].id], story.id);
  const referenceId = copiedReferences[0]?.id;
  if (!referenceId || copiedReferences[0].projectId !== story.id || copiedReferences[0].filePath === characterAssets[0].filePath) throw new Error('Cross-project asset copy failed');
  const episodes = await api.story.listEpisodes(story.id);
  const secondEpisode = await api.story.createEpisode(story.id);
  if (episodes.length !== 1 || secondEpisode.index !== 2) throw new Error('Episode creation failed');
  const first = await api.story.createShot(story.id, episodes[0].id);
  const second = await api.story.createShot(story.id, episodes[0].id);
  await api.story.updateShot(first.id, { title: '开场', prompt: '人物看向镜头', duration: 3, model: 'grok-imagine-video', aspectRatio: '9:16', resolution: '720p', referenceAssetIds: [referenceId] });
  await api.story.updateShot(second.id, { title: '接续', prompt: '人物转身走向门口', duration: 3, model: 'grok-imagine-video-1.5-preview', aspectRatio: '9:16', resolution: '480p', referenceAssetIds: [referenceId] });
  await api.story.generateAllShots({ projectId: story.id, episodeId: episodes[0].id });
  const shots = await api.story.listShots(story.id, episodes[0].id);
  if (!shots.every((shot) => shot.generatedVideoAssetId)) throw new Error('Sequential story generation failed');
  const storyTasks = (await api.generation.listTasks(story.id)).filter((task) => task.mode === 'reference-to-video');
  if (storyTasks.length !== 2 || storyTasks.some((task) => task.inputAssetIds[0] !== referenceId || task.params.n !== undefined || task.params.duration !== 3) ||
      !storyTasks.some((task) => task.params.resolution === '480p' && task.model === 'grok-imagine-video')) {
    throw new Error('Story reference order or video parameter isolation failed');
  }
  const videos = await api.assets.list(story.id, 'video');
  if (videos.length !== 2 || videos.some((video) => !video.filePath.toLowerCase().endsWith('.mp4'))) throw new Error('Mock videos are not playable MP4 assets');
  const extension = await api.generation.createTask({
    projectId: story.id, mode: 'video-extension', model: 'grok-imagine-video', prompt: '继续自然运动', inputAssetIds: [],
    sourceVideoId: shots[1].generatedVideoAssetId, params: { aspectRatio: '9:16', resolution: '720p', duration: 3, n: 1 }
  });
  const completedExtension = await waitTask(extension.id);
  const canvas = await api.canvas.load(story.id);
  if (completedExtension.status !== 'success' || canvas.edges.filter((edge) => edge.edgeType === 'video-extension').length < 1) {
    throw new Error('Video extension relationship failed');
  }
  const durationTask = await api.generation.createTask({
    projectId: story.id, mode: 'image-to-video', model: 'grok-imagine-video-1.5-preview', prompt: '时长链路测试', inputAssetIds: [referenceId],
    params: { aspectRatio: '9:16', resolution: '720p', duration: 15 }
  });
  const completedDuration = await waitTask(durationTask.id);
  if (completedDuration.params.duration !== 15 || completedDuration.model !== 'grok-imagine-video-1.5-preview') throw new Error('Video duration or 1.5 modality routing failed');
  const deletedAssetId = completedExtension.outputAssetIds[0];
  await api.canvas.saveNode({ id: 'asset-' + deletedAssetId, projectId: story.id, assetId: deletedAssetId, nodeType: 'asset', x: 10, y: 10, data: {} });
  await api.assets.delete(deletedAssetId, true);
  const canvasAfterDelete = await api.canvas.load(story.id);
  if ((await api.assets.list(story.id)).some((asset) => asset.id === deletedAssetId) || canvasAfterDelete.nodes.some((node) => node.assetId === deletedAssetId) ||
      canvasAfterDelete.edges.some((edge) => edge.source === 'asset-' + deletedAssetId || edge.target === 'asset-' + deletedAssetId)) {
    throw new Error('Canvas asset deletion did not clean nodes and edges');
  }

  await api.projects.delete(normal.id, true);
  await api.projects.delete(story.id, true);
  await api.settings.set({ hermesMode: 'cli' });
  const status = await api.hermes.checkStatus();
  const models = await api.models.refresh();
  if (!models.some((model) => model.id === 'grok-imagine-video-1.5-preview') || models.some((model) => model.id === 'grok-imagine-video-1.5')) {
    throw new Error('Official video model aliases were not normalized');
  }
  return { imageOutputs: completedImage.outputAssetIds.length, imageParams: completedImage.params, episodes: 2, storyShots: shots.length,
    storyVideos: videos.length, referenceTasks: storyTasks.length, requestedDuration: completedDuration.params.duration, normalizedVideoModel: completedDuration.model,
    extensionEdges: canvas.edges.length, deletedCanvasEdges: canvasAfterDelete.edges.length, validation, hermesState: status.state, hermesMessage: status.message, modelCount: models.length };
})()`;
const checkExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  const projects = await window.api.projects.list();
  const tasks = await window.api.generation.listTasks();
  const settings = await window.api.settings.get();
  const status = await window.api.hermes.checkStatus();
  return { projects: projects.length, tasks: tasks.length, hermesMode: settings.hermesMode, hermesCliPath: settings.hermesCliPath, hermesState: status.state, hermesMessage: status.message, hermesVersion: status.version };
})()`;
const loginExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  await window.api.hermes.login();
  return { loginWindowStarted: true };
})()`;
const uiExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  await window.api.settings.set({ hermesMode: 'mock' });
  let project = (await window.api.projects.list()).find((item) => item.name === '[UI] 分集短剧');
  if (!project) project = await window.api.projects.create({ name: '[UI] 分集短剧', type: 'story' });
  const episodes = await window.api.story.listEpisodes(project.id);
  if (episodes.length < 2) await window.api.story.createEpisode(project.id);
  let shots = await window.api.story.listShots(project.id, episodes[0].id);
  if (!shots.length) {
    const shot = await window.api.story.createShot(project.id, episodes[0].id);
    await window.api.story.updateShot(shot.id, { title: '宴会厅重逢', prompt: '女主停下脚步看向男主，镜头缓慢推进。', duration: 6, model: 'grok-imagine-video', aspectRatio: '9:16', resolution: '720p' });
  }
  location.hash = '#/story/' + project.id;
  await new Promise((resolve) => setTimeout(resolve, 1400));
  document.querySelector('.asset-cabinet-rail button')?.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { projectId: project.id, episodes: (await window.api.story.listEpisodes(project.id)).length };
})()`;
const canvasUiExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  const api = window.api;
  await api.settings.set({ hermesMode: 'mock' });
  let project = (await api.projects.list()).find((item) => item.name === '[UI] 画布操作');
  if (!project) project = await api.projects.create({ name: '[UI] 画布操作', type: 'normal' });
  let assets = await api.assets.list(project.id);
  if (!assets.some((asset) => asset.type !== 'video')) {
    await api.generation.createTask({ projectId: project.id, mode: 'text-to-image', model: 'grok-imagine-image-quality', prompt: '画布操作测试图片', inputAssetIds: [], params: { aspectRatio: '16:9', resolution: '1K', n: 2 } });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      assets = await api.assets.list(project.id);
      if (assets.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  location.hash = '#/project/' + project.id;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const pickerToggle = document.querySelector('.asset-picker-wrap > button');
  pickerToggle?.click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const uploadInsidePicker = [...document.querySelectorAll('.asset-picker-head button')].some((button) => button.textContent?.includes('上传图片'));
  document.querySelector('.asset-picker-item')?.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const selectedPickerItems = document.querySelectorAll('.asset-picker-item.selected').length;
  pickerToggle?.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { projectId: project.id, assets: (await api.assets.list(project.id)).length, actionButtons: document.querySelectorAll('.media-node-actions button').length,
    uploadInsidePicker, selectedPickerItems, selectedCanvasCards: document.querySelectorAll('.media-node.selected').length };
})()`;
const migrationExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  const projects = await window.api.projects.list();
  const stories = projects.filter((project) => project.type === 'story');
  const migrated = [];
  for (const project of stories) {
    const episodes = await window.api.story.listEpisodes(project.id);
    const shots = await window.api.story.listShots(project.id);
    migrated.push({ project: project.name, episodes: episodes.length, shots: shots.length, assigned: shots.every((shot) => Boolean(shot.episodeId && shot.model && shot.resolution)) });
  }
  return { stories: stories.length, migrated };
})()`;
const cleanupExpression = String.raw`(async () => {
  for (let attempt = 0; attempt < 100 && !window.api; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  const projects = await window.api.projects.list();
  const tests = projects.filter((project) => /^\[(SMOKE|UI)\]/.test(project.name));
  for (const project of tests) await window.api.projects.delete(project.id, true);
  return { removed: tests.map((project) => project.name), remaining: (await window.api.projects.list()).length };
})()`;
const mode = process.argv[4];
const expression = mode === 'check' ? checkExpression : mode === 'login' ? loginExpression : mode === 'ui' ? uiExpression : mode === 'canvas' ? canvasUiExpression : mode === 'migration' ? migrationExpression : mode === 'cleanup' ? cleanupExpression : fullExpression;
const evaluated = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(process.argv[3] || 'smoke-home.png', Buffer.from(screenshot.data, 'base64'));
process.stdout.write(`${JSON.stringify(evaluated.result.value, null, 2)}\n`);
socket.close();
