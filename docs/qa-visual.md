# Visual QA Loop

Agents use this workflow to verify rendering correctness by inspecting live screenshots of the running app.

## How to Capture a Screenshot

```bash
npm run screenshot          # build + run + capture (5s delay) → exit
npm run screenshot:quick    # skip build, 3s delay (use when source unchanged)
```

Output: `.omc/screenshots/latest.png` (also timestamped copy alongside it)

The Electron app launches, renders the cloth simulation for the configured delay, captures the composited window via `webContents.capturePage()`, saves the PNG, and exits automatically.

## How to Read the Screenshot (Agent)

```
Read('/Users/mjkim/cloth_simulation_webgpu/.omc/screenshots/latest.png')
```

Claude's `Read` tool supports PNG images — it will render the image inline for visual analysis.

## Visual QA Loop Protocol

```
repeat:
  1. Make code changes
  2. npm run screenshot         ← waits ~20s (build ~15s + 5s app runtime)
  3. Read('.omc/screenshots/latest.png')
  4. Diagnose any issues (see checklist below)
  5. Fix source files
until: screenshot looks correct
```

## Diagnosis Checklist

| Symptom | Likely cause | Where to look |
|---------|-------------|---------------|
| Entirely black canvas | WebGPU device request failed or canvas not attached | `src/renderer/main.ts`, `src/renderer/render/pipeline.ts` |
| Grey screen / no content | Shader compile error (silent fail) | Check `console.error` in renderer, `src/renderer/render/cloth3d.{vert,frag}.wgsl` |
| Body mesh missing | SMPL body mesh not loaded | `src/renderer/render/bodyMesh.ts` |
| Cloth invisible | Cloth3D not initialized or render skipped | `src/renderer/sim/cloth3d/cloth3d.ts`, `src/renderer/render/pipeline.ts` |
| Cloth clips through body | Capsule collider radii/positions wrong | `src/renderer/sim/cloth3d/cloth3d.ts` BODY_CAPSULES |
| Skybox missing / wrong | Cubemap not loaded | `src/renderer/render/cubemap.ts` |
| UI panel missing | Dashboard/controls not mounted | `src/renderer/ui/controls.ts`, `src/renderer/ui/dashboard.ts` |
| Wrong cloth color | Material PBR params or colorway | `src/renderer/main.ts` `getClothMaterialParams` |
| Cloth fallen to ground | Pin constraints not set | Cloth3DConfig `pinRows` or `gravity` param |

## Delay Tuning

Default delay is **5000ms**. Increase if the app is still loading at capture time (blank canvas despite no errors):

```bash
electron . --screenshot-mode --delay=8000
```

Or update the default in `electron/main/index.ts`:
```typescript
return a ? parseInt(a.split('=')[1]) : 5000;  // ← change this default
```

## Notes

- The window must be visible on screen during capture (WebGPU needs an active GPU surface on macOS/Metal)
- `capturePage()` captures the composited frame including the WebGPU canvas
- Screenshots are gitignored (`.omc/screenshots/`) — they are ephemeral QA artifacts
- Each run also saves a timestamped copy (`screenshot-{ms}.png`) for diffing across iterations

## Known Environment Issue: ELECTRON_RUN_AS_NODE

Claude Code sets `ELECTRON_RUN_AS_NODE=1` in its shell environment. This makes Electron run as a plain Node.js process (no Chromium, no app context), causing `require('electron')` to return the binary path string instead of the Electron API.

**Symptom**: `TypeError: Cannot read properties of undefined (reading 'whenReady')`

**Fix**: All electron-launching npm scripts (`dev`, `preview`, `screenshot`, `screenshot:quick`) use `env -u ELECTRON_RUN_AS_NODE` to remove the variable before spawning Electron. Do not remove this prefix.

**Also affects `npm run dev` and `npm run preview`** — both have the fix applied in package.json.
