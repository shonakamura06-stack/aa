---
name: create-pr
description: Create a pull request with structured title, summary, and test plan.
---

# Create PR Skill

Create a pull request from current branch changes.

## Steps
1. Read full diff (git diff base...HEAD)
2. Analyze changes: features, fixes, refactors, breaking changes
3. Generate PR title (conventional commits style if repo uses it)
4. Write summary with bullet points
5. Add test plan checklist
6. Push branch and open PR via `gh pr create`

## PR Template
```
## Summary
- ...

## Changes
- ...

## Test Plan
- [ ] ...

## Notes
...
```

## Usage
`/create-pr` or "open a PR for my changes"
---
name: create-pr
description: Create a pull request with structured title, summary, test plan.
