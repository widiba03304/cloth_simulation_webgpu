# Plan: Harness Engineering Migration

**Goal:** Apply OpenAI Harness Engineering principles to make this repository maximally legible and operable by AI agents.
**Scope:** Docs, CI, ESLint config, root AGENTS.md and ARCHITECTURE.md.
**Status:** Complete (2026-03)

---

## Stories

- [x] US-001: Root AGENTS.md — short table of contents (~100 lines), not a manual
- [x] US-002: ARCHITECTURE.md — domain/layer map with dependency rules and WGSL conventions
- [x] US-003: docs/ restructure — Harness layout (design-docs, exec-plans, product-specs, references, QUALITY_SCORE, FRONTEND, PLANS)
- [x] US-004: CI/CD feedback loop — `.github/workflows/ci.yml` (lint + typecheck + test on every push/PR)
- [x] US-005: Golden principles — `no-console` lint rule, file-size guide, remediation messages in lint config
- [x] US-006: Exec-plans system — tech-debt-tracker, this completed plan, PLANS.md index

---

## Decision log

### 2026-03: Why short AGENTS.md instead of monolithic

The Harness article identified three failure modes of a single large AGENTS.md:
1. Context crowding — instruction file displaces task + code from the context window
2. Non-guidance — when everything is "important", agents pattern-match locally
3. Rot — monolith becomes a graveyard of stale rules; agents can't tell what's still true

**Decision:** AGENTS.md is exactly 100 lines: module map + golden principles + pointers.
All depth lives in `docs/` and is fetched by agents on demand (progressive disclosure).

### 2026-03: Why docs/ as system of record

The Harness article: "from the agent's point of view, anything it can't access in-context while running
effectively doesn't exist." Previous state: design decisions lived in MEMORY.md (session-scoped, not in repo).

**Decision:** All design decisions, quality scores, frontend patterns, and tech debt are versioned in `docs/`.
MEMORY.md remains as a session-speed lookup cache; `docs/` is the authoritative record.

### 2026-03: Why CI with typecheck separate from build

`electron-vite build` emits output files and is slow (~30s). `tsc --noEmit` catches type errors in ~5s
without any output. CI runs `tsc --noEmit` (fast) not `npm run build` (slow + large artifacts).

### 2026-03: Why no-console lint rule

Harness article: "structured logging" as a golden principle. `console.log` is non-structured,
non-queryable, and noisy for agents debugging via log tools. Rule is `warn` (not `error`) initially
to allow gradual cleanup of existing violations without blocking CI.

### 2026-03: WebGPU tests excluded from CI

GPU compute tests (`*.browser.test.ts`) require a headed Chromium instance with `--enable-unsafe-webgpu`.
GitHub Actions runners have no GPU. Documented in `.github/workflows/ci.yml` comments.
Long-term: investigate virtual frame buffer (Xvfb) + SwiftShader WebGPU emulation.

---

## Progress notes

- All docs files created in a single agent pass (ralph loop, 2026-03-11)
- No existing source files modified — only additive changes (new docs, new CI, updated eslint)
- Lint verified passing after no-console rule addition
- Tech debt tracker seeded with 10 open items from pre-migration audit
