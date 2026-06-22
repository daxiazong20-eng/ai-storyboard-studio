import { app, shell } from 'electron';
import { basename, extname, join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { AssetType } from '@shared/types';

const folderByType: Record<AssetType, string> = {
  character: 'characters', scene: 'scenes', prop: 'props', storyboard: 'storyboards',
  firstFrame: 'first-frames', lastFrame: 'last-frames', video: 'videos', reference: 'references'
};

export class FileManager {
  readonly rootDir: string;
  readonly projectsDir: string;
  readonly logsDir: string;

  constructor() {
    this.rootDir = join(app.getPath('userData'), 'AIStoryboardStudio');
    this.projectsDir = join(this.rootDir, 'projects');
    this.logsDir = join(this.rootDir, 'logs');
    [this.rootDir, this.projectsDir, this.logsDir].forEach((dir) => mkdirSync(dir, { recursive: true }));
  }

  projectDir(projectId: string): string {
    const root = join(this.projectsDir, projectId);
    ['assets/characters', 'assets/scenes', 'assets/props', 'assets/storyboards', 'assets/first-frames', 'assets/last-frames',
      'assets/videos', 'assets/references', 'generations/images', 'generations/videos', 'thumbnails'].forEach((part) => mkdirSync(join(root, part), { recursive: true }));
    return root;
  }

  copyIntoProject(projectId: string, sourcePath: string, type: AssetType, preferredName?: string): string {
    if (!existsSync(sourcePath)) throw new Error('选择的文件不存在');
    const ext = extname(sourcePath).toLowerCase();
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitize(preferredName || basename(sourcePath, ext))}${ext}`;
    const target = join(this.projectDir(projectId), 'assets', folderByType[type], fileName);
    copyFileSync(sourcePath, target);
    return target;
  }

  importGenerated(projectId: string, sourcePath: string, outputType: 'image' | 'video'): string {
    const ext = extname(sourcePath) || (outputType === 'image' ? '.png' : '.mp4');
    const target = join(this.projectDir(projectId), 'generations', outputType === 'image' ? 'images' : 'videos', `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
    copyFileSync(sourcePath, target);
    return target;
  }

  async download(projectId: string, url: string, outputType: 'image' | 'video'): Promise<string> {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`下载生成结果失败：HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const extension = outputType === 'video' ? '.mp4' : contentType.includes('jpeg') ? '.jpg' : '.png';
    const target = join(this.projectDir(projectId), 'generations', outputType === 'image' ? 'images' : 'videos', `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`);
    await pipeline(response.body as never, createWriteStream(target));
    return target;
  }

  createMock(projectId: string, outputType: 'image' | 'video', prompt: string): string {
    if (outputType === 'image') {
      const target = join(this.projectDir(projectId), 'generations/images', `${Date.now()}-mock.svg`);
      const escaped = prompt.replace(/[<>&]/g, '').slice(0, 80);
      writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#111827"/><rect x="80" y="80" width="1120" height="560" rx="12" fill="#182235" stroke="#2d76ff"/><text x="120" y="180" fill="#54e7c2" font-family="Arial" font-size="36">Mock 图片结果</text><text x="120" y="250" fill="#d7e2f2" font-family="Arial" font-size="24">${escaped}</text></svg>`, 'utf8');
      return target;
    }
    const target = join(this.projectDir(projectId), 'generations/videos', `${Date.now()}-${randomUUID().slice(0, 8)}-mock-video.mp4`);
    const source = app.isPackaged ? join(process.resourcesPath, 'mock-video.mp4') : join(app.getAppPath(), 'resources', 'mock-video.mp4');
    if (!existsSync(source)) throw new Error('Mock 视频资源缺失，请重新安装应用。');
    copyFileSync(source, target);
    return target;
  }

  deleteFile(path: string): void {
    if (path && existsSync(path)) rmSync(path, { force: true });
  }

  deleteProject(projectId: string): void {
    const target = join(this.projectsDir, projectId);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }

  openRoot(): Promise<string> { return shell.openPath(this.rootDir); }
  openLogs(): Promise<string> { return shell.openPath(this.logsDir); }
  openProject(projectId: string): Promise<string> { return shell.openPath(this.projectDir(projectId)); }
  reveal(path: string): void { shell.showItemInFolder(path); }
}

const sanitize = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 60) || 'asset';
