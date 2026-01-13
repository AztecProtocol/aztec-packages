---
name: vm2-audit-error-aggregation
description: Audit VM2/AVM PIL files for missing error aggregation constraints. Critical soundness issue where aggregate error flags only have boolean constraints but no constraint tying them to individual errors, allowing provers to claim no error when individual errors exist and bypass error handling logic.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.1
---

# VM2 Error Aggregation Audit

## Purpose
Detect missing error aggregation constraints where aggregate flags have only boolean constraints but no ties to individual errors, allowing malicious provers to claim no error when errors exist.

## When to Use
- Auditing VM2/AVM PIL files for error handling vulnerabilities
- Reviewing new error flags or error handling logic
- Systematic security audit of PIL constraints

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (theoretical) to Critical (blocks valid inputs)

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

### Step 1: Find Aggregate Error Flags
```bash
grep -rn "pol commit sel_err\|pol commit.*_error\|pol commit.*_failure" pil/vm2/ --include="*.pil"
grep -rn "sel_.*err\|sel_err" pil/vm2/ --include="*.pil"
```

### Step 2: Find Individual Error Flags
```bash
grep -rn "err_\|_err\|out_of_range\|overflow\|underflow\|invalid" pil/vm2/ --include="*.pil"
```

### Step 3: Verify Aggregation Constraints Exist
```bash
grep -rn "sel_err.*=\|sel_err -" pil/vm2/ --include="*.pil"
grep -rn "err.*\* (1 - sel_err)" pil/vm2/ --include="*.pil"
```

### Step 4: Check for Commented-Out Aggregation
```bash
grep -rn "//.*sel_err.*=\|//.*error.*=\|FIXME.*err\|TODO.*err" pil/vm2/ --include="*.pil"
```

### Step 5: Verify Mutual Exclusivity (If Using Sum)
If aggregation uses sum (`sel_err = err_a + err_b`), errors must be mutually exclusive. Otherwise sum can exceed 1.

### Step 6: Trace Error Propagation
Follow error flags through hierarchy: individual -> component-level -> execution-level.

## Vulnerable Patterns

### Only Boolean Constraint (CRITICAL)
```pil
// VULNERABLE: No tie between aggregate and individual errors
pol commit sel_err;
pol commit err_type_a;
pol commit err_type_b;
sel_err * (1 - sel_err) = 0;  // Boolean only - prover sets sel_err=0 despite errors!
```

### Commented-Out Aggregation (CRITICAL)
```pil
// VULNERABLE: Aggregation disabled
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: sel_parsing_err = pc_out_of_range + opcode_out_of_range;
```

## Secure Patterns

### Sum (Mutually Exclusive Errors)
```pil
// Valid only when at most one error can occur
sel_error = sel_bytecode_failure + sel_instruction_failure + sel_addressing_error;
```

### Boolean OR (Non-Exclusive Errors)
```pil
// When errors can co-occur
sel_err = sel_tag_err + sel_div_0_err - sel_tag_err * sel_div_0_err;

// Or implication pattern:
err_a * (1 - sel_err) = 0;  // err_a => sel_err
err_b * (1 - sel_err) = 0;  // err_b => sel_err
(1 - err_a) * (1 - err_b) * sel_err = 0;  // (~err_a & ~err_b) => ~sel_err
```

## Real Example: Instruction Fetching

```pil
// BEFORE: Only boolean, no aggregation - CRITICAL BUG
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

// AFTER: Proper aggregation
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```
**Impact**: Complete bypass of instruction validation.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-error-aggregation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-error-aggregation-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (REQUIRED)
Write `vm2-audit-error-aggregation.json` to output directory:
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
