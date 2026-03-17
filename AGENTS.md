# AGENTS.md — Cloth Simulation WebGPU

> **This is a table of contents, not a manual.**
> Start here. Follow the pointers. Do not guess.

---

## What this project is

An Electron desktop app for fashion designers: WebGPU-powered 3D cloth draping on a SMPL mannequin, vector pattern editor, material physics preview, IK pose control.

**Tech stack:** Electron 28 · electron-vite · TypeScript 5 · WebGPU (no fallback)

---

## Where to look first

| Task | Go to |
|---|---|
| Add / change a pattern | `src/renderer/assets/samples/patterns/` + `src/renderer/data/patterns.ts` (configs + `getClothConfig`) |
| Add / change a material | `src/renderer/data/materials.ts` (`SAMPLE_MATERIAL_CLOTH_PARAMS`) + `src/renderer/ui/materialEditor.ts` |
| Change cloth physics | `src/renderer/sim/cloth3d/*.wgsl` + `cloth3d.ts` |
| Change render shaders | `src/renderer/render/*.wgsl` + `render/pipeline.ts` |
| Add a UI string | `src/renderer/locales/en.json` + `ko.json` (never hardcode strings) |
| Fix IK / pose | `src/renderer/ik/` + `src/renderer/managers/ikManager.ts` (lifecycle) |
| Rebuild cloth from scratch | `src/renderer/managers/clothManager.ts` (`buildCloth`) |
| Add a test | `tests/` — mirror the module path, mock GPU via `tests/mocks/` |

---

## Domain map

```
src/renderer/
├── main.ts       # Thin orchestration only (~860 lines). No inline business logic.
├── app/          # App-level singletons (all activated, not dead code)
│   ├── context.ts  #   AppContext: gpu/render/cloth3d/camera mutable refs (imported as appCtx)
│   ├── state.ts    #   AppStore: pub/sub reactive state (simFrozen, avatarIndex, …)
│   └── commands.ts #   Named command dispatcher (register/dispatch)
├── data/         # Pure data + config helpers. No GPU. No DOM.
│   ├── patterns.ts #   SAMPLE_PATTERN_CLOTH_CONFIGS, SIZE_SCALE, getClothConfig()
│   └── materials.ts#   SAMPLE_MATERIAL_CLOTH_PARAMS, getClothMaterialParams(), rgbToHex()
├── managers/     # Lifecycle helpers that coordinate multiple subsystems.
│   ├── clothManager.ts  # buildCloth() — create/destroy Cloth3DInstance
│   └── ikManager.ts     # initIK / reinitIK / cleanupIK — IK system lifecycle
├── sim/          # Physics only. No render. No DOM.
│   ├── cloth3d/  #   3D PBD cloth (Verlet + XPBD + SMPL SDF collision)
│   └── preview/  #   2D cloth preview (Material Editor)
├── render/       # GPU pipelines, shaders, camera. No simulation logic.
├── ik/           # FABRIK solver, skeleton, GPU skinning. No render state.
├── ui/           # DOM panels only. Reads from sim/render via callbacks.
├── webgpu/       # device.ts, buffers.ts. Shared primitives only.
├── input/        # Keyboard, mouse, raycast. No business logic.
├── assets/       # Static data (patterns, cubemaps, avatars). No code.
└── scene/        # Scene type + resolve. No GPU code.
```

**Allowed dependency direction:**
`main → managers → sim · render · ik` | `managers → data` | `ui → sim · render · ik` | `sim → webgpu` | `render → webgpu` | `ik → webgpu`

Cross-domain imports (e.g. `sim` importing from `render`) are **forbidden**.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full rule set.

---

## Golden principles (enforced by CI)

1. **No manually-written code** — all implementation via agent; humans steer intent
2. **Parse at boundary** — validate external data (JSON patterns, user input) at load time; never guess shapes inside the system
3. **No console.log** — use structured comments or remove; `no-console` lint rule is active
4. **File size limit** — keep files under 600 lines; split if larger (lint warns at 500)
5. **i18n always** — every user-visible string goes through `t('key')`; no hardcoded English/Korean in `.ts` files
6. **Tests mirror source** — `tests/foo.test.ts` tests `src/renderer/foo.ts`; use `tests/mocks/` for GPU stubs

---

## Feedback loop (CI)

Every push runs `.github/workflows/ci.yml`:
1. `npm run lint` — ESLint, 0 warnings allowed
2. `npx tsc --noEmit` — TypeScript strict check
3. `npm test` — Vitest unit tests

WebGPU browser tests (`*.browser.test.ts`) run locally only: `npm run test:gpu`

---

## Deeper references

- [ARCHITECTURE.md](ARCHITECTURE.md) — overview, domain layers, data flow, dependency rules, WGSL conventions
- [docs/FRONTEND.md](docs/FRONTEND.md) — UI patterns, i18n, event system
- [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) — per-domain test coverage grades
- [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) — agent-first operating principles
- [docs/design-docs/index.md](docs/design-docs/index.md) — catalogue of design decisions
- [docs/exec-plans/active/](docs/exec-plans/active/) — in-flight work plans
- [docs/exec-plans/completed/](docs/exec-plans/completed/) — shipped plans + decision logs
- [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) — known debt
- [docs/product-specs/index.md](docs/product-specs/index.md) — feature specs
- [docs/roadmap.md](docs/roadmap.md) — phase roadmap (all phases complete as of 2026-02)
