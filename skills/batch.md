---
name: batch
description: Apply a prompt across multiple files matching a pattern.
---

# Batch Skill

Apply a prompt to multiple files.

## Usage
`/batch "Add error handling to all API routes" --glob "src/api/**/*.ts"`

## Behavior
- Resolve file list from pattern
- Apply prompt per file
- Report per-file results
- Summarize
---
name: batch
description: Apply a prompt across multiple files.
