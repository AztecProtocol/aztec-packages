---
name: vm2-take2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
---

# VM2 Dead Columns Audit

## Purpose
Find columns declared (`pol commit`) but never meaningfully constrained - indicates incomplete constraints, missing lookups, or forgotten security checks.

## When to Use
- Auditing PIL files for constraint completeness
- Reviewing refactored PIL code
- Security audit of new PIL components

## Definitions
- **Used**: appears in constraints, lookups/permutations, intermediate polys, or as lookup destination
- **Dead**: only declared, only assigned in tracegen, or only in comments

## Workflow

### Step 1: Find Columns and Check Usage
```bash
# List all PIL files
find pil/vm2 -name "*.pil"

# List declared columns
grep -n "pol commit" pil/vm2/<component>.pil

# Check usage count (should have >1 occurrence)
grep -c "column_name" pil/vm2/<component>.pil

# Check cross-file usage
grep -rn "component\\.column_name" pil/vm2/ --include="*.pil"
```

Column is potentially dead if it only appears in its declaration.

### Step 2: Verify Valid Usage Types

| Usage Type | Check | Status |
|------------|-------|--------|
| Lookup destination | `grep -rn "in component\\." pil/vm2/` | Valid |
| Used in intermediate | `pol DERIVED = column * ...` | Valid |
| Conditional constraint | `sel_X * (column - ...) = 0` | Valid |
| Tracegen only | Only in `.cpp`, not constrained | **Dead** |
| Commented constraint | Constraint is `// commented` | **Dead** |

### Step 3: Categorize by Severity

| Category | Severity | Description |
|----------|----------|-------------|
| Incomplete constraint | High | Security check missing |
| Refactoring leftover | Low | Can be removed |
| Placeholder | Info | Has TODO comment |

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

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Output Format

### 1. Markdown Report

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-dead-columns` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-take2-audit-dead-columns-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (write to output directory)

```json
{
  "skill": "vm2-take2-audit-dead-columns",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-take2-audit-dead-columns-filename-123-issue-type",
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
