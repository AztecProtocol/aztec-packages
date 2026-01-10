---
name: vm2-audit-error-aggregation
description: Audit VM2/AVM PIL files for missing error aggregation constraints. Critical soundness issue where aggregate error flags only have boolean constraints but no constraint tying them to individual errors, allowing provers to claim no error when individual errors exist and bypass error handling logic.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Error Aggregation Audit

Audits for missing error aggregation - aggregate error flag has only a boolean constraint but no tie to individual errors. Allows prover to claim no error when individual errors exist, continuing execution and corrupting state.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Aggregate Error Flags

```bash
# Find aggregate error flags
grep -rn "pol commit sel_err\|pol commit.*_error\|pol commit.*_failure\|pol commit.*err$" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find error-related selectors
grep -rn "sel_.*err\|sel_err" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Find Individual Error Flags

For each aggregate error, find the individual errors that should feed into it:

```bash
# Find individual error flags
grep -rn "err_\|_err\|out_of_range\|overflow\|underflow\|invalid" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Aggregation Constraint Exists

For each aggregate error, verify there's a constraint connecting it to individual errors:

```bash
# Look for aggregation constraints
grep -rn "sel_err.*=\|sel_err -" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for implication constraints (alternative pattern)
grep -rn "err.*\* (1 - sel_err)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected patterns:
```pil
// Direct aggregation
sel_err = err_a + err_b + err_c;

// Or implication pattern
err_a * (1 - sel_err) = 0;  // err_a => sel_err
```

### Step 4: Check for Commented-Out Aggregation

```bash
# Find commented-out error aggregation (CRITICAL!)
grep -rn "//.*sel_err.*=\|//.*error.*=\|FIXME.*err\|TODO.*err" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 5: Verify Mutual Exclusivity (If Using Sum)

If aggregation uses sum (`sel_err = err_a + err_b`), errors must be mutually exclusive:

```bash
# Check for mutual exclusivity constraints
grep -rn "err_.*\* err_\|err_a.*err_b" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

If errors can co-occur, sum aggregation is WRONG - use OR pattern instead.

### Step 6: Trace Error Propagation

Follow error flags through the hierarchy:
1. Individual error source
2. Component-level aggregate
3. Higher-level handling (e.g., execution error)

Verify each level properly aggregates from the level below.

## Aggregation Patterns

### Pattern 1: Mutually Exclusive Errors (Sum)

```pil
// Errors cannot occur simultaneously
// Safe to use sum since at most one is 1
sel_err = err_a + err_b + err_c;

// Prerequisites:
err_a * (1 - err_a) = 0;  // Boolean
err_b * (1 - err_b) = 0;  // Boolean
err_c * (1 - err_c) = 0;  // Boolean
// Plus mutual exclusivity (at most one can be 1)
```

### Pattern 2: Non-Exclusive Errors (OR)

```pil
// Errors can co-occur - use boolean OR formula
sel_err = 1 - (1 - err_a) * (1 - err_b);

// Or use implication pattern:
#[ERR_A_IMPLIES_SEL_ERR]
err_a * (1 - sel_err) = 0;  // err_a => sel_err

#[ERR_B_IMPLIES_SEL_ERR]
err_b * (1 - sel_err) = 0;  // err_b => sel_err

#[NO_ERR_IMPLIES_NO_SEL_ERR]
(1 - err_a) * (1 - err_b) * sel_err = 0;  // (~err_a & ~err_b) => ~sel_err
```

### Pattern 3: Hierarchical Aggregation

```pil
// Low-level errors aggregate to mid-level
sel_err_low = err_a + err_b;

// Mid-level aggregates to high-level
sel_err_high = sel_err_low + err_c;
```

## Patterns

### Vulnerable Pattern: Only Boolean Constraint

```pil
// VULNERABLE: Only boolean constraint on aggregate
pol commit sel_err;           // Aggregate error
pol commit err_type_a;        // Individual error A
pol commit err_type_b;        // Individual error B
sel_err * (1 - sel_err) = 0;  // Boolean constraint only!
```

### Vulnerable Pattern: Commented-Out Aggregation

```pil
// VULNERABLE: Aggregation commented out!
sel_parsing_err * (1 - sel_parsing_err) = 0;
```

### Secure Pattern: Boolean OR Aggregation (Non-Exclusive)

```pil
// SECURE: Boolean OR for errors that can co-occur (from alu.pil)
sel_err = sel_tag_err + sel_div_0_err - sel_tag_err * sel_div_0_err;
// Equivalent to: sel_err = 1 - (1 - sel_tag_err) * (1 - sel_div_0_err)
```

### Secure Pattern: Sum Aggregation (Mutually Exclusive)

```pil
// SECURE: Simple sum when errors are mutually exclusive (from execution.pil)
sel_error = sel_bytecode_retrieval_failure + sel_instruction_fetching_failure + sel_addressing_error;
// Only valid if at most one error can occur at a time
```

## Examples

### Example 1: Instruction Fetching (Critical!)

```pil
// BEFORE: Only boolean, no aggregation
sel_parsing_err * (1 - sel_parsing_err) = 0;
// FIXME: commented out:
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

// AFTER: Proper aggregation
#[ERROR_AGGREGATION]
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```
**Impact**: Complete bypass of instruction validation.

### Example 2: Execution Errors

```pil
// Multiple error sources should aggregate
sel_err = sel_opcode_err + sel_bytecode_err + sel_addressing_err + ...;
```

## REQUIRED OUTPUT FORMAT

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

<!-- MACHINE-READABLE FINDINGS -->
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
<!-- END MACHINE-READABLE FINDINGS -->

For no findings:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
