---
name: vm2-audit-derived-value-constraints
description: Audit VM2/AVM PIL files for derived value underconstraints. Critical soundness issue where values that should be computed from other columns are not constrained, allowing malicious provers to set arbitrary values for next_pc, gas calculations, operation outputs, or state transitions.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Derived Value Constraints Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for derived value underconstraints. Values that should be computed from other columns are not constrained, allowing a malicious prover to set arbitrary values. This is different from initialization (first row) - it's about values that should be derived from other columns on every applicable row.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Medium

## Why This is Critical

Unconstrained derived values enable complete logic bypass:
- **Control flow corruption**: Arbitrary `next_pc` allows executing any instruction
- **Incorrect computation results**: Wrong ALU outputs
- **State machine violations**: Invalid state transitions
- **Complete bypass of intended logic**: Any derived value can be faked

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Derived Value Not Constrained

```pil
// VULNERABLE: Derived value not constrained
pol commit pc;
pol commit next_pc;
pol commit instr_length;

// next_pc should equal pc + instr_length on non-jump rows
// But NO CONSTRAINT exists!

// Prover can set next_pc to anything
```

### Vulnerable Pattern: Partial Coverage

```pil
// VULNERABLE: Only some cases constrained
sel_add * (c - a - b) = 0;
// What about sel_sub, sel_mul?
// If sel_sub = 1, what constrains c?
```

### Secure Pattern: Fully Constrained

```pil
// SECURE: Derived value fully constrained
pol commit pc;
pol commit next_pc;
pol commit instr_length;
pol commit sel_jump;

// Constrain next_pc based on operation type
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

## Historical Examples

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

## Test Patterns

### Test 1: Arbitrary Derived Value

```cpp
TEST_F(ComponentTest, NegativeArbitraryDerivedValue)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::pc, 0 },
         { C::instr_length, 4 },
         { C::sel_jump, 0 },
         { C::next_pc, 100 }},  // Should be 4, not 100!
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "PC_STANDARD_INCREMENT"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Derived value constrained - secure
- **Test fails (no throw)**: Arbitrary value allowed - CRITICAL vulnerability

### Test 2: Wrong ALU Output

```cpp
TEST_F(ComponentTest, NegativeWrongOutput)
{
    auto trace = TestTraceContainer({
        {{ C::sel_add, 1 },
         { C::a, 5 },
         { C::b, 3 },
         { C::c, 10 }},  // Should be 8, not 10!
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<AluRelation>(trace),
        "ADD_OUTPUT"
    );
}
```

### Test 3: Wrong Gas Calculation

```cpp
TEST_F(ComponentTest, NegativeWrongGas)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::sel_calldatacopy, 1 },
         { C::copy_size, 100 },
         { C::dynamic_gas_factor, 1 }},  // Should be 100!
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ExecutionRelation>(trace),
        "DYNAMIC_GAS"
    );
}
```

### Test 4: Uncovered Operation Type

```cpp
TEST_F(ComponentTest, NegativeUncoveredOperation)
{
    // Test an operation that might not have output constraint
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::sel_new_op, 1 },  // Newly added operation
         { C::a, 5 },
         { C::b, 3 },
         { C::c, 999 }},  // Is this constrained?
    });

    // If this passes, the new operation's output isn't constrained!
    EXPECT_THROW(
        check_relation<AluRelation>(trace),
        std::runtime_error
    );
}
```

## Audit Checklist

1. **Identify all committed columns**:
   - [ ] `grep "pol commit" component.pil`
   - [ ] Categorize each as Input/Derived/Witness/Selector

2. **For each derived column, verify constraint exists**:
   - [ ] Search for column in constraints
   - [ ] Verify it appears on LHS (being constrained, not just used)

3. **Check all cases are covered**:
   - [ ] List all operation types that affect the derived value
   - [ ] Verify each operation type has a constraint
   - [ ] Check what happens when no operation selector is active

4. **Check for conditional derivations**:
   - [ ] Different formulas for different operations
   - [ ] Default/inactive case handling

5. **Look for red flags**:
   - [ ] "should be X" comments without constraints
   - [ ] TODO/FIXME about constraining values
   - [ ] Columns used but never constrained
   - [ ] Asymmetric operation handling

## Fix Pattern

```pil
// Identify all cases where derived value applies
// Add constraint for each case

// Case 1: Standard operation
#[DERIVED_CASE_1]
sel_case_1 * (derived_value - formula_1) = 0;

// Case 2: Alternative operation
#[DERIVED_CASE_2]
sel_case_2 * (derived_value - formula_2) = 0;

// Case 3: Default/inactive (if needed)
#[DERIVED_DEFAULT]
(1 - sel_case_1) * (1 - sel_case_2) * (derived_value - default_value) = 0;
```

## Build and Test Commands

```bash
# Regenerate C++ from PIL
vmp  # or: ../../bb-pilcom/target/release/bb_pil pil/vm2

# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run specific component test
vmtg "ComponentConstraining*"
```

## Common Locations to Audit

Derived values are critical in:
- **Execution**: `execution.pil` - `next_pc`, `gas_remaining`, `call_results`
- **ALU**: `alu.pil` - operation outputs (`c` from `a` and `b`)
- **Memory**: `memory.pil` - address calculations, value propagation
- **Gas**: Gas cost calculations, remaining gas
- **Control flow**: Jump targets, call/return handling
- **State machines**: Phase transitions, counter updates

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/21-derived-value-constraints.md)
- [Missing Initialization Skill](../vm2-audit-missing-initialization/SKILL.md)
- [Missing Propagation Skill](../vm2-audit-missing-propagation/SKILL.md)
- [Error Aggregation](../../../pil/vm2/claude-skills/10-error-aggregation.md)
