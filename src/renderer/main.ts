/**
 * Renderer entry: wires WebGPU, simulation, render, camera, and UI.
 */

import { initI18n, t } from './i18n';
import { requestGPUContext, reconfigureCanvas, type GPUContext } from './webgpu/device';
import { buildClothFromSamplePattern } from './simulation/cloth';
import {
  createSimulation,
  stepSimulation,
  getClothVertexBuffer,
  resetSimulation,
  type SimulationContext,
} from './simulation/compute';
import { getParamsForPreset } from './simulation/params';
import type { SimulationParams } from './types/simulation';
import type { ClothData } from './types/simulation';
import { createRenderPipeline, drawMainPass, updateBodyMesh, updateCubemap, type RenderContext } from './render/pipeline';
import { loadSMPLMannequins, type BodyMesh } from './render/bodyMesh';
import {
  loadSMPLShapeData,
  applySMPLBlendShapesScaled,
  applySMPLBlendShapesWithUnscaled,
  betasToArray,
  getShapeData,
  type SMPLBetas,
  type SMPLShapeData,
} from './render/smplBlendShapes';
import { createOrbitCamera, updateCamera, type OrbitCamera } from './render/camera';
import { loadKeymap, saveKeymap, getDefaultKeymap } from './input/keymap';
import { attachCameraInput } from './input/cameraInput';
import { createControlsPanel } from './ui/controls';
import { updateCollisionParams, destroyBodyCollision } from './collision/bodyCollide';
import { createGimbalElement, updateGimbal } from './ui/gimbal';
import { createTargetIndicatorElement, updateTargetIndicator } from './ui/targetIndicator';
import { SAMPLE_PATTERNS } from './samples/patterns';
import { SAMPLE_MATERIALS } from './samples/materials';
import { loadSMPLPoseData, getPoseData, getIKJointIndices } from './render/smplPoseData';
import { IKController } from './ik/ikController';
import { IKInputHandler } from './input/ikInput';
import { IKHandleRenderer } from './ui/ikHandles';
import { TranslationGizmo } from './ui/translationGizmo';
import { RotationGizmo } from './ui/rotationGizmo';

const app = document.getElementById('app')!;
const canvas = app.querySelector('#canvas') as HTMLCanvasElement;
let gimbalCanvas: HTMLCanvasElement | null = null;
let targetIndicatorCanvas: HTMLCanvasElement | null = null;

let gpu: GPUContext | null = null;
let sim: SimulationContext | null = null;
let render: RenderContext | null = null;
let camera: OrbitCamera | null = null;
let running = true;
let pageVisible = true; // false when tab/window hidden (Page Visibility API)
let lastTime = 0;
let accum = 0;
const DT = 1 / 60;

let currentClothData: ClothData | null = null;
let currentParams: SimulationParams = getParamsForPreset(SAMPLE_MATERIALS[0].presetKey);
let patternIndex = 0;
let materialIndex = 0;
let avatarIndex = 0;
let bodyMeshes: [BodyMesh, BodyMesh] | null = null;  // Scaled meshes for rendering
let bodyMeshesOriginal: [BodyMesh, BodyMesh] | null = null;
let bodyMeshesUnscaled: [Float32Array, Float32Array] | null = null;  // Unscaled meshes for IK joint computation
let motionIndex = 0;
let motionLoop = true;
let motionTime = 0;
const MOTION_DURATION = 2; // seconds, for future animation clips
let fpsFrameCount = 0;
let fpsLastTime = 0;
let fpsValue = 0;

let smplBetas: SMPLBetas = {
  beta0: 0, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
  beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
};
let smplShapeDataLoaded = false;

// PBR state (kept in sync with UI, written to GPU each frame)
let pbrRoughness = 0.5;
let pbrMetallic = 0.1;
let pbrAmbientStrength = 0.5;
let pbrReflectionStrength = 0.22;

// IK system
let ikController: IKController | null = null;
let ikInputHandler: IKInputHandler | null = null;
let ikHandleRenderer: IKHandleRenderer | null = null;
let ikEnabled = false;
let ikHandleCanvas: HTMLCanvasElement | null = null;
let translationGizmo: TranslationGizmo | null = null;
let translationGizmoCanvas: HTMLCanvasElement | null = null;
let rotationGizmo: RotationGizmo | null = null;
let rotationGizmoCanvas: HTMLCanvasElement | null = null;
let smplPoseDataLoaded = false;

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
    if (gpu?.context) {
      reconfigureCanvas(canvas, gpu.device).then((ctx) => {
        if (ctx && gpu) (gpu as GPUContext).context = ctx;
      });
    }
    if (camera) {
      camera.aspect = w / h;
      updateCamera(camera);
    }
  }
}

