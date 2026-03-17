/**
 * Renderer entry: wires WebGPU, simulation, appCtx.render, appCtx.camera, and UI.
 * Two views: Dashboard (project list) and Editor (3D viewport).
 */

import { initI18n, t } from './i18n';
import { requestGPUContext, reconfigureCanvas, type GPUContext } from './webgpu/device';
import { createRenderPipeline, drawMainPass, drawCloth3D, updateBodyMesh, updateCubemap, setBackgroundGrid, type RenderContext } from './render/pipeline';
import type { Cloth3DInstance } from './sim/cloth3d/cloth3d';
import { getClothMaterialParams, rgbToHex } from './data/materials';
import { buildCloth } from './managers/clothManager';
import type { MaskPatternLayer } from './sim/cloth3d/cloth3d.mask';
import { loadSMPLMannequins, getPelvisTarget, type BodyMesh } from './render/bodyMesh';
import {
  loadSMPLShapeData,
  applySMPLBlendShapesScaled,
  applySMPLBlendShapesWithUnscaled,
  betasToArray,
  getShapeData,
  type SMPLBetas,
  type SMPLShapeData,
} from './render/smplBlendShapes';
import { createOrbitCamera, updateCamera, applyCameraPreset, type OrbitCamera, type CameraPreset } from './render/camera';
import { loadKeymap, getDefaultKeymap } from './input/keymap';
import { attachCameraInput } from './input/cameraInput';
import { createGimbalElement, updateGimbal } from './ui/gimbal';
import { createTargetIndicatorElement, updateTargetIndicator } from './ui/targetIndicator';
import { loadSMPLPoseData } from './render/smplPoseData';
import { initIK, reinitIK, cleanupIK, type IKResources } from './managers/ikManager';
import { createDashboard, updateProjectList, updateRecentList, type Project, type DashboardItem, type RecentItem } from './ui/dashboard';
import { createWorkspace, type WorkspaceInstance, type WorkspacePane, type PaneEditorType } from './ui/workspace';
import { resolveSceneForEditor } from './scene';
import { createPatternEditor, type PatternData } from './ui/patternEditor';
import { createMaterialEditor, type MaterialData } from './ui/materialEditor';
import { ctx as appCtx } from './app/context';

interface ElectronAPI {
  openFile: () => Promise<string | null>;
  saveFile: (defaultPath: string, data: string | Buffer) => Promise<string | null>;
  showSaveDialog: (options: { defaultPath?: string }) => Promise<string | null>;
  saveScreenshot: (base64Data: string) => Promise<string | null>;
  saveProject: (path: string, json: string) => Promise<boolean>;
  loadProject: (path: string) => Promise<string>;
  getAppPath: () => Promise<string>;
  listProjects: () => Promise<Project[]>;
  createProject: (name: string) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: string) => Promise<boolean>;
  listPatterns: () => Promise<DashboardItem[]>;
  createPattern: (name: string) => Promise<DashboardItem>;
  updatePattern: (item: DashboardItem) => Promise<DashboardItem>;
  deletePattern: (id: string) => Promise<boolean>;
  listMaterials: () => Promise<DashboardItem[]>;
  createMaterial: (name: string) => Promise<DashboardItem>;
  updateMaterial: (item: DashboardItem) => Promise<DashboardItem>;
  deleteMaterial: (id: string) => Promise<boolean>;
  onScreenshotSetView?: (cb: (view: string) => void) => void;
  screenshotViewReady?: (view: string) => Promise<void>;
  screenshotRendererReady?: () => Promise<void>;
}

function getElectron(): ElectronAPI | null {
  return (window as unknown as { electron?: ElectronAPI }).electron ?? null;
}

