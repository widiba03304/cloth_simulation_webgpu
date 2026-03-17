# References

Framework and library reference files optimised for agent consumption.
Place `<library>-llms.txt` files here — compressed API references that fit in agent context.

## Current references

*(Add reference files as needed. Example: `webgpu-llms.txt`, `electron-vite-llms.txt`)*

## How to add a reference

1. Find or generate a compressed API reference for the library (e.g. from `llms.txt` endpoints)
2. Place it here as `<library>-llms.txt`
3. Add an entry to this README

## Why this exists

External library documentation is not in the repository, so agents cannot access it during a run.
Inlining a compressed reference (API signatures, key patterns, common pitfalls) lets agents work
with SDKs accurately without guessing or hallucinating API shapes.

See docs/design-docs/core-beliefs.md §2 (Repository knowledge is the only source of truth).
