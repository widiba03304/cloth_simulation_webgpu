# Frontend Guide

UI patterns, i18n convention, and event system for agents working in `src/renderer/ui/`.

---

## UI architecture

All UI panels are vanilla TypeScript + DOM. No framework (no React, no Vue).

```
ui/
├── controls.ts      — 3D viewport panel (right sidebar)
├── dashboard.ts     — Project/pattern/material/avatar manager (main screen)
├── patternEditor.ts — Vector pattern editor (full-screen overlay)
├── materialEditor.ts — Material parameter editor + 2D drape preview
└── clothPreview.ts  — Re-export shim → sim/preview (do not import sim directly elsewhere)
```

---

## i18n convention

**Rule: never hardcode user-visible strings in TypeScript.**

```typescript
// ✅ Correct
import { t } from '../i18n';
el.textContent = t('controls.resetCloth');

// ❌ Wrong
el.textContent = 'Reset Cloth';
el.textContent = '클로스 초기화';
```

### Adding a new string

1. Add key to `src/renderer/locales/en.json`
2. Add Korean translation to `src/renderer/locales/ko.json`
3. Use `t('your.key')` in TypeScript

### Key naming convention
```
<panel>.<element>[.<state>]

controls.resetCloth
controls.quality.low
dashboard.newProject
patternEditor.tool.pen
materialEditor.material.cotton
```

See [docs/i18n.md](i18n.md) for full reference.

---

## Callback injection pattern

UI panels receive sim/render capabilities via callback injection at init time.
**Never import GPU types directly in UI code.**

```typescript
// ✅ Correct — UI receives callbacks
export function initControls(callbacks: {
  onQualityChange: (q: Quality) => void;
  onExportOBJ: () => Promise<string>;
  onCameraPreset: (preset: CameraPreset) => void;
}) { ... }

// ❌ Wrong — UI imports sim directly
import { cloth3d } from '../sim/cloth3d/cloth3d';
```

---

## Event flow

```
User gesture (mouse/keyboard)
  → input/ handler (keymap, cameraInput, ikInput)
  → callback injected at init
  → sim/render/ik mutation
  → next requestAnimationFrame renders result
```

No shared mutable state between UI and sim. All communication via callbacks.

---

## Adding a new control

1. Add HTML element in `src/renderer/index.html` with `id` attribute
2. Add i18n key for the label
3. Wire in `controls.ts` (or relevant panel) — get element by id, add event listener, call callback
4. Add callback to the init function signature
5. Wire callback in `main.ts`
6. Add test in `tests/controls.test.ts`

---

## Dashboard data model

Dashboard manages four asset types: **projects**, **patterns**, **materials**, **avatars**.

Each asset type has a JSON representation under `src/renderer/assets/samples/`.
Dashboard loads these at startup and renders cards. Selecting an asset updates `currentScene`.

```
assets/samples/
├── patterns/   ← JSON per pattern (rows, cols, cylindrical, twoPanel, ...)
├── cubemaps/   ← PNG cubemap faces
└── avatars/    ← (future) avatar asset metadata
```

---

## Pattern editor tools

| Key | Tool | Description |
|---|---|---|
| G | Grid | Adjust rows/cols/radius sliders |
| P | Pen | Add bezier nodes to outline |
| M | Move | Drag nodes and control handles |
| D | Dart | Place dart shapes |
| Esc | — | Remove last pen node |
| Ctrl+S | — | Save pattern |

Layers: Front / Back / Sleeve — each has independent outline + darts.