function captureCanvasThumbnail(source: HTMLCanvasElement): string | null {
  try {
    // Card preview: ~200-250px wide x 120px tall → use 2x for retina
    const tw = 480;
    const th = 240;
    const tmp = document.createElement('canvas');
    tmp.width = tw;
    tmp.height = th;
    const c2d = tmp.getContext('2d');
    if (!c2d) return null;

    // Fill background
    c2d.fillStyle = '#1a1a1a';
    c2d.fillRect(0, 0, tw, th);

    // Fit source preserving aspect ratio (center crop)
    const srcAspect = source.width / source.height;
    const dstAspect = tw / th;
    let sw = source.width;
    let sh = source.height;
    let sx = 0;
    let sy = 0;
    if (srcAspect < dstAspect) {
      sh = source.width / dstAspect;
      sy = (source.height - sh) / 2;
    } else {
      sw = source.height * dstAspect;
      sx = (source.width - sw) / 2;
    }
    c2d.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
    return tmp.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

const app = document.getElementById('app')!;
const canvas = app.querySelector('#canvas') as HTMLCanvasElement;
let gimbalCanvas: HTMLCanvasElement | null = null;
let targetIndicatorCanvas: HTMLCanvasElement | null = null;

let avatarIndex = 0;
let bodyMeshes: [BodyMesh, BodyMesh] | null = null;  // Scaled meshes for rendering
let bodyMeshesOriginal: [BodyMesh, BodyMesh] | null = null;
let bodyMeshesUnscaled: [Float32Array, Float32Array] | null = null;
let fpsFrameCount = 0;
let fpsLastTime = 0;
let fpsValue = 0;

let smplBetas: SMPLBetas = {
  beta0: 0, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
  beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
};
let smplShapeDataLoaded = false;

// IK system
let ikResources: IKResources | null = null;
let ikEnabled = false;
let smplPoseDataLoaded = false;

// 3D cloth simulation
let turntableEnabled = false;
let simFrozen = true;  // starts paused; user presses Play in toolbar to begin
let currentSize = 'M';

// Currently loaded albedo texture (tracked so we can destroy it on clear/replace)
let albedoTexture: GPUTexture | null = null;

let keymap = getDefaultKeymap();
let cameraInputDetach: (() => void) | null = null;
let currentSubSteps = 8;

// Colorway: optional albedo override (set by color picker, cleared when material changes)
let currentAlbedoOverride: [number, number, number] | null = null;

/** Overrides from a user-edited PatternData (rows/cols/spacing/pinned override fixed configs). */
let activePatternGrid: { rows: number; cols: number; spacing: number; pinned?: string } | null = null;
/** Active pattern layer used for outline masking (neckline/armhole cutouts). */
let activePatternLayer: MaskPatternLayer | null = null;

async function resetCloth(patternId: string, materialId: string): Promise<void> {
  if (!appCtx.gpu) return;

  // Show loading overlay before the blocking GPU/CPU work.
  // Animate the bar to 80% with a slow ease so the user sees progress.
  showLoading();
  setLoadingProgress(0, 'Building cloth…');
  const bar = document.getElementById('loading-bar');
  if (bar) bar.style.transition = 'width 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  // Yield two animation frames so the browser paints the overlay before JS blocks.
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  setLoadingProgress(80);

  appCtx.cloth3d = await buildCloth(appCtx.gpu.device, appCtx.cloth3d ?? null, {
    patternId, size: currentSize, materialId,
    albedoOverride: currentAlbedoOverride,
    activePatternGrid, activePatternLayer,
    bodyMesh: bodyMeshes?.[avatarIndex],
  });

  // Snap to 100% then hide.
  if (bar) bar.style.transition = 'width 0.15s ease';
  setLoadingProgress(100, 'Done');
  await new Promise<void>(r => setTimeout(r, 160));
  hideLoading();
}

// View state
let editorRunning = false;
let editorAnimFrameId = 0;
let currentProject: Project | null = null;
let dashboardEl: HTMLElement | null = null;
let workspaceInstance: WorkspaceInstance | null = null;
const paneCleanups = new Map<string, () => void>();
let editorUIElements: HTMLElement[] = []; // panel, toggleBtn, gimbal, back btn — for cleanup

function onResize(): void {
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  let w = Math.floor(canvas.clientWidth * dpr);
  let h = Math.floor(canvas.clientHeight * dpr);
  if (w <= 0 || h <= 0) {
    w = Math.max(1, Math.floor((window.innerWidth ?? 640) * dpr));
    h = Math.max(1, Math.floor((window.innerHeight ?? 480) * dpr));
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    if (appCtx.gpu?.context) {
      reconfigureCanvas(canvas, appCtx.gpu.device).then((ctx) => {
        if (ctx && appCtx.gpu) (appCtx.gpu as GPUContext).context = ctx;
      });
    }
    if (appCtx.camera) {
      appCtx.camera.aspect = w / h;
      updateCamera(appCtx.camera);
    }
  }
}

async function loadBodyAndCreateRender(): Promise<void> {
  if (!appCtx.gpu) return;

  if (!smplShapeDataLoaded) {
    const { male, female } = await loadSMPLShapeData();
    smplShapeDataLoaded = true;
    console.log('SMPL shape data loaded:', { male: !!male, female: !!female });
  }

  // Generate body meshes from SMPL shapedirs if available, otherwise use OBJ fallback
  const maleData = getShapeData('male');
  const femaleData = getShapeData('female');

  if (maleData && femaleData) {
    // Use real SMPL blend shapes with unscaled versions for IK
    const maleResult = applySMPLBlendShapesWithUnscaled(maleData, betasToArray(smplBetas));
    const femaleResult = applySMPLBlendShapesWithUnscaled(femaleData, betasToArray(smplBetas));

    bodyMeshes = [maleResult.scaled, femaleResult.scaled];
    bodyMeshesUnscaled = [maleResult.unscaled, femaleResult.unscaled];
  } else {
    // Fallback to OBJ loading if SMPL data not available
    if (!bodyMeshesOriginal) {
      const { male, female } = await loadSMPLMannequins();
      bodyMeshesOriginal = [male, female];
    }
    bodyMeshes = [bodyMeshesOriginal[0], bodyMeshesOriginal[1]];
    bodyMeshesUnscaled = null;  // No unscaled data for OBJ meshes
  }
  const bodyMesh = bodyMeshes![avatarIndex];

  if (appCtx.render) {
    try {
      appCtx.render.viewProjBuffer.destroy();
      appCtx.render.bodyVertexBuffer.destroy();
      appCtx.render.bodyNormalBuffer.destroy();
      appCtx.render.bodyIndexBuffer.destroy();
      appCtx.render.bodyColorBuffer.destroy();
      // Note: GPURenderPipeline has no destroy() method in the WebGPU spec.
      appCtx.render.groundVertexBuffer.destroy();
      appCtx.render.groundNormalBuffer.destroy();
      appCtx.render.groundIndexBuffer.destroy();
      appCtx.render.groundColorBuffer.destroy();
      appCtx.render.cubemap?.texture.destroy();
      appCtx.render.skyboxVertexBuffer.destroy();
      appCtx.render.skyboxIndexBuffer.destroy();
      appCtx.render.mainDepthTexture?.destroy();
    } catch {
      // ignore
    }
  }

  appCtx.render = await createRenderPipeline(appCtx.gpu.device, appCtx.gpu.context, appCtx.gpu.format, bodyMesh);
}

async function initEditor(): Promise<void> {
  setLoadingProgress(0, 'Loading…');
  setLoadingProgress(5, 'Initializing…');

  appCtx.gpu = await requestGPUContext(canvas);
  if (!appCtx.gpu) {
    hideLoading();
    app.innerHTML = `<p style="color:#fff;padding:2rem;font-family:sans-serif">${t('errors.webgpu')}</p>`;
    return;
  }
  setLoadingProgress(25, 'WebGPU ready');
  appCtx.gpu.device.lost.then((info: { reason: string; message: string }) => {
    console.error('WebGPU device lost:', info.reason, info.message);
  });

  onResize();
  setLoadingProgress(30, 'Loading body…');

  await loadBodyAndCreateRender();
  setLoadingProgress(70, 'Setting up scene…');
  const bodyMesh = bodyMeshes?.[avatarIndex];
  const cameraTargetPelvis: [number, number, number] = bodyMesh
    ? getPelvisTarget(bodyMesh.positions)
    : [0, 0.5, 0];
  if (!appCtx.camera) {
    appCtx.camera = createOrbitCamera(3, cameraTargetPelvis);
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    appCtx.camera.aspect = w / h;
    updateCamera(appCtx.camera);
  }

  // Load SMPL pose data for IK
  if (!smplPoseDataLoaded) {
    setLoadingProgress(72, 'Loading pose data…');
    const { male, female } = await loadSMPLPoseData();
    smplPoseDataLoaded = true;
    setLoadingProgress(82, 'Pose data loaded');
    console.log('SMPL pose data loaded:', { male: !!male, female: !!female });

    // Initialize IK system
    if (bodyMeshes && appCtx.camera) {
      const unscaledMesh = bodyMeshesUnscaled ? bodyMeshesUnscaled[avatarIndex] : undefined;
      ikResources = initIK(appCtx.gpu.device, bodyMeshes[avatarIndex], unscaledMesh, avatarIndex, canvas, appCtx.camera, app);
      if (ikResources) {
        console.log('IK system initialized');
        setLoadingProgress(92, 'IK ready');
      }
    }
  }

  setLoadingProgress(94, 'Setting up controls…');
  keymap = loadKeymap();
  if (appCtx.camera) cameraInputDetach = attachCameraInput(canvas, keymap, appCtx.camera, ikResources?.inputHandler, ikResources?.translationGizmo, ikResources?.rotationGizmo);


  gimbalCanvas = createGimbalElement();
  app.appendChild(gimbalCanvas);
  editorUIElements.push(gimbalCanvas);

  targetIndicatorCanvas = createTargetIndicatorElement(canvas);


  // ── Initialize 3D cloth simulation ─────────────────────────────────────────
  setLoadingProgress(96, 'Loading cloth sim…');
  const initPatternId  = currentProject?.patternId  ?? 'tshirt';
  const initMaterialId = currentProject?.materialId ?? 'cotton';
  await resetCloth(initPatternId, initMaterialId);

  setLoadingProgress(100, 'Ready');
  onResize();
}

function loop(t: number): void {
  if (!editorRunning) return;
  editorAnimFrameId = requestAnimationFrame(loop);
  if (!appCtx.gpu || !appCtx.render || !appCtx.camera) return;
  if (canvas.width === 0 || canvas.height === 0) {
    onResize();
    return;
  }

  fpsFrameCount++;
  if (t - fpsLastTime >= 500) {
    fpsValue = (fpsFrameCount * 1000) / (t - fpsLastTime);
    fpsFrameCount = 0;
    fpsLastTime = t;
  }
  workspaceInstance?.updateStatus(fpsValue, 0, currentSubSteps, 'simulate');

  updateCamera(appCtx.camera);
  const ikControllerDragging = ikResources?.controller.isDragging() ?? false;
  const ikInputHandlerDragging = ikResources?.inputHandler.isDragging() ?? false;
  const translationGizmoDragging = ikResources?.translationGizmo.isDragging() ?? false;
  const rotationGizmoDragging = ikResources?.rotationGizmo.isDragging() ?? false;

  if (ikEnabled && ikResources && (ikControllerDragging || ikInputHandlerDragging || translationGizmoDragging || rotationGizmoDragging)) {
    try {
      const commandEncoder = appCtx.render.device.createCommandEncoder({ label: 'IK Skinning Encoder' });
      ikResources.controller.computeAndCopyGPUSkinning(
        commandEncoder,
        appCtx.render.bodyVertexBuffer,
        appCtx.render.bodyNormalBuffer
      );
      appCtx.render.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      console.error('[Main] IK skinning error:', error);
      ikEnabled = false;
      ikResources.controller.setEnabled(false);
    }
  }

  const pivot = appCtx.camera.orbitPivot ?? appCtx.camera.target;
  const sinT = Math.sin(appCtx.camera.theta);
  const cosT = Math.cos(appCtx.camera.theta);
  const sinP = Math.sin(appCtx.camera.phi);
  const cosP = Math.cos(appCtx.camera.phi);
  const cameraEye: [number, number, number] = [
    pivot[0] + appCtx.camera.distance * cosP * sinT,
    pivot[1] + appCtx.camera.distance * sinP,
    pivot[2] + appCtx.camera.distance * cosP * cosT,
  ];
  // ── Turntable auto-rotation ────────────────────────────────────────────────
  if (turntableEnabled) {
    appCtx.camera.theta += 0.005;
    updateCamera(appCtx.camera);
  }

  // ── IK → cloth capsule sync (update collision bodies from live pose) ────────
  if (appCtx.cloth3d && ikResources && ikEnabled) {
    appCtx.cloth3d.updateCapsulesFromJoints(
      ikResources.controller.skeleton.joints.map(j => j.worldPosition as readonly [number, number, number])
    );
  }

  // ── 3D cloth: physics step ─────────────────────────────────────────────────
  if (appCtx.cloth3d && !simFrozen) {
    appCtx.cloth3d.step();
    // Update draping overlay
    const drapingEl = document.getElementById('draping-overlay') as HTMLElement | null;
    if (drapingEl) {
      if (appCtx.cloth3d.isDraping) {
        const pct = Math.round(appCtx.cloth3d.drapingProgress * 100);
        drapingEl.textContent = `Draping… ${pct}%`;
        drapingEl.style.display = 'block';
      } else {
        drapingEl.style.display = 'none';
      }
    }
  }

  drawMainPass(appCtx.render, appCtx.camera.viewProj, cameraEye);

  // ── 3D cloth: render over body ─────────────────────────────────────────────────────
  if (appCtx.cloth3d) {
    appCtx.cloth3d.updateCameraPos(cameraEye);
    drawCloth3D(appCtx.render, appCtx.cloth3d);
  }

  ikResources?.handleRenderer.render();
  ikResources?.translationGizmo.render();
  ikResources?.rotationGizmo.render();

  if (gimbalCanvas) updateGimbal(gimbalCanvas, appCtx.camera);
  if (targetIndicatorCanvas) updateTargetIndicator(targetIndicatorCanvas, canvas, appCtx.camera);
}

window.addEventListener('resize', onResize);
function setLoadingProgress(percent: number, message?: string): void {
  const wrap = document.querySelector('#loading [role="progressbar"]');
  const bar = document.getElementById('loading-bar');
  const pctEl = document.getElementById('loading-pct');
  const textEl = document.getElementById('loading-text');
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  if (wrap) wrap.setAttribute('aria-valuenow', String(pct));
  if (bar) bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (textEl && message !== undefined) textEl.textContent = message;
}

function showLoading(): void {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('hidden');
    setLoadingProgress(0, 'Loading…');
  }
}

function hideLoading(): void {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
}

// --- Dashboard & Navigation ---

async function refreshDashboard(): Promise<void> {
  if (!dashboardEl) return;
  const el = getElectron();
  const projects = el ? (await el.listProjects()) as Project[] : [];
  updateProjectList(dashboardEl, projects, dashboardCallbacks);
  const recentItems: RecentItem[] = projects.map((p) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, thumbnail: p.thumbnail,
  }));
  updateRecentList(dashboardEl, recentItems, dashboardCallbacks);
}

