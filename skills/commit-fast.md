---
name: commit-fast
description: Stage all changes, generate commit message, and commit in one shot.
---

# Commit Fast Skill

Speed workflow: stage everything, generate a concise commit message, commit.

## Steps
1. `git add -A`
2. Analyze staged diff
3. Generate commit message (imperative, concise, following repo conventions)
4. Commit
5. Report result (hash + message)

## Rules
- Never commit secrets or .env files (abort if detected)
- If multiple unrelated changes, suggest splitting but still allow fast commit on request

## Usage
`/commit-fast` or "commit everything quickly"
---
name: commit-fast
description: Stage all changes, generate commit message, commit.
