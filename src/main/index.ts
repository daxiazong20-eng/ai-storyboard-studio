import { app, BrowserWindow, net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppDatabase } from './db/database';
import { FileManager } from './services/fileManager';
import { HermesClient } from './services/hermesClient';
import { GenerationQueue } from './services/generationQueue';
import { registerIpc } from './ipc';
import { ALL_DEFAULT_MODELS } from '@shared/modelRegistry';

protocol.registerSchemesAsPrivileged([{ scheme: 'studio-file', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1540, height: 940, minWidth: 1100, minHeight: 700, show: false, backgroundColor: '#08101c',
    title: 'AI Storyboard Studio', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  if (process.env.ELECTRON_RENDERER_URL) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  const files = new FileManager();
  const db = new AppDatabase(files.rootDir);
  db.init(); db.resetInterruptedTasks();
  if (!db.listModels().length) db.replaceModels(ALL_DEFAULT_MODELS);
  const hermes = new HermesClient(() => db.getAppSettings());
  const queue = new GenerationQueue(db, files, hermes);
  registerIpc({ db, files, queue, hermes });
  protocol.handle('studio-file', (request) => {
    const encoded = new URL(request.url).pathname.replace(/^\//, '');
    return net.fetch(pathToFileURL(decodeURIComponent(encoded)).toString());
  });
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
