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
  listProjects: (): Promise<unknown[]> => ipcRenderer.invoke('projects:list'),
  createProject: (name: string): Promise<unknown> => ipcRenderer.invoke('projects:create', name),
  updateProject: (project: unknown): Promise<unknown> => ipcRenderer.invoke('projects:update', project),
  deleteProject: (id: string): Promise<boolean> => ipcRenderer.invoke('projects:delete', id),
  listPatterns: (): Promise<unknown[]> => ipcRenderer.invoke('patterns:list'),
  createPattern: (name: string): Promise<unknown> => ipcRenderer.invoke('patterns:create', name),
  updatePattern: (item: unknown): Promise<unknown> => ipcRenderer.invoke('patterns:update', item),
  deletePattern: (id: string): Promise<boolean> => ipcRenderer.invoke('patterns:delete', id),
  listMaterials: (): Promise<unknown[]> => ipcRenderer.invoke('materials:list'),
  createMaterial: (name: string): Promise<unknown> => ipcRenderer.invoke('materials:create', name),
  updateMaterial: (item: unknown): Promise<unknown> => ipcRenderer.invoke('materials:update', item),
  deleteMaterial: (id: string): Promise<boolean> => ipcRenderer.invoke('materials:delete', id),
  // Screenshot multi-view IPC
  onScreenshotSetView: (cb: (view: string) => void) =>
    ipcRenderer.on('screenshot:set-view', (_e, view: string) => cb(view)),
  screenshotViewReady: (view: string): Promise<void> =>
    ipcRenderer.invoke('screenshot:view-ready', view),
  screenshotRendererReady: (): Promise<void> =>
    ipcRenderer.invoke('screenshot:renderer-ready'),
});