async function rebuildSimulation(): Promise<void> {
  if (!gpu) return;
  const pattern = SAMPLE_PATTERNS[patternIndex];
  const { cloth, pinned } = await buildClothFromSamplePattern(pattern);
  currentClothData = cloth;

  // Load SMPL shape data if not already loaded
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
  const bodyMesh = bodyMeshes[avatarIndex];

  // Clean up body collision before destroying simulation buffers
  destroyBodyCollision();

  if (sim) {
    try {
      sim.positionBuffers[0].destroy();
      sim.positionBuffers[1].destroy();
      sim.prevPositionBuffers[0].destroy();
      sim.prevPositionBuffers[1].destroy();
      sim.pinnedBuffer.destroy();
      sim.structuralBuffer.destroy();
      sim.shearBuffer.destroy();
      sim.bendBuffer.destroy();
      sim.paramsUniform.destroy();
      sim.constraintUniform.destroy();
      sim.bendUniform.destroy();
    } catch {
      // ignore
    }
  }

  // Create simulation with body mesh for collision
  sim = await createSimulation(gpu.device, cloth, currentParams, pinned, bodyMesh);

  if (render) {
    try {
      render.viewProjBuffer.destroy();
      render.vertexBuffer.destroy();
      render.indexBuffer.destroy();
      render.pipeline.destroy();
      render.bodyVertexBuffer.destroy();
      render.bodyNormalBuffer.destroy();
      render.bodyIndexBuffer.destroy();
      render.bodyColorBuffer.destroy();
      render.bodyPipeline.destroy();
      render.groundVertexBuffer.destroy();
      render.groundNormalBuffer.destroy();
      render.groundIndexBuffer.destroy();
      render.groundColorBuffer.destroy();
      render.cubemap?.texture.destroy();
      render.skyboxPipeline.destroy();
      render.skyboxVertexBuffer.destroy();
      render.skyboxIndexBuffer.destroy();
      render.mainDepthTexture?.destroy();
    } catch {
      // ignore
    }
  }

  render = await createRenderPipeline(
    gpu.device,
    gpu.context,
    gpu.format,
    cloth.mesh.numVertices,
    cloth.mesh.indices,
    bodyMesh
  );
}

