---
name: vm2-audit-t2-dead-columns
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

> **PERFORMANCE RULE**: Do NOT run individual greps for each of ~1,730 columns. Use the automated batch script below. Per-column iteration will exhaust the context window.

### Phase 1: Automated Dead Column Detection (single bash command)

Run this script to find all potentially dead columns in one shot:

```bash
# For each PIL file, extract declared columns, then check if each appears >1 time in all PIL files
for pil_file in pil/vm2/*.pil pil/vm2/**/*.pil; do
  [ -f "$pil_file" ] || continue
  # Get namespace prefix for cross-file lookups (e.g., "alu" from "pil/vm2/alu.pil")
  ns=$(basename "$pil_file" .pil)
  # Extract column names from "pol commit col;" and "pol commit col[N];" declarations
  grep -oP 'pol commit \K[a-z_][a-z_0-9]*(?=[\[;,])' "$pil_file" | while read col; do
    # Count occurrences in same file (declaration + usage)
    local_count=$(grep -c "$col" "$pil_file" 2>/dev/null || echo 0)
    # Count cross-file references (namespace.col)
    cross_count=$(grep -rl "${ns}\.${col}" pil/vm2/ --include="*.pil" 2>/dev/null | wc -l)
    total=$((local_count + cross_count))
    if [ "$total" -le 1 ]; then
      echo "DEAD: $pil_file : $col (local=$local_count, cross=$cross_count)"
    fi
  done
done
```

This produces a focused list of dead column candidates — typically **10-30**, not hundreds.

### Phase 2: Verify Candidates

For each candidate from Phase 1, read the relevant PIL file and check:

| Usage Type | Check | Status |
|------------|-------|--------|
| Lookup destination | Other traces reference `component.col` | Valid (cross-file) |
| Used in intermediate | `pol DERIVED = column * ...` | Valid |
| Conditional constraint | `sel_X * (column - ...) = 0` | Valid |
| Array member | `col[i]` in loop — grep may miss | Valid (verify manually) |
| Tracegen only | Only in `.cpp`, not constrained | **Dead** |
| Commented constraint | Constraint is `// commented` | **Dead** |

**Note on array columns**: The bash script may miss array references like `col[0]`, `col[1]`. For any array columns (`pol commit col[N]`), manually verify they're used in loop constraints.

### Phase 3: Categorize by Severity

| Category | Severity | Description |
|----------|----------|-------------|
| Incomplete constraint | High | Security check missing |
| Refactoring leftover | Low | Can be removed |
| Placeholder | Info | Has TODO comment |

### Phase 4: Completeness Check

Verify the script covered all PIL files:
```bash
# Compare file count from script vs actual
find pil/vm2 -name "*.pil" | wc -l
```

Also check for columns declared with unusual syntax (multi-line declarations, macro-generated columns) that the regex might miss:
```bash
grep -rn "pol commit" pil/vm2/ --include="*.pil" | grep -v "pol commit [a-z_]"
```
Any results here are unconventional declarations — manually verify them.

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
| Skill | `vm2-audit-t2-dead-columns` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format
- **ID**: `vm2-audit-t2-dead-columns`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (write to output directory)

```json
{
  "skill": "vm2-audit-t2-dead-columns",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-t2-dead-columns-filename-123-issue-type",
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
