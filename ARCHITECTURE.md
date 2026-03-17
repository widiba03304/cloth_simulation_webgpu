# Architecture

> Canonical domain map, dependency rules, and data flow reference.
> `docs/architecture.md` redirects here — this is the single source of truth.
> If this conflicts with a source file, fix the source file.

---

## Overview

- **3D Editor**: WebGPU render pipeline (body mesh, ground, grid or cubemap background), orbit camera, SMPL blend shapes, IK (FABRIK + GPU skinning). Project/scene state (avatar, pattern, material references) saved via Electron.
- **2D Material Preview**: WebGPU compute pipeline in the Material Editor. Verlet + PBD constraints, floor collision, self collision, mouse drag. Used only for material draping preview; not used in the 3D viewport.
- **UI**: Dashboard (projects, patterns, materials, avatars), Pattern Editor, Material Editor, 3D viewport controls. All strings via i18n.
- **No WASM**: Cloth mesh and constraints are built in TypeScript. The native/ WASM build is not used.

---

## Data flow

**3D Editor**

```
main.ts (appCtx)
  → managers/clothManager.buildCloth()
      → data/patterns.getClothConfig()
      → data/materials.getClothMaterialParams()
      → sim/cloth3d.createCloth3D()     → Cloth3DInstance
  → managers/ikManager.initIK()         → IKController + gizmos
  → render/pipeline.createRenderPipeline() → body + ground + skybox/grid
  → loop(): cloth3d.step() → drawMainPass() → drawCloth3D()
```

**2D Cloth Preview (Material Editor only)**

```
clothPreview.ts: buildInitialState() / buildConstraints()
  → WebGPU buffers
  → integrate → constraints (graph-colored) → self collision → normals
  → vertex/fragment draw
```

---

## Domains

### `app/` — Application singletons

- `context.ts`: `AppContext` singleton (`ctx`) — mutable refs for the 4 core GPU resources: `gpu`, `render`, `cloth3d`, `camera`. Imported in `main.ts` as `appCtx`. Non-reactive by design (GPU handles are too frequent to diff).
- `state.ts`: `AppStore` pub/sub store — reactive state (`simFrozen`, `turntable`, `ikEnabled`, `avatarIndex`, `subSteps`, …). Use `store.subscribe()` for UI that needs to react to state changes.
- `commands.ts`: Named command dispatcher — `register(name, fn)` / `dispatch(name, payload)`. Decouples UI events from business logic.

**Rule:** `app/` modules have no GPU imports and no DOM access. They hold references, not logic.

---

### `data/` — Config constants and helpers

- `patterns.ts`: `SAMPLE_PATTERN_CLOTH_CONFIGS`, `SIZE_SCALE`, `ARMHOLE_MASK_STEPS`, `getClothConfig(patternId, size, grid?, layer?)` → `Cloth3DConfig`.
- `materials.ts`: `SAMPLE_MATERIAL_CLOTH_PARAMS`, `getClothMaterialParams(id, albedoOverride?)` → `Cloth3DMaterialParams`, `rgbToHex()`.

**Rule:** Pure data and pure functions only. No GPU, no DOM, no side effects.

---

### `managers/` — Subsystem lifecycle

- `clothManager.ts`: `buildCloth(device, old, opts)` — destroys the old instance, builds config + material, calls `createCloth3D`, sets quality. Single place to create a `Cloth3DInstance`.
- `ikManager.ts`: `initIK / reinitIK / cleanupIK` — creates/destroys `IKController`, `IKInputHandler`, `IKHandleRenderer`, `TranslationGizmo`, `RotationGizmo` and manages their canvases.

**Rule:** Managers coordinate `sim`, `render`, `ik` modules. No direct DOM manipulation beyond canvas append/remove.

---

### `sim/` — Physics engine

