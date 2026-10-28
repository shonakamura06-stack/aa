---
name: changelog
description: Generate structured changelog from git log since last tag.
---

# Changelog Skill

Generate a changelog from commits since last tag/release.

## Steps
1. Get git log since last tag
2. Group by type: Features, Fixes, Breaking Changes, Docs, Chore
3. Write concise entries with commit refs
4. Highlight breaking changes and migration notes

## Output
Markdown changelog ready to paste into CHANGELOG.md or release notes.

## Usage
`/changelog`
---
name: changelog
description: Generate structured changelog from git log.
