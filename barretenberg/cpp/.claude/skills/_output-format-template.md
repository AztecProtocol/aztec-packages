
---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | {SKILL_NAME} |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding {PREFIX}-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "{SKILL_NAME}",
  "finding_prefix": "{PREFIX}",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "{PREFIX}-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `{SKILL_NAME}-[filename]-[line]-[subtype]`
- Example: `{SKILL_NAME}-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
