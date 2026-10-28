---
name: refactor
description: Refactor a module with a specific goal (extract service, split component, migrate async).
---

# Refactor Skill

Refactor code toward a stated goal while preserving behavior.

## Inputs
- Target file/module
- Goal (e.g., "extract into service", "split component", "migrate callbacks to async/await")

## Steps
1. Read target and dependents
2. Plan refactor (files affected, steps, risks)
3. Execute in small, verifiable steps
4. Keep tests passing; update tests if signatures change
5. Summarize changes

## Rules
- Preserve public API unless goal says otherwise
- Add/update tests for changed behavior
- Avoid scope creep

## Usage
`/refactor <target> <goal>`
---
name: refactor
description: Refactor a module with a specific goal.
