import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'path';
import { writeFile, readFile, readdir, unlink, mkdir } from 'fs/promises';

const SCREENSHOT_MODE = process.argv.includes('--screenshot-mode');
const SCREENSHOT_DELAY_MS = (() => {
  const a = process.argv.find(x => x.startsWith('--delay='));
  return a ? parseInt(a.split('=')[1]) : 10000;
})();
const SCREENSHOT_PATTERN = (() => {
  const a = process.argv.find(x => x.startsWith('--pattern='));
  return a ? a.split('=')[1] : '';
})();
const SCREENSHOT_FROZEN = process.argv.includes('--frozen');
const SCREENSHOTS_DIR = join(process.cwd(), '.omc', 'screenshots');
import { randomUUID } from 'crypto';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  const screenshotExtraParams = [
    SCREENSHOT_PATTERN ? `pattern=${SCREENSHOT_PATTERN}` : '',
    SCREENSHOT_FROZEN ? 'frozen=1' : '',
  ].filter(Boolean).join('&');
  const screenshotQuery = screenshotExtraParams ? `?auto=editor&${screenshotExtraParams}` : '?auto=editor';
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(
      SCREENSHOT_MODE
        ? `${process.env.ELECTRON_RENDERER_URL}${screenshotQuery}`
        : process.env.ELECTRON_RENDERER_URL
    );
  } else {
    const query: Record<string, string> = SCREENSHOT_MODE
      ? { auto: 'editor', ...(SCREENSHOT_PATTERN ? { pattern: SCREENSHOT_PATTERN } : {}), ...(SCREENSHOT_FROZEN ? { frozen: '1' } : {}) }
      : {};
    mainWindow.loadFile(
      join(__dirname, '../../out/renderer/index.html'),
      SCREENSHOT_MODE ? { query } : undefined
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getProjectsDir(): string {
  return join(app.getPath('userData'), 'projects');
}

function getPatternsDir(): string {
  return join(app.getPath('userData'), 'patterns');
}

function getMaterialsDir(): string {
  return join(app.getPath('userData'), 'materials');
}

app.whenReady().then(async () => {
  // Ensure data directories exist
  await Promise.all([
    mkdir(getProjectsDir(), { recursive: true }),
    mkdir(getPatternsDir(), { recursive: true }),
    mkdir(getMaterialsDir(), { recursive: true }),
  ]);
  ipcMain.handle('dialog:openFile', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    return filePaths[0] ?? null;
  });
  ipcMain.handle('dialog:saveFile', async (_e, defaultPath: string, data: string | Buffer) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, { defaultPath });
    if (filePath) {
      await writeFile(filePath, data);
      return filePath;
    }
    return null;
  });
  ipcMain.handle('dialog:showSaveDialog', async (_e, options: { defaultPath?: string }) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, options);
    return filePath ?? null;
  });
  ipcMain.handle('dialog:saveScreenshot', async (_e, base64Data: string) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'screenshot.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (filePath) {
      const buf = Buffer.from(base64Data, 'base64');
      await writeFile(filePath, buf);
      return filePath;
    }
    return null;
  });
  ipcMain.handle('app:getPath', async (_e, name: string) => app.getPath(name as 'userData'));
  ipcMain.handle('project:save', async (_e, path: string, json: string) => {
    await writeFile(path, json, 'utf-8');
    return true;
  });
  ipcMain.handle('project:load', async (_e, path: string) => {
    const data = await readFile(path, 'utf-8');
    return data;
  });

  // Project CRUD
  ipcMain.handle('projects:list', async () => {
    const dir = getProjectsDir();
    const files = await readdir(dir);
    const projects: unknown[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = await readFile(join(dir, f), 'utf-8');
        projects.push(JSON.parse(data));
      } catch { /* skip corrupt files */ }
    }
    return projects;
  });

  ipcMain.handle('projects:create', async (_e, name: string) => {
    const id = randomUUID();
    const now = Date.now();
    const project = { id, name, createdAt: now, updatedAt: now, avatarIndex: 0 };
    await writeFile(join(getProjectsDir(), `${id}.json`), JSON.stringify(project, null, 2), 'utf-8');
    return project;
  });

  ipcMain.handle('projects:update', async (_e, project: { id: string }) => {
    const updated = { ...project, updatedAt: Date.now() };
    await writeFile(join(getProjectsDir(), `${project.id}.json`), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });

  ipcMain.handle('projects:delete', async (_e, id: string) => {
    await unlink(join(getProjectsDir(), `${id}.json`));
    return true;
  });

  // Pattern CRUD
  ipcMain.handle('patterns:list', async () => {
    const dir = getPatternsDir();
    const files = await readdir(dir);
    const items: unknown[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = await readFile(join(dir, f), 'utf-8');
        items.push(JSON.parse(data));
      } catch { /* skip corrupt files */ }
    }
    return items;
  });

  ipcMain.handle('patterns:create', async (_e, name: string) => {
    const id = randomUUID();
    const now = Date.now();
    const item = { id, name, createdAt: now, updatedAt: now };
    await writeFile(join(getPatternsDir(), `${id}.json`), JSON.stringify(item, null, 2), 'utf-8');
    return item;
  });

  ipcMain.handle('patterns:update', async (_e, item: { id: string }) => {
    const updated = { ...item, updatedAt: Date.now() };
    await writeFile(join(getPatternsDir(), `${item.id}.json`), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });

  ipcMain.handle('patterns:delete', async (_e, id: string) => {
    await unlink(join(getPatternsDir(), `${id}.json`));
    return true;
  });

  // Material CRUD
  ipcMain.handle('materials:list', async () => {
    const dir = getMaterialsDir();
    const files = await readdir(dir);
    const items: unknown[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = await readFile(join(dir, f), 'utf-8');
        items.push(JSON.parse(data));
      } catch { /* skip corrupt files */ }
    }
    return items;
  });

  ipcMain.handle('materials:create', async (_e, name: string) => {
    const id = randomUUID();
    const now = Date.now();
    const item = { id, name, createdAt: now, updatedAt: now };
    await writeFile(join(getMaterialsDir(), `${id}.json`), JSON.stringify(item, null, 2), 'utf-8');
    return item;
  });

  ipcMain.handle('materials:update', async (_e, item: { id: string }) => {
    const updated = { ...item, updatedAt: Date.now() };
    await writeFile(join(getMaterialsDir(), `${item.id}.json`), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });

  ipcMain.handle('materials:delete', async (_e, id: string) => {
    await unlink(join(getMaterialsDir(), `${id}.json`));
    return true;
  });

  createWindow();

  if (SCREENSHOT_MODE) {
    const CAPTURE_VIEWS = ['front', 'front45', 'right', 'back', 'left', 'top'];
    let viewReadyResolve: (() => void) | null = null;
    const LOG_FILE = join(process.cwd(), '.omc', 'screenshot-debug.log');
    const log = async (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      process.stdout.write(line);
      try { const { appendFile } = await import('fs/promises'); await appendFile(LOG_FILE, line); } catch {}
    };

    ipcMain.handle('screenshot:view-ready', async (_e, view: string) => {
      await log(`view-ready received: ${view}`);
      viewReadyResolve?.();
    });

    let rendererReadyResolve: (() => void) | null = null;
    const rendererReadyPromise = new Promise<void>(r => { rendererReadyResolve = r; });
    ipcMain.handle('screenshot:renderer-ready', async () => {
      await log('renderer-ready received');
      rendererReadyResolve?.();
    });

    mainWindow!.webContents.on('did-finish-load', () => {
      void log('did-finish-load fired');
      void rendererReadyPromise.then(async () => {
        await new Promise(r => setTimeout(r, SCREENSHOT_DELAY_MS));
        await log(`starting screenshot loop after ${SCREENSHOT_DELAY_MS}ms simulation warmup`);
        await mkdir(SCREENSHOTS_DIR, { recursive: true });
        for (const view of CAPTURE_VIEWS) {
          await log(`sending set-view: ${view}`);
          await new Promise<void>(resolve => {
            viewReadyResolve = resolve;
            mainWindow!.webContents.send('screenshot:set-view', view);
          });
          await log(`view-ready resolved for: ${view}`);
          await new Promise(r => setTimeout(r, 150)); // let GPU render the new angle
          const image = await mainWindow!.webContents.capturePage();
          await writeFile(join(SCREENSHOTS_DIR, `${view}.png`), image.toPNG());
          await log(`saved → .omc/screenshots/${view}.png`);
        }
        // latest.png = front view for quick checks
        const { readFile } = await import('fs/promises');
        await writeFile(join(SCREENSHOTS_DIR, 'latest.png'), await readFile(join(SCREENSHOTS_DIR, 'front.png')));
        await log('all views captured');
        app.quit();
      });
    });

    mainWindow!.webContents.on('render-process-gone', (_e, details) => {
      void log(`renderer crashed: ${details.reason} (exitCode=${details.exitCode})`);
    });
    mainWindow!.webContents.on('did-fail-load', (_e, errCode, errDesc) => {
      void log(`did-fail-load: ${errDesc} (${errCode})`);
    });
    mainWindow!.on('closed', () => { void log('main window closed'); });
    mainWindow!.webContents.on('console-message', (_e, level, message) => {
      void log(`[renderer:${level}] ${message}`);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
