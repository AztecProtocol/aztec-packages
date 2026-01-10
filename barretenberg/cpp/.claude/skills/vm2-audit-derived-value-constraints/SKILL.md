---
name: vm2-audit-derived-value-constraints
description: Audit VM2/AVM PIL files for derived value underconstraints. Critical soundness issue where values that should be computed from other columns are not constrained, allowing malicious provers to set arbitrary values for next_pc, gas calculations, operation outputs, or state transitions.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Derived Value Constraints Audit

Audits for derived value underconstraints - values that should be computed from other columns but aren't constrained. Enables complete logic bypass: control flow corruption (arbitrary `next_pc`), incorrect ALU outputs, invalid state transitions.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Committed Columns

```bash
# List all committed columns in the component
grep -rn "pol commit" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Categorize Each Column

For each committed column, determine its nature:

| Category | Description | Examples |
|----------|-------------|----------|
| **Input** | Provided externally | `opcode`, `operand`, `input_value` |
| **Derived** | Computed from other columns | `next_pc`, `output`, `remaining_gas` |
| **Witness** | Helper for constraint satisfaction | `inv`, `quotient`, `remainder` |
| **Selector** | Boolean operation indicator | `sel_add`, `sel_jump` |

Focus on **Derived** columns - these MUST have constraints.

### Step 3: Verify Constraints Exist for Derived Values

For each derived column, search for its constraint:

```bash
# Search for constraints involving the column
grep -rn "derived_column_name" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for the column on the left side of an equation
grep -rn "derived_column_name.*=" barretenberg/cpp/pil/vm2/ --include="*.pil"
grep -rn "derived_column_name - " barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 4: Check All Cases Are Covered

Derived values often have different formulas based on operation type:

```pil
// Check: Are ALL cases covered?
sel_op_a * (derived - formula_a) = 0;
sel_op_b * (derived - formula_b) = 0;
// What if neither sel_op_a nor sel_op_b? Is derived constrained?
```

```bash
# Find all selectors that might affect a derived value
grep -rn "sel_.*derived_column\|derived_column.*sel_" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 5: Look for Red Flags

```bash
# Find "should be" comments that might indicate missing constraints
grep -rn "should be\|must be\|equals\|computed from\|derived from" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find TODO comments about constraints
grep -rn "TODO.*constrain\|FIXME.*constrain" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find columns that are used but never appear on LHS
# (This requires manual analysis)
```

### Step 6: Verify Constraint Applies on Correct Rows

Check that the constraint is properly gated:

```pil
// INCOMPLETE: Only constrains when sel_op_a = 1
sel_op_a * (derived - formula) = 0;
// What about other rows?

// COMPLETE: Constrains on all active rows
sel * (derived - formula) = 0;
```

## Common Derived Values

| Value | Should Be Derived From | Example Constraint |
|-------|------------------------|-------------------|
| `next_pc` | `pc + instr_length` or `jump_target` | `(1-sel_jump) * (next_pc - pc - length) = 0` |
| `remaining_gas` | `gas - gas_cost` | `remaining_gas = gas - gas_cost` |
| `output` / `c` | Operation on inputs | `sel_add * (c - a - b) = 0` |
| `next_index` | `index + 1` or pattern | `(1-end) * (next_index - index - 1) = 0` |
| `accumulated` | `prev_accumulated + current` | `acc' = acc + value` |
| `dynamic_gas` | Operation-specific formula | `sel_copy * (gas - size * per_byte_cost) = 0` |

## Categories of Derived Values

### 1. Sequential Values
Values that follow a pattern across rows:

```pil
// Index increments
(1 - end) * (index' - index - 1) = 0;

// Counter decrements
(1 - end) * (remaining' - remaining + 1) = 0;

// PC increments
(1 - sel_jump) * (pc' - pc - length) = 0;
```

### 2. Computed Outputs
Operation results that must match inputs:

```pil
// ALU output
sel_add * (c - a - b) = 0;
sel_mul * (c - a * b) = 0;

// Conditional output
sel * (output - (condition * value_if_true + (1-condition) * value_if_false)) = 0;
```

### 3. State Transitions
Values derived from state changes:

```pil
// Gas remaining
gas_remaining = gas_limit - gas_used;

// Stack pointer after push
sp_after = sp_before + 1;
```

### 4. Aggregated Values
Values computed from multiple sources:

```pil
// Total error
sel_err = err_a + err_b + err_c;

// Combined selector
sel_mem_op = sel_load + sel_store;
```

## Patterns

### Vulnerable Pattern: Derived Value Not Constrained

```pil
// VULNERABLE: Derived value not constrained
pol commit pc;
pol commit next_pc;
pol commit instr_length;
```

### Vulnerable Pattern: Partial Coverage

```pil
// VULNERABLE: Only some cases constrained
sel_add * (c - a - b) = 0;
```

### Secure Pattern: Fully Constrained

```pil
// SECURE: Derived value fully constrained for all cases
pol commit pc;
pol commit next_pc;
pol commit instr_length;
pol commit sel_jump;
pol commit jump_target;
#[PC_INCREMENT_STANDARD]
sel * (1 - sel_jump) * (next_pc - pc - instr_length) = 0;
#[PC_INCREMENT_JUMP]
sel * sel_jump * (next_pc - jump_target) = 0;
```

### Secure Pattern: All Operations Covered

```pil
// SECURE: All ALU operations constrain output
sel_add * (c - a - b) = 0;
sel_sub * (c - a + b) = 0;  // Note: subtraction
sel_mul * (c - a * b) = 0;
sel_div * (c * b - a + remainder) = 0;  // With remainder handling
```

## Examples

### Example 1: Execution PC (PR #18864)

```pil
// BEFORE: next_pc completely unconstrained for standard increment!
pol commit pc;
pol commit next_pc;
// No constraint relating them!
// Complete control flow corruption possible

// AFTER: Properly constrained
#[PC_STANDARD_INCREMENT]
sel * (1 - sel_jump) * (1 - sel_halt) * (next_pc - pc - instr_length) = 0;
```
**Impact**: Execute arbitrary instructions in any order.

### Example 2: Dynamic Gas Factor (PR #18864)

```pil
// BEFORE: Dynamic gas not constrained for CALLDATACOPY/RETURNDATACOPY
pol commit dynamic_gas_factor;
// For copy operations, should be: copy_size
// But wasn't constrained!

// AFTER: Constrained for each opcode
#[DYNAMIC_GAS_CALLDATACOPY]
sel_calldatacopy * (dynamic_gas_factor - copy_size) = 0;
```
**Impact**: Undercharge for gas on copy operations.

### Example 3: last_child_success (PR #18864)

```pil
// BEFORE: last_child_success not constrained at all
pol commit last_child_success;
// Should reflect whether nested call succeeded
// But prover could set it arbitrarily!

// AFTER: Constrained based on call result
#[LAST_CHILD_SUCCESS]
sel_after_call * (last_child_success - child_result) = 0;
```
**Impact**: Fake success for failed calls.

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
