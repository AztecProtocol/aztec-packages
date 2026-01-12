---
name: vm2-audit-commented-constraints
description: Audit VM2/AVM PIL files for commented-out security constraints. Critical soundness issue where security-critical constraints are disabled via FIXME, TODO, or comments, often indicating incomplete implementations that create severe vulnerabilities while still compiling and passing tests.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Commented-Out Constraints Audit

Audits for commented-out security constraints (FIXME, TODO, or commented out). Often the **most dangerous** vulnerability type - constraint was identified as necessary but intentionally disabled. Code compiles/passes tests with no obvious failure signal.

## Instructions

### Step 1: Scan for FIXME/TODO Comments

```bash
grep -rn "FIXME\|TODO\|HACK\|TEMPORARY\|DISABLED\|XXX" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Scan for Commented-Out Constraints

```bash
# Commented-out constraint lines
grep -rn "^[[:space:]]*//.*=" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "pol\|include\|Example"

# Commented blocks
grep -rn "^[[:space:]]*/\*" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Assess Each Finding

For each commented-out constraint:
1. Is this security-critical? (error aggregation, boolean, implication, zero-check)
2. What happens without it? Can prover bypass validation?
3. Is there a valid reason it's disabled? Tracking issue?

### Step 4: Check for Boolean-Only Error Flags

Common pattern: error flags with boolean constraint but missing aggregation:

```bash
grep -rn "sel_err\|sel_.*_err\|parsing_err" barretenberg/cpp/pil/vm2/ --include="*.pil"
grep -rn "sel_err.*=\|sel_err - " barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Suspicious:
```pil
sel_error * (1 - sel_error) = 0;  // Boolean only!
// Missing: sel_error = err_a + err_b + err_c;
```

## Examples

```pil
// instr_fetching.pil
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

sel_parsing_err * (1 - sel_parsing_err) = 0;  // Only this exists!
```

**Impact**: CRITICAL - Prover can set `sel_parsing_err = 0` even when individual errors are 1.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `{skill-name}.json` file to the output directory with:

```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
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
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.