const dashboardCallbacks = {
  onOpenProject: (project: Project) => {
    currentProject = project;
    const resolved = resolveSceneForEditor(project);
    avatarIndex = resolved.avatarIndex;
    navigateTo('workspace', project);
  },
  onCreateProject: async () => {
    const el = getElectron();
    if (!el) return;
    const project = await el.createProject(t('dash.untitledAvatar')) as Project;
    currentProject = project;
    const resolved = resolveSceneForEditor(project);
    avatarIndex = resolved.avatarIndex;
    navigateTo('workspace', project);
  },
  onDeleteProject: async (project: Project) => {
    const el = getElectron();
    if (!el) return;
    await el.deleteProject(project.id);
    await refreshDashboard();
  },
  onRenameProject: async (project: Project, newName: string) => {
    const el = getElectron();
    if (!el) return;
    await el.updateProject({ ...project, name: newName });
    await refreshDashboard();
  },
};

function cleanupEditor(): void {
  editorRunning = false;
  if (editorAnimFrameId) {
    cancelAnimationFrame(editorAnimFrameId);
    editorAnimFrameId = 0;
  }
  // Remove editor UI elements (panel, toggleBtn, gimbal, backBtn)
  for (const el of editorUIElements) {
    el.remove();
  }
  editorUIElements = [];
  // Remove IK overlays
  cleanupIK(ikResources);
  ikResources = null;
  ikEnabled = false;
  if (targetIndicatorCanvas) { targetIndicatorCanvas.remove(); targetIndicatorCanvas = null; }
  gimbalCanvas = null;
  appCtx.camera = null;
  smplPoseDataLoaded = false;
  appCtx.cloth3d?.destroy();
  appCtx.cloth3d = null;
  albedoTexture?.destroy();
  albedoTexture = null;
  currentAlbedoOverride = null;
  turntableEnabled = false;
  simFrozen = true;  // reset to paused; Play button in toolbar reflects this
  currentSize = 'M';
}

