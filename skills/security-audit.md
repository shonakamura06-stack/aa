---
name: security-audit
description: Deep security review of codebase: injection vectors, auth bypass, secrets, dependency vulnerabilities.
---

# Security Audit Skill

Perform a thorough security audit of the codebase or specified files.

## Checks
- SQL/NoSQL/Command injection
- XSS (reflected, stored, DOM)
- Authentication and authorization bypass
- Hardcoded secrets, API keys, tokens
- Insecure deserialization
- Path traversal
- CSRF protection
- Dependency vulnerabilities (npm/pip/etc.)
- Insecure crypto usage
- Logging of sensitive data

## Output
- Findings table: Severity | File | Line | Issue | Remediation
- Risk summary and prioritized fix list
- Recommendations for hardening

## Usage
`/security-audit` or "audit this code for security"
---
name: security-audit
description: Deep security review of codebase.
