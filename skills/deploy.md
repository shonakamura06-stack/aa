---
name: deploy
description: One-command deployment with pre-flight checks.
---

# Deploy Skill

Deploy with pre-flight checks.

## Steps
1. Run tests
2. Check for uncommitted changes
3. Build
4. Deploy (Vercel/AWS/Docker/etc. per project)
5. Verify deployment succeeded (health check)
6. Report status + URL

## Rules
- Abort on test failure unless overridden
- Confirm before destructive deploy

## Usage
`/deploy`
---
name: deploy
description: One-command deployment with pre-flight checks.
