---
name: vm2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Dead Columns Audit

Audits for dead columns - columns declared (`pol commit`) but never meaningfully used. Can indicate incomplete constraints, missing lookups, or forgotten security checks.

**Used**: appears in constraints, lookups/permutations, intermediate polys, or as lookup destination.
**Dead**: only declared, only assigned in tracegen, or only in comments.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find Columns and Check Usage

```bash
# List all declared columns
grep -n "pol commit" pil/vm2/<component>.pil

# For each column, check usage (should have >1 occurrence)
grep -c "column_name" pil/vm2/<component>.pil

# Check cross-file usage
grep -rn "component\\.column_name" pil/vm2/ --include="*.pil"
```

A column is potentially dead if it only appears in its declaration.

### Step 2: Verify Valid Usage Types

Before flagging, check if column has valid indirect usage:

| Usage Type | How to Check | Status |
|------------|--------------|--------|
| Lookup destination | `grep -rn "in component\\." pil/vm2/` | Valid |
| Used in intermediate | `pol DERIVED = column * ...` | Valid |
| Conditional constraint | `sel_X * (column - ...) = 0` | Valid |
| Tracegen only | Only in `.cpp`, not constrained | **Dead** |
| Commented constraint | Constraint is `// commented` | **Dead** |

### Step 3: Categorize Findings

For each dead column:
- **Incomplete constraint**: Security check missing → High severity
- **Refactoring leftover**: Can be removed → Low severity
- **Placeholder**: Has TODO comment → Informational

## Patterns

### Vulnerable: Set But Not Constrained
```pil
pol commit computed_hash;
// Tracegen sets it, but no constraint verifies correctness!
```

### Valid: Lookup Destination
```pil
pol commit precomputed_value;
// No local constraints - other traces look this up
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-dead-columns` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-dead-columns-filename-123-issue-type` (MUST use full skill name: `vm2-audit-dead-columns`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-dead-columns.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-dead-columns",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-dead-columns-filename-123-issue-type",
      "severity": "critical",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "high",
      "fix": "Suggested fix"
    }
  ]
}
```

For no findings:
```json
{
  "skill": "vm2-audit-dead-columns",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.