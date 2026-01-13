---
name: vm2-audit-error-aggregation
description: Audit VM2/AVM PIL files for missing error aggregation constraints. Critical soundness issue where aggregate error flags only have boolean constraints but no constraint tying them to individual errors, allowing provers to claim no error when individual errors exist and bypass error handling logic.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Error Aggregation Audit

Audits for missing error aggregation - aggregate error flag has only a boolean constraint but no tie to individual errors. Allows prover to claim no error when individual errors exist.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Error Flags

```bash
# Find aggregate error flags
grep -rn "pol commit sel_err\|pol commit.*_error" pil/vm2/ --include="*.pil"

# Find individual error flags
grep -rn "err_\|out_of_range\|overflow\|invalid" pil/vm2/ --include="*.pil"
```

### Step 2: Verify Aggregation Constraints

For each aggregate error, verify it's tied to individual errors:

```bash
# Look for aggregation constraints
grep -rn "sel_err.*=" pil/vm2/ --include="*.pil"

# Check for commented-out aggregation (CRITICAL!)
grep -rn "//.*sel_err.*=\|FIXME.*err" pil/vm2/ --include="*.pil"
```

Expected patterns:
```pil
// Sum (mutually exclusive errors)
sel_err = err_a + err_b + err_c;

// OR (non-exclusive errors)
sel_err = err_a + err_b - err_a * err_b;

// Implication
err_a * (1 - sel_err) = 0;
```

### Step 3: Verify Correctness

- **If using sum**: Errors must be mutually exclusive
- **If using OR**: Both directions constrained (individual→aggregate AND no-individual→no-aggregate)

## Patterns

### Vulnerable: Only Boolean
```pil
pol commit sel_err;
sel_err * (1 - sel_err) = 0;  // No tie to individual errors!
```

### Secure: Proper Aggregation
```pil
sel_err = sel_tag_err + sel_div_0_err - sel_tag_err * sel_div_0_err;
```

## Examples

### Example 1: Instruction Fetching
```pil
// BEFORE: Only boolean, aggregation commented out
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: sel_parsing_err = pc_out_of_range + opcode_out_of_range;

// AFTER: Proper aggregation
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```
**Impact**: Complete bypass of instruction validation.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-error-aggregation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-error-aggregation-filename-123-issue-type` (MUST use full skill name: `vm2-audit-error-aggregation`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-error-aggregation.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-error-aggregation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-error-aggregation-filename-123-issue-type",
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
  "skill": "vm2-audit-error-aggregation",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.