async function init(): Promise<void> {
  await initI18n();

  gpu = await requestGPUContext(canvas);
  if (!gpu) {
    app.innerHTML = `<p style="color:#fff;padding:2rem;font-family:sans-serif">${t('errors.webgpu')}</p>`;
    return;
  }
  gpu.device.lost.then((info: { reason: string; message: string }) => {
    console.error('WebGPU device lost:', info.reason, info.message);
  });

  onResize();

  await rebuildSimulation();
  if (!camera) {
    camera = createOrbitCamera(3, [0, 0, 0]);
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    camera.aspect = w / h;
    updateCamera(camera);
  }

  // Load SMPL pose data for IK
  if (!smplPoseDataLoaded) {
    const { male, female } = await loadSMPLPoseData();
    smplPoseDataLoaded = true;
    console.log('SMPL pose data loaded:', { male: !!male, female: !!female });

    // Initialize IK system if pose data is available
    const poseData = getPoseData(avatarIndex === 0 ? 'male' : 'female');
    if (poseData && bodyMeshes && camera) {
      const baseMesh = bodyMeshes[avatarIndex];
      const unscaledMesh = bodyMeshesUnscaled ? bodyMeshesUnscaled[avatarIndex] : undefined;

      // Create IK controller with GPU device (required) and unscaled mesh for accurate joint computation
      ikController = new IKController(poseData, baseMesh, gpu.device, unscaledMesh);

      // Set enabled joints (wrists, ankles, elbows, knees)
      const enabledJoints = getIKJointIndices();
      ikController.setEnabledJoints(enabledJoints);

      // Note: GPU skinning is only applied when IK is enabled and actively used
      // The original mesh is rendered until the user manipulates joints

      // Create IK input handler
      ikInputHandler = new IKInputHandler(ikController, camera, canvas);

      // Create translation gizmo
      translationGizmo = new TranslationGizmo(canvas, camera, ikController);
      translationGizmoCanvas = translationGizmo.getCanvas();
      app.appendChild(translationGizmoCanvas);

      // Create rotation gizmo
      rotationGizmo = new RotationGizmo(canvas, camera, ikController);
      rotationGizmoCanvas = rotationGizmo.getCanvas();
      app.appendChild(rotationGizmoCanvas);

      // Set up callbacks for gizmo activation
      ikInputHandler.setCallbacks({
        onDragStart: (jointId: number) => {
          if (translationGizmo) {
            translationGizmo.setActiveJoint(jointId);
          }
          if (rotationGizmo) {
            rotationGizmo.setActiveJoint(jointId);
          }
        },
        onDragEnd: (jointId: number) => {
          // Keep gizmo active after drag ends
          // User can click elsewhere to deactivate
        },
      });

      // Create IK handle renderer
      ikHandleRenderer = new IKHandleRenderer(canvas, camera, ikController, ikInputHandler);
      ikHandleRenderer.setJointStyles(enabledJoints);

      // Add handle canvas to DOM
      ikHandleCanvas = ikHandleRenderer.getCanvas();
      app.appendChild(ikHandleCanvas);

      console.log('IK system initialized');
    }
  }

  let keymap = loadKeymap();
  let cameraInputDetach: (() => void) | null = null;
  if (camera) cameraInputDetach = attachCameraInput(canvas, keymap, camera, ikInputHandler || undefined, translationGizmo || undefined, rotationGizmo || undefined);

  const panel = createControlsPanel({
    onPatternChange: async (i) => {
      patternIndex = i;
      await rebuildSimulation();
    },
    onMaterialChange: (i) => {
      materialIndex = i;
      currentParams = getParamsForPreset(SAMPLE_MATERIALS[i].presetKey);
    },
    onAvatarChange: (i) => {
      avatarIndex = i;
      if (render && bodyMeshes) {
        updateBodyMesh(render, bodyMeshes[i]);

        // Reinitialize IK controller with new avatar's mesh
        if (ikController && ikInputHandler && ikHandleRenderer && bodyMeshesUnscaled && camera) {
          const poseData = getPoseData(avatarIndex === 0 ? 'male' : 'female');
          if (poseData) {
            const wasEnabled = ikEnabled;
            ikEnabled = false;

            if (gpu) {
              ikController = new IKController(poseData, bodyMeshes[i], gpu.device, bodyMeshesUnscaled[i]);
            }
            const enabledJoints = getIKJointIndices();
            ikController.setEnabledJoints(enabledJoints);

            ikInputHandler = new IKInputHandler(ikController, camera, canvas);

            // Recreate translation gizmo
            if (translationGizmo) {
              translationGizmo.dispose();
            }
            translationGizmo = new TranslationGizmo(canvas, camera, ikController);
            if (translationGizmoCanvas) {
              translationGizmoCanvas.remove();
            }
            translationGizmoCanvas = translationGizmo.getCanvas();
            app.appendChild(translationGizmoCanvas);

            // Recreate rotation gizmo
            if (rotationGizmo) {
              rotationGizmo.dispose();
            }
            rotationGizmo = new RotationGizmo(canvas, camera, ikController);
            if (rotationGizmoCanvas) {
              rotationGizmoCanvas.remove();
            }
            rotationGizmoCanvas = rotationGizmo.getCanvas();
            app.appendChild(rotationGizmoCanvas);

            // Set up gizmo callbacks
            ikInputHandler.setCallbacks({
              onDragStart: (jointId: number) => {
                if (translationGizmo) {
                  translationGizmo.setActiveJoint(jointId);
                }
                if (rotationGizmo) {
                  rotationGizmo.setActiveJoint(jointId);
                }
              },
              onDragEnd: () => {},
            });

            // Recreate IK handle renderer
            if (ikHandleCanvas) {
              ikHandleCanvas.remove();
            }
            ikHandleRenderer = new IKHandleRenderer(canvas, camera, ikController, ikInputHandler);
            ikHandleRenderer.setJointStyles(enabledJoints);
            ikHandleCanvas = ikHandleRenderer.getCanvas();
            app.appendChild(ikHandleCanvas);

            // Reattach camera input with new IK handler
            if (cameraInputDetach) {
              cameraInputDetach();
            }
            cameraInputDetach = attachCameraInput(canvas, keymap, camera, ikInputHandler, translationGizmo, rotationGizmo);

            ikEnabled = wasEnabled;
            ikController.setEnabled(ikEnabled);

            console.log('IK controller reinitialized for new avatar');
          }
        }
      }
    },
    onSMPLBetasChange: (betas: SMPLBetas) => {
      smplBetas = betas;
      const maleData = getShapeData('male');
      const femaleData = getShapeData('female');

      if (maleData && femaleData) {
        // Use real SMPL blend shapes with unscaled versions for IK
        const maleResult = applySMPLBlendShapesWithUnscaled(maleData, betasToArray(smplBetas));
        const femaleResult = applySMPLBlendShapesWithUnscaled(femaleData, betasToArray(smplBetas));

        bodyMeshes = [maleResult.scaled, femaleResult.scaled];
        bodyMeshesUnscaled = [maleResult.unscaled, femaleResult.unscaled];

        if (render) updateBodyMesh(render, bodyMeshes[avatarIndex]);

        // Reinitialize IK controller with new mesh shape
        if (ikController && ikInputHandler && ikHandleRenderer && camera) {
          const poseData = getPoseData(avatarIndex === 0 ? 'male' : 'female');
          if (poseData) {
            const wasEnabled = ikEnabled;
            ikEnabled = false;

            if (gpu) {
              ikController = new IKController(poseData, bodyMeshes[avatarIndex], gpu.device, bodyMeshesUnscaled[avatarIndex]);
            }
            const enabledJoints = getIKJointIndices();
            ikController.setEnabledJoints(enabledJoints);

            ikInputHandler = new IKInputHandler(ikController, camera, canvas);

            // Recreate translation gizmo
            if (translationGizmo) {
              translationGizmo.dispose();
            }
            translationGizmo = new TranslationGizmo(canvas, camera, ikController);
            if (translationGizmoCanvas) {
              translationGizmoCanvas.remove();
            }
            translationGizmoCanvas = translationGizmo.getCanvas();
            app.appendChild(translationGizmoCanvas);

            // Recreate rotation gizmo
            if (rotationGizmo) {
              rotationGizmo.dispose();
            }
            rotationGizmo = new RotationGizmo(canvas, camera, ikController);
            if (rotationGizmoCanvas) {
              rotationGizmoCanvas.remove();
            }
            rotationGizmoCanvas = rotationGizmo.getCanvas();
            app.appendChild(rotationGizmoCanvas);

            // Set up gizmo callbacks
            ikInputHandler.setCallbacks({
              onDragStart: (jointId: number) => {
                if (translationGizmo) {
                  translationGizmo.setActiveJoint(jointId);
                }
                if (rotationGizmo) {
                  rotationGizmo.setActiveJoint(jointId);
                }
              },
              onDragEnd: () => {},
            });

            // Recreate IK handle renderer
            if (ikHandleCanvas) {
              ikHandleCanvas.remove();
            }
            ikHandleRenderer = new IKHandleRenderer(canvas, camera, ikController, ikInputHandler);
            ikHandleRenderer.setJointStyles(enabledJoints);
            ikHandleCanvas = ikHandleRenderer.getCanvas();
            app.appendChild(ikHandleCanvas);

            // Reattach camera input with new IK handler
            if (cameraInputDetach) {
              cameraInputDetach();
            }
            cameraInputDetach = attachCameraInput(canvas, keymap, camera, ikInputHandler, translationGizmo, rotationGizmo);

            ikEnabled = wasEnabled;
            ikController.setEnabled(ikEnabled);

            console.log('IK controller reinitialized with new body shape');
          }
        }
      }
    },
    onMotionChange: (i) => {
      motionIndex = i;
      motionTime = 0;
    },
    onIterationsChange: (n) => {
      currentParams.iterations = Math.max(2, Math.min(10, n));
    },
    onToggleIK: (enabled: boolean) => {
      ikEnabled = enabled;
      if (ikController) {
        ikController.setEnabled(enabled);
        console.log(`IK ${enabled ? 'enabled' : 'disabled'}`);
        console.log(`  ikController: ${!!ikController}, ikInputHandler: ${!!ikInputHandler}, ikHandleRenderer: ${!!ikHandleRenderer}, translationGizmo: ${!!translationGizmo}`);
      } else {
        console.warn('IK controller not initialized yet. SMPL pose data may still be loading.');
      }
    },
    onResetIK: () => {
      if (ikController) {
        ikController.reset();
        console.log('IK pose reset');
      }
    },
    onCollisionParamsChange: (friction, restitution, thickness) => {
      if (gpu) {
        updateCollisionParams(gpu.device, friction, restitution, thickness);
        console.log('[Collision] Updated params:', { friction, restitution, thickness });
      }
    },
    onPlayPause: () => {
      running = !running;
    },
    onLoopChange: (loop) => {
      motionLoop = loop;
    },
    onReset: () => {
      if (sim && currentClothData) {
        resetSimulation(sim, currentClothData.mesh.positions);
      }
    },
    onResetKeymap: () => {
      saveKeymap(getDefaultKeymap());
      keymap = loadKeymap();
      cameraInputDetach?.();
      if (camera) cameraInputDetach = attachCameraInput(canvas, keymap, camera, ikInputHandler || undefined, translationGizmo || undefined, rotationGizmo || undefined);
    },
    onCubemapChange: async (cubemapName: string) => {
      if (render) {
        await updateCubemap(render, cubemapName);
      }
    },
    onPBRParamsChange: (roughness, metallic, ambientStrength, reflectionStrength) => {
      pbrRoughness = roughness;
      pbrMetallic = metallic;
      pbrAmbientStrength = ambientStrength;
      pbrReflectionStrength = reflectionStrength;
    },
    getKeymap: () => keymap,
    ...(typeof (window as unknown as { electron?: { saveScreenshot?: (b: string) => Promise<string | null> } }).electron !== 'undefined' && {
      onExport: async () => {
        const el = (window as unknown as { electron?: { saveScreenshot: (b: string) => Promise<string | null> } }).electron;
        if (!el?.saveScreenshot || !canvas) return;
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
          await el.saveScreenshot(base64);
        } catch (e) {
          console.error('Export screenshot failed', e);
        }
      },
      onSaveProject: async () => {
        const el = (window as unknown as { electron?: { showSaveDialog: (o: object) => Promise<string | null>; saveProject: (p: string, j: string) => Promise<boolean> } }).electron;
        if (!el?.showSaveDialog || !el?.saveProject) return;
        const path = await el.showSaveDialog({ defaultPath: 'project.json' });
        if (!path) return;
        const state = { patternIndex, materialIndex, motionIndex, motionLoop };
        await el.saveProject(path, JSON.stringify(state));
      },
      onOpenProject: async () => {
        const el = (window as unknown as { electron?: { openFile: () => Promise<string | null>; loadProject: (p: string) => Promise<string> } }).electron;
        if (!el?.openFile || !el?.loadProject) return;
        const path = await el.openFile();
        if (!path) return;
        try {
          const json = await el.loadProject(path);
          const state = JSON.parse(json) as { patternIndex?: number; materialIndex?: number; motionIndex?: number; motionLoop?: boolean };
          if (typeof state.patternIndex === 'number') patternIndex = Math.max(0, Math.min(state.patternIndex, SAMPLE_PATTERNS.length - 1));
          if (typeof state.materialIndex === 'number') materialIndex = Math.max(0, Math.min(state.materialIndex, SAMPLE_MATERIALS.length - 1));
          if (typeof state.motionIndex === 'number') motionIndex = state.motionIndex;
          if (typeof state.motionLoop === 'boolean') motionLoop = state.motionLoop;
          currentParams = getParamsForPreset(SAMPLE_MATERIALS[materialIndex].presetKey);
          await rebuildSimulation();
          const patternSelect = document.getElementById('pattern-select') as HTMLSelectElement | null;
          const materialSelect = document.getElementById('material-select') as HTMLSelectElement | null;
          const motionSelect = document.getElementById('motion-select') as HTMLSelectElement | null;
          if (patternSelect) patternSelect.value = String(patternIndex);
          if (materialSelect) materialSelect.value = String(materialIndex);
          if (motionSelect) motionSelect.value = String(motionIndex);
        } catch (e) {
          console.error('Load project failed', e);
        }
      },
    }),
  });
  app.appendChild(panel);

  // Add toggle button for panel
  const toggleButton = (panel as HTMLElement & { toggleButton: HTMLElement }).toggleButton;
  if (toggleButton) {
    app.appendChild(toggleButton);
  }

  gimbalCanvas = createGimbalElement();
  app.appendChild(gimbalCanvas);

  targetIndicatorCanvas = createTargetIndicatorElement(canvas);

  const setStats = (panel as HTMLElement & { setStats: (fps: number, particles: number) => void }).setStats;
  if (setStats) {
    (window as unknown as { setStatsFn: (f: number, p: number) => void }).setStatsFn = setStats;
  }

  onResize();
}