- **cloth3d/**: 3D XPBD cloth simulation. `cloth3d.ts` exposes `createCloth3D(config, material, bodyMesh?)` → `Cloth3DInstance`. Body collision via SMPL SDF (r32float 3D texture built from mesh in `cloth3d.sdf.ts`). Compute shaders in `*.wgsl`. All GPU work is self-contained.
- **preview/**: 2D cloth preview for the Material Editor. Standalone WebGPU pipeline, no dependency on cloth3d.

**Contracts:**
- `Cloth3DInstance`: `step()`, `reset()`, `destroy()`, `updateCameraPos()`, `updateMaterialParams()`, `setWind()`, `updateCapsulesFromJoints()`, `setQuality()`, `exportMeshOBJ()`, `setAlbedoTexture()`, `clearAlbedoTexture()`, `isDraping` (readonly), `drapingProgress` (readonly)
- No DOM access, no `window`, no `document`

### `render/` — GPU render pipelines

- `pipeline.ts`: main render pass (body, ground, grid, cloth3d). Owns `GPURenderPipeline` objects.
- `bodyMesh.ts`: SMPL mesh loader + draw.
- `camera.ts`: `OrbitCamera`, `applyCameraPreset()`, `updateCamera()`.
- `cubemap.ts`: environment map loading.
- `cloth3d.vert.wgsl` / `cloth3d.frag.wgsl`: cloth render shaders (IBL PBR, double-sided).
- `grid.vert.wgsl` / `grid.frag.wgsl`: ground grid shaders.

**Contracts:** render modules accept `GPUDevice` + data; return draw calls only. No simulation state.

### `ik/` — Inverse kinematics

- `ikController.ts`: FABRIK-based IK controller. Drives joint positions.
- `fabrikSolver.ts`: pure math solver (no GPU).
- `skeleton.ts`: joint hierarchy.
- `compute/gpuSkinning.ts` + `skinning.wgsl`: GPU vertex skinning.

### `ui/` — DOM panels

- `controls.ts`: 3D viewport panel (camera, simulation, export, turntable).
- `dashboard.ts`: project/pattern/material/avatar manager (Figma-style).
- `patternEditor.ts`: vector pattern editor (bezier, darts, seam allowance).
- `materialEditor.ts`: material parameter editor + 2D drape preview.
- `clothPreview.ts`: re-export shim for `sim/preview`.

**Rule:** UI modules call into `sim`/`render`/`ik` via injected callbacks only. Never import GPU types directly.

### `webgpu/` — Shared GPU primitives

- `device.ts`: adapter/device init, canvas resize.
- `buffers.ts`: buffer creation helpers.

**Rule:** No business logic. Pure GPU utility.

### `input/` — User input

- `keymap.ts`, `cameraInput.ts`, `ikInput.ts`, `raycast.ts`
- No simulation state, no render state. Emits events/callbacks only.

### `scene/` — Scene data

- `types.ts`: `Scene` = `{ avatarIndex, patternId, materialId, ... }`.
- `resolve.ts`: `resolveSceneForEditor()`.
- No GPU code, no DOM.

### `assets/` — Static data

- `samples/patterns/*.json`: pattern configs (rows, cols, cylindrical, etc.).
- `samples/cubemaps/`: environment map PNGs.
- `types.ts`: `AssetMeta`, `PatternAsset`, `MaterialAsset`, `AvatarAsset`.

---

## Dependency rules

```
ALLOWED:
  main      → app, data, managers, sim, render, ik, ui, input, scene, assets, webgpu
  managers  → sim, render, ik, data, webgpu
  app       → (type imports only — no GPU calls, no DOM)
  data      → sim (type imports only — Cloth3DConfig, MaskPatternLayer)
  ui        → sim, render, ik, scene, assets, webgpu
  sim       → webgpu
  render    → webgpu, assets
  ik        → webgpu
  input     → (nothing from src/renderer)
  scene     → assets
  assets    → (nothing)

FORBIDDEN (enforced by lint):
  sim       → render        (physics must not import shaders)
  sim       → ui            (physics must not touch DOM)
  render    → sim           (renderer reads buffers, not cloth state)
  render    → ik            (renderer reads skinned data, not solver)
  managers  → ui            (managers must not touch DOM panels)
  data      → webgpu        (data is pure — no GPU)
  webgpu    → anything above
  assets    → anything above
```

---

## Where to change what

| Task | File(s) |
|---|---|
| New sample pattern config | `data/patterns.ts` (`SAMPLE_PATTERN_CLOTH_CONFIGS`) + `assets/samples/patterns/*.json` |
| New material preset | `data/materials.ts` (`SAMPLE_MATERIAL_CLOTH_PARAMS`) |
| Cloth build logic (quality, init) | `managers/clothManager.ts` (`buildCloth`) |
| IK init (enabled joints, gizmos) | `managers/ikManager.ts` (`initIK`) |
| New avatar | `assets/samples/avatars/` — dashboard and main use avatar index |
| 3D rendering (lights, env) | `render/pipeline.ts` + related shaders |
| 2D preview params | `sim/preview/clothPreview.ts` + `clothPreview.simParams.wgsl` |
| UI string | `locales/en.json` + `locales/ko.json` — never hardcode strings |
| New control / callback | `ui/controls.ts` → wire in `main.ts` → add test in `tests/controls.test.ts` |

---

## 2D cloth preview (sim/preview/)

- **Grid:** 60×45 particles, SPACING=8, fixed canvas 600×600.
- **Buffers:** positions (ping-pong), pinned, constraints (graph-colored), self-collision spatial hash, SimParams + RenderParams uniforms.
- **WGSL files:** `integrate`, `constraint`, `normal`, `selfCollision`, `applyDrag`, `vert`/`frag`.
- **Constraint iterations and sub-steps** configurable in `clothPreview.ts`.

---

## WGSL conventions

- One `.wgsl` file per compute pass. Named `<domain>.<pass>.wgsl` (e.g. `cloth3d.integrate.wgsl`).
- Structs shared across passes go in a `<domain>.simParams.wgsl` include (no standalone execution).
- Binding groups: group(0) = per-frame uniforms, group(1) = simulation buffers, group(2) = textures.
- No magic numbers in WGSL — use struct fields or `override` constants.

---

## Frame loop (main.ts)

```
requestAnimationFrame:
  1. [if IK dragging]  IKController.computeAndCopyGPUSkinning() — GPU vertex skinning
  2. [if turntable]    camera.theta += 0.005
  3. [if IK enabled]   cloth3d.updateCapsulesFromJoints()       — sync pose to cloth collision
  4. [if not frozen]   cloth3d.step()                           — GPU compute physics
  5.                   drawMainPass()                           — clear + ground + body
  6.                   cloth3d.updateCameraPos() + drawCloth3D() — cloth over body
  7.                   handleRenderer.render() + translationGizmo.render() + rotationGizmo.render()
  8.                   updateGimbal() + updateTargetIndicator()
```

---

## File size limits

| Type | Soft limit | Hard limit |
|---|---|---|
| TypeScript source | 400 lines | 600 lines |
| WGSL shader | 200 lines | 350 lines |
| Test file | 300 lines | 500 lines |

Split files that exceed hard limits. Lint warns at soft limit.
