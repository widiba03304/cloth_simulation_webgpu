# Plans Index

Lightweight index of execution plans. Plans are first-class artifacts: versioned, co-located with code.

---

## Active plans

*(none — all roadmap phases complete as of 2026-02)*

See [exec-plans/active/](exec-plans/active/) for any in-flight work.

---

## Completed plans

| Plan | Description | Completed |
|---|---|---|
| [harness-migration](exec-plans/completed/harness-migration.md) | Apply Harness Engineering principles (AGENTS.md TOC, docs/ system of record, CI/CD, golden principles) | 2026-03 |
| architecture-cleanup | Extract data constants → `data/`, IK + cloth lifecycle → `managers/`, wire `app/context.ts`. main.ts 1073 → 862 lines. | 2026-03 |

---

## How to create a new plan

1. Copy this template to `docs/exec-plans/active/your-plan-name.md`:

```markdown
# Plan: <title>

**Goal:** One sentence.
**Scope:** Which files/domains will change.
**Status:** In progress | Blocked | Complete

## Stories
- [ ] US-XXX: ...

## Decision log
- YYYY-MM-DD: Why we chose X over Y

## Progress notes
- ...
```

2. Add an entry to this index.
3. When complete, move to `docs/exec-plans/completed/` and update status.