function loop(t: number): void {
  requestAnimationFrame(loop);
  if (!gpu || !sim || !render || !camera) return;
  if (canvas.width === 0 || canvas.height === 0) {
    onResize();
    return;
  }

  const elapsed = (t - lastTime) / 1000 || 0;
  lastTime = t;
  accum += elapsed;
  while (accum >= DT && running && pageVisible) {
    stepSimulation(sim, currentParams);
    accum -= DT;
    motionTime += DT;
    if (motionLoop && motionTime >= MOTION_DURATION) motionTime = 0;
  }

  fpsFrameCount++;
  if (t - fpsLastTime >= 500) {
    fpsValue = (fpsFrameCount * 1000) / (t - fpsLastTime);
    fpsFrameCount = 0;
    fpsLastTime = t;
  }
  const setStatsFn = (window as unknown as { setStatsFn?: (fps: number, p: number) => void }).setStatsFn;
  if (setStatsFn) setStatsFn(fpsValue, sim.numVertices);

  updateCamera(camera);
  // Update IK system if enabled and actively dragging
  // Check ikController, ikInputHandler, and gizmos
  const ikControllerDragging = ikController ? ikController.isDragging() : false;
  const ikInputHandlerDragging = ikInputHandler ? ikInputHandler.isDragging() : false;
  const translationGizmoDragging = translationGizmo ? translationGizmo.isDragging() : false;
  const rotationGizmoDragging = rotationGizmo ? rotationGizmo.isDragging() : false;

  if (ikEnabled && ikController && (ikControllerDragging || ikInputHandlerDragging || translationGizmoDragging || rotationGizmoDragging)) {
    console.log('[MAIN] Render loop - IK dragging detected - ikController:', ikControllerDragging, 'ikInputHandler:', ikInputHandlerDragging);

    try {
      console.log('[MAIN] Using GPU skinning');
      // GPU skinning: compute and copy in single command encoder for proper synchronization
      const commandEncoder = render.device.createCommandEncoder({
        label: 'IK Skinning Encoder',
      });

      ikController.computeAndCopyGPUSkinning(
        commandEncoder,
        render.bodyVertexBuffer,
        render.bodyNormalBuffer
      );

      render.device.queue.submit([commandEncoder.finish()]);
      console.log('[MAIN] GPU skinning completed');
    } catch (error) {
      console.error('[Main] IK skinning error:', error);
      // Disable IK on error to prevent further issues
      ikEnabled = false;
      if (ikController) ikController.setEnabled(false);
    }
  }

  const posBuffer = getClothVertexBuffer(sim);
  const posSize = sim.numVertices * 3 * 4;
  const pivot = camera.orbitPivot ?? camera.target;
  const sinT = Math.sin(camera.theta);
  const cosT = Math.cos(camera.theta);
  const sinP = Math.sin(camera.phi);
  const cosP = Math.cos(camera.phi);
  const cameraEye: [number, number, number] = [
    pivot[0] + camera.distance * cosP * sinT,
    pivot[1] + camera.distance * sinP,
    pivot[2] + camera.distance * cosP * cosT,
  ];
  drawMainPass(render, camera.viewProj, posBuffer, posSize, cameraEye, {
    roughness: pbrRoughness,
    metallic: pbrMetallic,
    ambientStrength: pbrAmbientStrength,
    reflectionStrength: pbrReflectionStrength,
  });

  // Always render IK handles (will clear canvas if disabled)
  if (ikHandleRenderer) {
    ikHandleRenderer.render();
  }

  // Render translation gizmo
  if (translationGizmo) {
    translationGizmo.render();
  }

  // Render rotation gizmo
  if (rotationGizmo) {
    rotationGizmo.render();
  }

  if (gimbalCanvas) updateGimbal(gimbalCanvas, camera);
  if (targetIndicatorCanvas) updateTargetIndicator(targetIndicatorCanvas, canvas, camera);
}

document.addEventListener('visibilitychange', () => {
  pageVisible = document.visibilityState === 'visible';
});
window.addEventListener('resize', onResize);
init().then(() => requestAnimationFrame(loop)).catch((err) => {
  console.error('Init failed:', err);
  const msg = document.createElement('p');
  msg.style.cssText = 'color:#f44;padding:2rem;font-family:monospace;white-space:pre-wrap';
  msg.textContent = `Init failed:\n${err?.message ?? err}\n\n${err?.stack ?? ''}`;
  app.appendChild(msg);
});