function hideAllViews(): void {
  // Cleanup workspace pane editors
  for (const cleanup of paneCleanups.values()) cleanup();
  paneCleanups.clear();
  if (workspaceInstance) { workspaceInstance.destroy(); workspaceInstance = null; }

  // Restore #app to body if it was moved into a pane
  if (app.parentElement !== document.body) document.body.appendChild(app);

  cleanupEditor();
  app.classList.add('hidden');
  hideLoading();
  if (dashboardEl) dashboardEl.classList.add('hidden');
}

// --- Workspace pane lifecycle ---

async function mountPaneEditor(pane: WorkspacePane, project: Project): Promise<void> {
  if (pane.type === 'simulation') {
    app.classList.remove('hidden');
    pane.contentEl.appendChild(app);
    if (!appCtx.gpu) {
      showLoading();
      try {
        await initEditor();
        hideLoading();
        editorRunning = true;
        editorAnimFrameId = requestAnimationFrame(loop);
      } catch (err: unknown) {
        console.error('Workspace simulation init failed:', err);
        hideLoading();
      }
    } else if (!editorRunning) {
      editorRunning = true;
      editorAnimFrameId = requestAnimationFrame(loop);
    }
    paneCleanups.set(pane.id, () => { /* simulation cleanup in unmountPaneEditor */ });

  } else if (pane.type === 'pattern') {
    const el = getElectron();
    let patternData: PatternData;

    if (project.patternId && el) {
      const items = await el.listPatterns() as DashboardItem[];
      const found = items.find(i => i.id === project.patternId);
      patternData = found
        ? { ...found, grid: (found as unknown as PatternData).grid ?? { rows: 20, cols: 12, spacing: 0.03 }, pinned: (found as unknown as PatternData).pinned ?? 'topRow' }
        : { id: 'default', name: 'Pattern', createdAt: Date.now(), updatedAt: Date.now(), grid: { rows: 20, cols: 12, spacing: 0.03 }, pinned: 'topRow' };
    } else if (el) {
      const item = await el.createPattern(t('dash.untitledPattern'));
      patternData = { ...item, grid: { rows: 20, cols: 12, spacing: 0.03 }, pinned: 'topRow' };
      await el.updatePattern(patternData as unknown as DashboardItem);
      project.patternId = item.id;
      await el.updateProject(project);
      if (currentProject) currentProject.patternId = item.id;
    } else {
      patternData = { id: 'default', name: 'Pattern', createdAt: Date.now(), updatedAt: Date.now(), grid: { rows: 20, cols: 12, spacing: 0.03 }, pinned: 'topRow' };
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const editorEl = createPatternEditor(patternData, {
      onChange: (updated) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (!updated.grid) return;
          activePatternGrid = { rows: updated.grid.rows, cols: updated.grid.cols, spacing: updated.grid.spacing, pinned: updated.pinned };
          if (updated.layers?.length) {
            const layerId = updated.activeLayerId;
            activePatternLayer = (layerId ? updated.layers.find(l => l.id === layerId) : updated.layers[0]) ?? null;
          } else {
            activePatternLayer = null;
          }
          await resetCloth(updated.id ?? currentProject?.patternId ?? 'tshirt', currentProject?.materialId ?? 'cotton');
        }, 600);
      },
      onSave: async (updated) => {
        const elec = getElectron();
        if (elec) await elec.updatePattern(updated as unknown as DashboardItem);
      },
      onBack: () => navigateTo('dashboard'),
    });
    pane.contentEl.appendChild(editorEl);
    paneCleanups.set(pane.id, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      editorEl.remove();
    });

  } else if (pane.type === 'material') {
    const el = getElectron();
    let materialData: MaterialData;

    if (project.materialId && el) {
      const items = await el.listMaterials() as DashboardItem[];
      const found = items.find(i => i.id === project.materialId);
      materialData = found
        ? { ...found, albedo: (found as unknown as MaterialData).albedo ?? [0.9, 0.9, 0.9], roughness: (found as unknown as MaterialData).roughness ?? 0.5 } as unknown as MaterialData
        : { id: 'default', name: 'Material', createdAt: Date.now(), updatedAt: Date.now(), albedo: [0.9, 0.9, 0.9], roughness: 0.5 } as unknown as MaterialData;
    } else if (el) {
      const item = await el.createMaterial(t('dash.untitledMaterial'));
      materialData = { ...item, albedo: [0.9, 0.9, 0.9] as [number, number, number], roughness: 0.5 } as unknown as MaterialData;
      await el.updateMaterial(materialData as unknown as DashboardItem);
      project.materialId = item.id;
      await el.updateProject(project);
      if (currentProject) currentProject.materialId = item.id;
    } else {
      materialData = { id: 'default', name: 'Material', createdAt: Date.now(), updatedAt: Date.now(), albedo: [0.9, 0.9, 0.9], roughness: 0.5 } as unknown as MaterialData;
    }

    const editorEl = createMaterialEditor(materialData, {
      onSave: async (updated) => {
        const elec = getElectron();
        if (elec) await elec.updateMaterial(updated as unknown as DashboardItem);
        await resetCloth(currentProject?.patternId ?? 'tshirt', updated.id ?? currentProject?.materialId ?? 'cotton');
      },
      onBack: () => navigateTo('dashboard'),
    });
    pane.contentEl.appendChild(editorEl);
    paneCleanups.set(pane.id, () => { editorEl.remove(); });
  }
}

