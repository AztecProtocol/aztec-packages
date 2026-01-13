---
name: vm2-audit-commented-constraints
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

## Workflow

### Step 1: Scan for FIXME/TODO Comments
```bash
grep -rn "FIXME\|TODO\|HACK\|TEMPORARY\|DISABLED\|XXX" barretenberg/cpp/pil/vm2/ --include="*.pil"
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
// instr_fetching.pil
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

sel_parsing_err * (1 - sel_parsing_err) = 0;  // Only this exists!
```

**Impact**: CRITICAL - Prover can set `sel_parsing_err = 0` even when individual errors are 1.

## Output Format

Produce TWO outputs:

### 1. Markdown Report

#### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-commented-constraints` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Each Finding
- **ID**: `vm2-audit-commented-constraints-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File

Write `vm2-audit-commented-constraints.json` to the specified output directory:

```json
{
  "skill": "vm2-audit-commented-constraints",
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

For no findings: `{"skill": "vm2-audit-commented-constraints", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
