import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'path';
import { writeFile, readFile } from 'fs/promises';

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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../../out/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
  createWindow();
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
