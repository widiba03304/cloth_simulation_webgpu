import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultPath: string, data: string | Buffer): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultPath, data),
  showSaveDialog: (options: { defaultPath?: string }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showSaveDialog', options),
  saveScreenshot: (base64Data: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveScreenshot', base64Data),
  saveProject: (path: string, json: string): Promise<boolean> =>
    ipcRenderer.invoke('project:save', path, json),
  loadProject: (path: string): Promise<string> => ipcRenderer.invoke('project:load', path),
  getAppPath: (): Promise<string> => ipcRenderer.invoke('app:getPath', 'userData'),
});
