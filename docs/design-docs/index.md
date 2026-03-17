# Design Decisions — Index

Catalogue of significant design decisions in this codebase.
Each entry links to the doc or inline rationale explaining the decision.

| ID | Decision | Status | Doc |
|---|---|---|---|
| DD-001 | WebGPU-only renderer (no WebGL fallback) | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| DD-002 | XPBD with graph-coloring (12 color groups) for parallel constraint solving | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
| DD-003 | Flat f32 arrays (stride 3) for pos/normals as dual STORAGE\|VERTEX buffers | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
| DD-004 | SMPL body mesh SDF (r32float 3D texture) for collision — replaces capsule approximation | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
| DD-005 | Cylindrical initial cloth placement (full 360° wrap) vs half-cylinder (open panel) | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
| DD-006 | twoPanel system: front+back joined by KIND_SEAM=4 constraints | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
| DD-007 | Electron IPC for file I/O (no direct Node.js in renderer) | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| DD-008 | i18n via flat JSON key files (en.json, ko.json), no external i18n library | Active | [docs/i18n.md](../i18n.md) |
| DD-009 | No WASM — cloth mesh and constraints built in TypeScript | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| DD-010 | Short AGENTS.md as TOC + docs/ as system of record (Harness pattern) | Active | [core-beliefs.md](core-beliefs.md) |
| DD-011 | UV mapping: `localVid = vid % panelSize` per panel → each panel gets UV ∈ [0,1]² | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §WGSL |
| DD-012 | gridInfoBuffer (16B uniform: cols/rows/0/0) bound at vert shader group(0) binding(2) | Active | [ARCHITECTURE.md](../../ARCHITECTURE.md) §sim |
