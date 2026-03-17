# Quality Score

Per-domain test coverage grades and known gaps.
Updated by doc-gardening agent. Last updated: 2026-03.

---

## Grading scale

| Grade | Meaning |
|---|---|
| A | >80% coverage, no known critical gaps |
| B | 60-80% coverage or 1-2 known gaps |
| C | 40-60% coverage or significant gaps |
| D | <40% coverage or major untested areas |

---

## Domain scores

### `sim/cloth3d/` — 3D cloth physics
**Grade: C**
- `cloth3d.ts` core logic: partially tested via `tests/cloth3d.test.ts`, `tests/cloth3d.builders.test.ts`
- WGSL compute shaders: not unit-testable without GPU. Covered by browser tests (`gpuSkinning.browser.test.ts`) but these are excluded from CI.
- `clothPreview.sim.test.ts`: covers 2D preview only
- **Gaps:** GPU compute passes (integrate, constraint, collide, normal) have no automated verification in CI

### `sim/preview/` — 2D cloth preview
**Grade: B**
- `tests/clothPreview.sim.test.ts` covers builder and constraint logic
- Physics parameters validated via material editor tests
- **Gaps:** Self-collision WGSL shader untested

### `render/` — Render pipelines
**Grade: B**
- `tests/pipeline.test.ts`, `tests/bodyMesh.test.ts`, `tests/cubemap.test.ts` cover main paths
- `tests/ibl.test.ts`, `tests/ibl-complete.test.ts` cover IBL PBR shading
- **Gaps:** Cloth render shaders (`cloth3d.vert/frag.wgsl`) not validated by automated tests

### `ik/` — IK / pose
**Grade: A**
- `tests/fabrikSolver.test.ts`, `tests/fabrikAdvanced.test.ts`: extensive FABRIK tests
- `tests/ikController.test.ts`, `tests/ikHandles.test.ts`, `tests/ikInput.test.ts`: interaction tests
- `tests/gpuSkinning.test.ts`: GPU skinning logic (with mocks)
- `tests/smpl*.test.ts`: SMPL blend shapes and pose data
- **Gaps:** End-to-end IK→capsule→cloth collision path

### `ui/` — DOM panels
**Grade: B**
- `tests/dashboard.test.ts`, `tests/controls.test.ts`, `tests/materialEditor.test.ts`
- `tests/patternEditor.ui.test.ts`, `tests/patternEditor.utils.test.ts`
- **Gaps:** Integration tests for full UI→sim→render cycle

### `webgpu/` — GPU primitives
**Grade: B**
- `tests/device.test.ts`, `tests/buffers.test.ts`
- Uses mock GPU device from `tests/mocks/`
- **Gaps:** Mock fidelity vs real WebGPU API (no validation layer)

### `input/` — User input
**Grade: A**
- `tests/cameraInput.test.ts`, `tests/keymap.test.ts`, `tests/raycast.test.ts`
- `tests/rotationGizmo.test.ts`, `tests/translationGizmo.test.ts`, `tests/targetIndicator.test.ts`

### `data/` — Config constants
**Grade: A**
- Pure functions (`getClothConfig`, `getClothMaterialParams`, `rgbToHex`) with no side effects
- Covered transitively by `tests/cloth3d.test.ts` and `tests/materialEditor.test.ts`
- **Gaps:** No dedicated unit tests for `getClothConfig` edge cases (size scale, armhole mask)

### `managers/` — Lifecycle
**Grade: B**
- `clothManager.buildCloth` covered indirectly by cloth3d integration tests
- `ikManager.initIK/reinitIK/cleanupIK` covered indirectly by `tests/ikController.test.ts`
- **Gaps:** No isolated tests for lifecycle error paths (e.g. buildCloth with null bodyMesh)

### `scene/` — Scene data
**Grade: A**
- `tests/resolve.test.ts` covers `resolveSceneForEditor`
- Scene type is pure data; no complex logic

---

## Coverage targets

| Domain | Current est. | Target |
|---|---|---|
| sim/cloth3d | ~35% | 60% (blocked on CI GPU runner) |
| sim/preview | ~65% | 75% |
| render | ~55% | 70% |
| ik | ~85% | 85% ✓ |
| ui | ~60% | 70% |
| webgpu | ~70% | 70% ✓ |
| input | ~80% | 80% ✓ |
| scene | ~90% | 85% ✓ |
| data | ~70% | 80% |
| managers | ~40% | 60% |
