# Required Output Format for VM2 Audit Skills

**IMPORTANT**: End your audit response with this standardized format.

## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | {skill-name} |
| Target | [path audited] |
| Files Scanned | [number] |
| Findings | [e.g., "2 Critical, 1 High"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding {skill-name}-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Column/Constraint**: [name]
- **Description**: [brief]
- **Exploitability**: [High/Medium/Low]
- **Fix**: [one-line suggestion]

### Machine-Readable JSON

```
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-file-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "column": "column_name",
      "description": "Brief description",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

## Finding ID Format
`{skill-name}-[filename]-[line]-[SUBTYPE]` (e.g., `vm2-audit-missing-boolean-alu-123-SEL`)

## Status Values
- `COMPLETED_NO_FINDINGS` - No issues found
- `COMPLETED_WITH_FINDINGS` - Issues found
- `ERROR` - Could not complete