function unmountPaneEditor(paneId: string, type: PaneEditorType): void {
  paneCleanups.get(paneId)?.();
  paneCleanups.delete(paneId);
  if (type === 'simulation') {
    cleanupEditor();
    if (app.parentElement !== document.body) document.body.appendChild(app);
    app.classList.add('hidden');
  }
}

async function navigateTo(view: 'dashboard' | 'workspace', data?: unknown): Promise<void> {
  if (view === 'dashboard') {
    hideAllViews();
    if (dashboardEl) {
      dashboardEl.classList.remove('hidden');
      await refreshDashboard();
    }
  } else if (view === 'workspace') {
    hideAllViews();
    const project = data as Project;
    workspaceInstance = createWorkspace(project.name, ['simulation'], {
      // ── Navigation ────────────────────────────────────────────────────────────
      onBack: async () => {
        if (currentProject && canvas) {
          try {
            const thumb = captureCanvasThumbnail(canvas);
            if (thumb) { currentProject.thumbnail = thumb; const el = getElectron(); if (el) await el.updateProject(currentProject); }
          } catch { /* ignore */ }
        }
        void navigateTo('dashboard');
      },
      onSave: async () => {
        if (!currentProject) return;
        const el = getElectron();
        if (!el) return;
        if (canvas) {
          try { const thumb = captureCanvasThumbnail(canvas); if (thumb) currentProject.thumbnail = thumb; } catch { /* ignore */ }
        }
        await el.updateProject(currentProject);
      },
      onModeChange: (_mode) => { /* mode system: future */ },
      // ── Object tab ───────────────────────────────────────────────────────────
      onAvatarChange: (i) => {
        avatarIndex = i;
        if (currentProject) { currentProject.avatarIndex = i; const el = getElectron(); if (el) el.updateProject(currentProject); }
        if (appCtx.render && bodyMeshes) {
          updateBodyMesh(appCtx.render, bodyMeshes[i]);
          if (ikResources && bodyMeshesUnscaled && appCtx.camera && appCtx.gpu) {
            const wasEnabled = ikEnabled;
            ikEnabled = false;
            const newIk = reinitIK(ikResources, appCtx.gpu.device, bodyMeshes[i], bodyMeshesUnscaled[i], i, canvas, appCtx.camera, app);
            if (newIk) {
              ikResources = newIk;
              if (cameraInputDetach) cameraInputDetach();
              cameraInputDetach = attachCameraInput(canvas, keymap, appCtx.camera, ikResources.inputHandler, ikResources.translationGizmo, ikResources.rotationGizmo);
              ikEnabled = wasEnabled;
              ikResources.controller.setEnabled(ikEnabled);
            }
          }
        }
      },
      onPatternChange: async (patternId) => {
        if (!currentProject) return;
        currentProject.patternId = patternId;
        const el = getElectron();
        if (el) await el.updateProject(currentProject);
        activePatternGrid = null;
        activePatternLayer = null;
        await resetCloth(patternId, currentProject.materialId ?? 'cotton');
      },
      onCubemapChange: async (cubemapName) => {
        if (!appCtx.render) return;
        if (cubemapName === 'grid') {
          setBackgroundGrid(appCtx.render);
        } else {
          await updateCubemap(appCtx.render, cubemapName);
        }
      },
      onSizeChange: async (size) => {
        currentSize = size;
        await resetCloth(currentProject?.patternId ?? 'tshirt', currentProject?.materialId ?? 'cotton');
      },
      // ── Material tab ─────────────────────────────────────────────────────────
      onMaterialChange: async (materialId) => {
        if (!currentProject) return;
        currentProject.materialId = materialId;
        const el = getElectron();
        if (el) await el.updateProject(currentProject);
        currentAlbedoOverride = null;
        const newParams = getClothMaterialParams(materialId, null);
        workspaceInstance?.setPropertyColor(rgbToHex(...newParams.albedo));
        if (appCtx.cloth3d) appCtx.cloth3d.updateMaterialParams(newParams);
      },
      onColorChange: (albedo) => {
        currentAlbedoOverride = albedo;
        if (appCtx.cloth3d) appCtx.cloth3d.updateMaterialParams(getClothMaterialParams(currentProject?.materialId ?? 'cotton', albedo));
      },
      onTextureLoad: async (file) => {
        if (!appCtx.cloth3d || !appCtx.gpu) return;
        try {
          const bitmap = await createImageBitmap(file);
          const newTex = appCtx.gpu.device.createTexture({
            size: [bitmap.width, bitmap.height, 1], format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });
          appCtx.gpu.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: newTex }, [bitmap.width, bitmap.height]);
          bitmap.close();
          const sampler = appCtx.gpu.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
          albedoTexture?.destroy(); albedoTexture = newTex;
          appCtx.cloth3d.setAlbedoTexture(newTex, sampler);
        } catch (e) { console.error('Texture upload failed', e); }
      },
      onClearTexture: () => { appCtx.cloth3d?.clearAlbedoTexture(); albedoTexture?.destroy(); albedoTexture = null; },
      // ── Physics tab ──────────────────────────────────────────────────────────
      onFreezeToggle: (frozen) => { simFrozen = frozen; },
      onWindChange: (strength, angle) => {
        if (!appCtx.cloth3d) return;
        const rad = angle * (Math.PI / 180);
        appCtx.cloth3d.setWind([Math.cos(rad), 0, Math.sin(rad)], strength * 0.2);
      },
      onQualityChange: (quality) => {
        if (!appCtx.cloth3d) return;
        const presets: Record<string, [number, number]> = { low: [2, 2], medium: [4, 4], high: [8, 8] };
        const [ss, ci] = presets[quality]!;
        currentSubSteps = ss;
        appCtx.cloth3d.setQuality(ss, ci);
      },
      onResetCloth: () => { appCtx.cloth3d?.reset(); },
      // ── View tab ─────────────────────────────────────────────────────────────
      onCameraPreset: (preset) => { if (!appCtx.camera) return; applyCameraPreset(appCtx.camera, preset); updateCamera(appCtx.camera); },
      onOrthoToggle: (enabled) => {
        if (!appCtx.camera) return;
        appCtx.camera.orthographic = enabled;
        if (enabled) appCtx.camera.orthoScale = appCtx.camera.distance * Math.tan(appCtx.camera.fov / 2);
        updateCamera(appCtx.camera);
      },
      onTurntableToggle: (enabled) => { turntableEnabled = enabled; },
      onExportOBJ: async () => {
        if (!appCtx.cloth3d) return;
        const el = getElectron();
        if (!el) return;
        try {
          const obj = await appCtx.cloth3d.exportMeshOBJ();
          await el.saveFile(`${currentProject?.patternId ?? 'cloth'}_drape.obj`, obj);
        } catch (e) { console.error('OBJ export failed', e); }
      },
      // ── Pane lifecycle ───────────────────────────────────────────────────────
      onPaneAdded: (pane) => { void mountPaneEditor(pane, project); },
      onPaneRemoved: (paneId, type) => unmountPaneEditor(paneId, type),
      onPaneTypeChange: (paneId, oldType, newType) => {
        unmountPaneEditor(paneId, oldType);
        const pane = workspaceInstance!.getPanes().find(p => p.id === paneId);
        if (pane) void mountPaneEditor(pane, project);
      },
    });
    document.body.appendChild(workspaceInstance.element);
    for (const pane of workspaceInstance.getPanes()) {
      await mountPaneEditor(pane, project);
    }
  }
}

