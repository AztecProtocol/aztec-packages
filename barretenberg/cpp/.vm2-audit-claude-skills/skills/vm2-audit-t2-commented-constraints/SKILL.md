---
name: vm2-audit-t2-commented-constraints
description: Audit VM2/AVM PIL files for commented-out security constraints. Critical soundness issue where security-critical constraints are disabled via FIXME, TODO, or comments, often indicating incomplete implementations that create severe vulnerabilities while still compiling and passing tests.
version: 1.0.0
---

# VM2 Commented-Out Constraints Audit

## Purpose
Detect disabled security constraints (FIXME, TODO, commented code) - often the **most dangerous** vulnerability type since code compiles and passes tests with no failure signal.

## Severity Assessment

**Assess case-by-case** based on impact and reachability:
- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every commented-out constraint, TODO, or FIXME is a PRELIMINARY FINDING. Report ALL, filter last.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Replaced by equivalent constraint**: A non-commented constraint enforces the same property (quote both the commented and replacement constraints with file:line).
  - (b) **Explicitly marked as intentional**: A comment explains why it's disabled AND references a tracking issue or design decision (quote the comment).

**RULE 3 — Quote or report.** For ANY dismissal, quote the exact evidence. If you cannot, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Workflow

### Step 0: Enumerate ALL PIL Files (MANDATORY)

> **CRITICAL**: First build a complete inventory of all PIL files to ensure full coverage.

```bash
# List all PIL files and their sizes
find pil/vm2/ -name "*.pil" | xargs wc -l | sort -n

# Count total files
find pil/vm2/ -name "*.pil" | wc -l
```

You MUST scan every PIL file. Build a checklist and mark each as scanned.

### Step 1: Scan for FIXME/TODO Comments
```bash
grep -rn "FIXME\|TODO\|HACK\|TEMPORARY\|DISABLED\|XXX" pil/vm2/ --include="*.pil"
```

### Step 2: Scan for Commented-Out Constraints
```bash
# Commented constraint lines
grep -rn "^[[:space:]]*//.*=" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "pol\|include\|Example"

# Commented blocks
grep -rn "^[[:space:]]*/\*" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Assess Each Finding
1. Is this security-critical? (error aggregation, boolean, implication, zero-check)
2. What happens without it? Can prover bypass validation?
3. Is there a valid reason it's disabled? Tracking issue?

### Step 4: Check for Boolean-Only Error Flags
Common pattern - error flags with boolean constraint but missing aggregation:
```bash
grep -rn "sel_err\|sel_.*_err\|parsing_err" barretenberg/cpp/pil/vm2/ --include="*.pil"
grep -rn "sel_err.*=\|sel_err - " barretenberg/cpp/pil/vm2/ --include="*.pil"
```

**Suspicious pattern**:
```pil
sel_error * (1 - sel_error) = 0;  // Boolean only!
// Missing: sel_error = err_a + err_b + err_c;
```

## Example Finding

```pil
// component.pil
// FIXME: constrain this again once all operations are supported.
// sel_aggregate_err = err_flag_a + err_flag_b + err_flag_c;

sel_aggregate_err * (1 - sel_aggregate_err) = 0;  // Only this exists!
```

**Impact**: CRITICAL - Prover can set `sel_aggregate_err = 0` even when individual error flags are 1.

## Output Format

Produce TWO outputs:

### 1. Markdown Report

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-commented-constraints` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Each Finding
- **ID**: `vm2-audit-t2-commented-constraints-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File

Write `vm2-audit-t2-commented-constraints.json` to the specified output directory:

```json
{
  "skill": "vm2-audit-t2-commented-constraints",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-commented-constraints-filename-123-issue-type",
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

For no findings: `{"skill": "vm2-audit-t2-commented-constraints", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
