# Tech Debt Tracker

Known technical debt items. Review and prioritise during doc-gardening.
Format: `[TD-NNN] Title | Area | Severity (low/med/high) | Notes`

---

## Open Items

| ID | Title | Area | Severity | Notes |
|---|---|---|---|---|
| TD-001 | WebGPU browser tests not in CI | CI/Testing | High | `*.browser.test.ts` require headed Chromium with `--enable-unsafe-webgpu`. CI skips them. Need a GPU-enabled runner or a headless WebGPU mock strategy. |
| TD-002 | `any` types in test mocks | Testing | Med | `tests/mocks/` uses `as any` casts for GPU stub objects. Should type-narrow to specific WebGPU interface subsets. |
| TD-003 | `console.log` calls scattered in source | Code quality | Med | Lint now warns on `no-console`. ~20 existing violations need cleanup. Agents should remove or convert to no-op during next pass. |
| TD-004 | `main.ts` not covered by unit tests | Testing | Low | Pure logic extracted to `data/` and `managers/` (2026-03 architecture cleanup). Remaining code is thin orchestration + render loop — still untested but lower risk. |
| TD-005 | Archive dir contains old simulation files | Code quality | Low | `archive/` holds deleted `simulation/` files. Not imported anywhere. Safe to delete after confirming no references. |
| TD-006 | `test_electron.js` / `test_electron2.js` at repo root | Code quality | Low | Ad-hoc test scripts not integrated into vitest. Either convert to proper tests or delete. |
| TD-007 | SMPL model not in repo (gitignored) | Distribution | Med | Large binary assets (SMPL `.npz`, cubemap PNGs >1MB) excluded. App requires manual asset placement. Document setup steps for new dev environments. |
| TD-008 | No structured logging — raw `console.*` only | Observability | Med | No log levels, no structured fields. Makes agent-driven debugging harder. Consider a thin logger wrapper (`logger.ts`) emitting structured JSON. |
| TD-009 | `docs/` mixes Korean and English | Documentation | Low | `roadmap.md` is Korean; `architecture.md` is English. Agents should consistently use English for all technical docs (i18n files remain bilingual). |
| TD-010 | ESLint `no-explicit-any` is warn, not error | Code quality | Low | Currently `'warn'`. Tightening to `'error'` would catch more type-safety issues but requires fixing existing violations first. |

---

## Resolved Items

| ID | Title | Resolved | Notes |
|---|---|---|---|
| TD-R001 | Monolithic AGENTS.md / no docs structure | 2026-03 | Replaced with short AGENTS.md TOC + structured docs/ (Harness migration) |
| TD-R002 | No CI/CD pipeline | 2026-03 | Added `.github/workflows/ci.yml` (lint + typecheck + test) |
| TD-R003 | `main.ts` monolith (~1073 lines, 51 module globals) | 2026-03 | Extracted `data/patterns.ts`, `data/materials.ts`, `managers/clothManager.ts`, `managers/ikManager.ts`; wired `app/context.ts`; main.ts reduced to ~862 lines |
