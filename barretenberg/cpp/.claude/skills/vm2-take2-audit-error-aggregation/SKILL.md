---
name: vm2-take2-audit-error-aggregation
description: Audit VM2/AVM PIL files for missing error aggregation constraints. Critical soundness issue where aggregate error flags only have boolean constraints but no constraint tying them to individual errors, allowing provers to claim no error when individual errors exist and bypass error handling logic.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Error Aggregation Audit

## Purpose
Detect aggregate error flags with only boolean constraints but no tie to individual errors - allows prover to claim no error when errors exist.

## Severity
- **Soundness** (malicious prover): Critical/High
- **Completeness** (honest prover fails on valid input): Critical if reachable via canonical simulation

## Workflow

### 1. Find Error Flags
```bash
# Aggregate errors
grep -rn "pol commit sel_err\|pol commit.*_error" pil/vm2/ --include="*.pil"

# Individual errors
grep -rn "err_\|out_of_range\|overflow\|invalid" pil/vm2/ --include="*.pil"
```

### 2. Verify Aggregation Constraints
```bash
# Aggregation patterns
grep -rn "sel_err.*=" pil/vm2/ --include="*.pil"

# CRITICAL: Check for commented-out aggregation
grep -rn "//.*sel_err.*=\|FIXME.*err" pil/vm2/ --include="*.pil"
```

### 3. Check Constraint Patterns

**Vulnerable** - only boolean, no tie to individual errors:
```pil
pol commit sel_err;
sel_err * (1 - sel_err) = 0;  // MISSING: no aggregation!
```

**Secure** - proper aggregation:
```pil
// Sum (requires mutual exclusivity)
sel_err = err_a + err_b + err_c;

// OR (non-exclusive)
sel_err = err_a + err_b - err_a * err_b;

// Implication (each error implies aggregate)
err_a * (1 - sel_err) = 0;
```

### 4. Verify Correctness
- Sum aggregation: errors MUST be mutually exclusive
- OR aggregation: both directions constrained (individual->aggregate AND no-individual->no-aggregate)

## Example Bug

```pil
// VULNERABLE: Aggregation commented out
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: sel_parsing_err = pc_out_of_range + opcode_out_of_range;
```
**Impact**: Complete bypass of instruction validation - prover sets sel_parsing_err=0 while individual errors=1.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-error-aggregation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings
- **ID**: `vm2-take2-audit-error-aggregation-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-take2-audit-error-aggregation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-take2-audit-error-aggregation-filename-123-issue",
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
