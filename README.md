# WebGPU Cloth Simulation for Fashion Designers

Electron desktop app for cloth simulation (draping, fit validation, material behavior) using WebGPU. Targets designers with sample garments, materials, and motions; no WebGL fallback.

## Setup

- Node.js 18+
- (Optional) Emscripten for C++ WASM: `npm run build:wasm` builds the native cloth builder; the app works without it via a TypeScript fallback.

```bash
npm install
```

## Run

- **Development**: `npm run dev` — opens Electron with hot reload.
- **Preview (packed)**: `npm run build` then `npm run preview`.

## Build

- **Renderer + main + preload**: `npm run build` (output in `out/`).
- **WASM (optional)**: `npm run build:wasm` — requires Emscripten; copies `cloth_sim_native.js` and `cloth_sim_native.wasm` to `public/`.
- **Desktop installers**: `npm run dist` — runs build then electron-builder (Windows NSIS, macOS DMG, Linux AppImage). Output in `release/`. On macOS, code signing can be disabled for local builds via `build.mac.forceCodeSigning: false` in package.json.

## Test

- **Unit tests**: `npm run test` (Vitest).
- **Watch mode**: `npm run test:watch`.
- Tests live in `tests/`: `params.test.ts` (params/presets), `cloth.test.ts` (grid cloth building). Add a new test file in `tests/` when adding features.

## Lint

- **Lint**: `npm run lint` (ESLint).

## SMPL mannequin (optional)

Large SMPL assets (pose JSON, shapedirs JSON, `.pkl` models) are not in the repo; generate them locally if needed. To use an SMPL body model as the mannequin, export a neutral-pose OBJ into `src/renderer/assets/samples/avatars/mannequin.obj`. From `smpl/smpl_webuser/hello_world/` run:

```bash
python export_neutral_mannequin.py
```

(See that folder’s README and `src/renderer/assets/samples/avatars/README.md`.) Without this file, the app uses a simple built-in mannequin.

## Documentation

- **Architecture**: `docs/architecture.md` — modules, data flow, buffer layout, where to change what.
- **i18n**: `docs/i18n.md` — locale files, key convention, adding a language.
- **Native/WASM**: `native/README.md` — C++ build and buffer layout.

## Preload API (Electron)

The renderer receives a minimal API via `window.electron` (contextIsolation, no nodeIntegration):

| Method | Description |
|--------|-------------|
| `openFile()` | Returns `Promise<string \| null>` — path from open file dialog. |
| `saveFile(defaultPath, data)` | Shows save dialog, writes file; returns path or null. |
| `showSaveDialog(options)` | Returns `Promise<string \| null>` — chosen path. |
| `saveScreenshot(base64Data)` | Shows save dialog for PNG; decodes base64 and writes. |
| `saveProject(path, json)` | Writes JSON to path. |
| `loadProject(path)` | Returns file contents as string. |
| `getAppPath()` | Returns app userData path. |

No other Node or Electron APIs are exposed to the renderer.

## Browser support

WebGPU is required. Supported in Chrome/Edge 113+, Safari 18+ (and current Electron). The app shows a clear message if WebGPU is not available.