// --- Boot ---

async function boot(): Promise<void> {
  await initI18n();

  dashboardEl = createDashboard(dashboardCallbacks);
  document.body.appendChild(dashboardEl);

  const autoParams  = new URLSearchParams(location.search);
  const autoView    = autoParams.get('auto');
  const autoPattern = autoParams.get('pattern'); // e.g. ?auto=editor&pattern=skirt
  if (autoView === 'editor') {
    const autoFrozen = autoParams.get('frozen') === '1'; // --frozen: capture before-play state
    if (!currentProject) {
      currentProject = { id: 'screenshot', name: 'Screenshot', createdAt: 0, updatedAt: 0, avatarIndex: 0 };
    }
    await navigateTo('workspace', currentProject);
    // Override pattern from URL param (used by --pattern=X screenshot flag)
    if (autoPattern) {
      activePatternGrid = null;    // use sample config for the named pattern
      activePatternLayer = null;
      if (currentProject) currentProject.patternId = autoPattern;
      const sel = document.getElementById('pattern-select') as HTMLSelectElement | null;
      if (sel) sel.value = autoPattern;
      await resetCloth(autoPattern, currentProject?.materialId ?? 'denim');
    }
    // Start simulation unless frozen mode (for before-play screenshots)
    if (!autoFrozen) simFrozen = false;
    // Reset appCtx.camera to front view for consistent screenshots
    if (appCtx.camera) { applyCameraPreset(appCtx.camera, 'front'); updateCamera(appCtx.camera); }
    // Multi-view screenshot IPC: main sends 'set-view', renderer switches + replies 'view-ready'
    const el = getElectron();
    el?.onScreenshotSetView?.((view: string) => {
      if (appCtx.camera) {
        if (view === 'front45') {
          appCtx.camera.theta = -Math.PI / 4; appCtx.camera.phi = 0.25;
        } else {
          applyCameraPreset(appCtx.camera, view as import('./render/appCtx.camera').CameraPreset);
        }
        updateCamera(appCtx.camera);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => void el.screenshotViewReady?.(view)));
    });
    // Signal main process that renderer is ready — main will then wait SCREENSHOT_DELAY_MS
    // for simulation warmup before starting the capture loop.
    void el?.screenshotRendererReady?.();
  } else {
    await refreshDashboard();
  }
}

boot().catch((err) => {
  console.error('Boot failed:', err);
});
