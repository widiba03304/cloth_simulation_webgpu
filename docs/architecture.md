# Architecture

This document describes the main modules, data flow, and where to change what.

## Overview

- **Input**: Sample patterns (JSON), material presets, avatar/motions (future). TypeScript or WASM builds cloth mesh and constraints.
- **Simulation**: WebGPU compute pipeline updates particle positions (integrate → structural/shear/bend constraints → collision). Ping-pong storage buffers.
- **Rendering**: Cloth mesh is drawn from the current position buffer; orbit camera and simple lighting.
- **UI**: Panel with pickers and buttons; all strings via i18n. UI talks to the app via callbacks only.

## Data flow

```
Pattern (JSON) → buildClothFromSamplePattern() → ClothData (positions, indices, constraints)
       → createSimulation(device, cloth, params, pinned) → SimulationContext
       → stepSimulation() each frame → getClothVertexBuffer() → drawCloth(viewProj, positions)
```

- **simulation/**: Cloth topology (cloth.ts), params and presets (params.ts), compute pipeline (compute.ts). WGSL: integrate.wgsl, constraints.wgsl, constraints_bend.wgsl. Does not import from render/ or collision/.
- **collision/**: Ground plane collision (body.ts, collide.wgsl). Called at end of each stepSimulation().
- **render/**: Pipeline (pipeline.ts), vertex/fragment shaders, camera (camera.ts). Consumes sim output; no sim logic.
- **webgpu/**: device.ts (adapter/device, canvas, resize, device-lost), buffers.ts (createBuffer, createStorageBuffer, createUniformBuffer).
- **ui/**: controls.ts builds the panel and uses t(key) for all text; communicates via UICallbacks.
- **wasm/**: loadSimModule.ts loads the C++ WASM module; buildGridCloth() builds grid cloth when WASM is available.

## Buffer layout (simulation)

- **Positions**: `float32 x, y, z` per vertex (no padding). Two buffers for ping-pong.
- **Previous positions**: Same layout; used for Verlet integration.
- **Pinned**: `uint32` per vertex (1 = pinned, 0 = free).
- **Structural/Shear constraints**: `float32 i, j, restLength` per constraint (3 floats).
- **Bend constraints**: `float32 i, j, k, l, restAngle` (5 floats per bend quad).

## Where to change what

- **New material preset**: Edit `src/renderer/simulation/params.ts` (MATERIAL_PRESETS) and add a corresponding entry in `src/renderer/assets/samples/materials/` and `samples/materials.ts`. UI picker reads from SAMPLE_MATERIALS.
- **New sample pattern**: Add JSON under `src/renderer/assets/samples/patterns/`, add to SAMPLE_PATTERNS in `samples/patterns.ts`, and add i18n key `patterns.<id>` in locales.
- **Solver iterations**: Exposed in UI (slider); updates `currentParams.iterations` in main.ts.
- **i18n**: Locale files in `src/renderer/locales/`; key convention and adding languages: see `docs/i18n.md`.

## C++ / WASM

- **native/**: constraint_builder.cpp produces grid positions, indices, and constraint arrays. Built with Emscripten (see `native/README.md`). Output copied to `public/` for the renderer to load.
- TS fallback: If WASM is not loaded, `buildGridClothTS()` in cloth.ts produces the same layout.
