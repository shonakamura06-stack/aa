---
name: code-review
description: Review code changes for bugs, security issues, and style violations. Use when reviewing PRs or staged changes.
---

# Code Review Skill

Review all staged/changed code. For each file, check for:

1. Logic errors and edge cases
2. Security vulnerabilities (injection, XSS, auth bypass, secrets in code)
3. Performance issues (N+1 queries, unbounded loops, memory leaks)
4. Style and convention violations (naming, formatting, structure)
5. Missing error handling and validation
6. Test coverage gaps

## Output format
- List issues by severity: Critical / High / Medium / Low
- For each issue: file, line, description, suggested fix
- End with a summary and approval recommendation

## Usage
`/code-review` or "review my changes"
---
name: code-review
description: Review code changes for bugs, security issues, and style violations.
