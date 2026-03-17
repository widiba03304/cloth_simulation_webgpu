# Core Beliefs — Agent-First Operating Principles

> These beliefs guide every design and implementation decision.
> When in doubt, apply the belief that keeps the system most legible to future agent runs.

---

## 1. Agents execute; humans steer

No manually-written code. Engineers specify intent, design environments, and build feedback loops.
Implementation is always delegated to an agent. When something fails, the fix is never "try harder" —
it is "what environment capability is missing, and how do we make it legible and enforceable?"

## 2. Repository knowledge is the only source of truth

If a decision is not captured in a versioned file in this repository, it does not exist for the agent.
Slack threads, Google Docs, and tacit knowledge are invisible. Every alignment, every architecture decision,
every "why we didn't use library X" must be encoded as markdown in `docs/`.

## 3. Give agents a map, not a manual

Short `AGENTS.md` as table of contents. Deep docs in `docs/`. Progressive disclosure:
start small, point to deeper sources. A 1000-line instruction file crowds out the task itself.

## 4. Parse at the boundary

Validate all external data (JSON pattern configs, user file uploads, IPC messages from Electron main)
at the point of ingress. Once data is inside the system, trust it. Never probe shapes YOLO-style inside
business logic. Use TypeScript types as the contract; validate once at the boundary.

## 5. Enforce invariants, not implementations

Encode architectural rules mechanically (lint, CI, structural tests). Let agents choose how to express
solutions within those rules. Strict boundaries; local autonomy. The lint error message IS the
remediation instruction for the agent.

## 6. Feedback loops over human review

CI runs on every commit. Lint, typecheck, and tests are the primary feedback signal. Human review is
optional, not a gate. When the agent can verify its own work via CI, it can operate autonomously.

## 7. Boring technology compounds

Prefer dependencies the agent can fully reason about in-repo: stable APIs, small surface area, strong
TypeScript types. Avoid opaque library behaviour. When a helper is simple enough, implement it inline
with 100% test coverage rather than pulling in a generic package.

## 8. Garbage collection is continuous

Technical debt is a high-interest loan. Encode "golden principles" (AGENTS.md §Golden Principles) and
enforce them via lint. Run doc-gardening checks regularly. Catch bad patterns daily, not in quarterly
refactors.

## 9. Agent legibility is the design goal

Code style, naming, file structure, and abstractions are optimised first for agent legibility, not
human aesthetic preference. If the output is correct, maintainable, and legible to future agent runs,
it meets the bar.

## 10. Plans are first-class artifacts

Execution plans live in `docs/exec-plans/`. Active plans track progress and decision logs.
Completed plans become a permanent record. Technical debt is versioned alongside code.
