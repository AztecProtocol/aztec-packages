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

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every column that appears unused or unconstrained is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Column is used in an interaction tuple**: It appears in a lookup/permutation (quote the interaction with file:line).
  - (b) **Column is constrained transitively**: Another constraint references it (quote with file:line).
  - (c) **Column is precomputed**: It's a `pol constant`, not `pol commit` (quote the declaration).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Definitions
- **Used**: appears in constraints, lookups/permutations, intermediate polys, or as lookup destination
- **Dead**: only declared, only assigned in tracegen, or only in comments

## Workflow

> **SESSION SCOPE**: This session targets a **single PIL file**. The runner script specifies the target. Check columns declared in the target file; search other PIL files only to confirm cross-file references (lookup destinations, namespace references).

> **PERFORMANCE RULE**: Do NOT run individual greps for each column. Use the automated batch script below. Per-column iteration will exhaust the context window.

### Phase 1: Automated Dead Column Detection (target file)

Run this script for the target file:

```bash
TARGET=<target>.pil
ns=$(basename "$TARGET" .pil)
grep -oP 'pol commit \K[a-z_][a-z_0-9]*(?=[\[;,])' "$TARGET" | while read col; do
  local_count=$(grep -c "$col" "$TARGET" 2>/dev/null || echo 0)
  cross_count=$(grep -rl "${ns}\.${col}" pil/vm2/ --include="*.pil" 2>/dev/null | wc -l)
  total=$((local_count + cross_count))
  if [ "$total" -le 1 ]; then
    echo "DEAD: $TARGET : $col (local=$local_count, cross=$cross_count)"
  fi
done
```

This produces a focused list of dead column candidates — typically **5-15** for a single file.

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

Also check for columns declared with unusual syntax (multi-line declarations, macro-generated columns) that the regex might miss:
```bash
grep -n "pol commit" <target>.pil | grep -v "pol commit [a-z_]"
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
