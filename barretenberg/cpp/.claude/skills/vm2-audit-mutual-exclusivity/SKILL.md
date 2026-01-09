---
name: vm2-audit-mutual-exclusivity
description: Audit VM2/AVM PIL files for missing mutual exclusivity constraints. Soundness issue where selectors or error flags that should be mutually exclusive (only one active at a time) lack explicit exclusivity constraints, leading to undefined behavior or constraint bypass.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Mutual Exclusivity Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing mutual exclusivity constraints on selectors or flags that should never be simultaneously active. This is a **soundness vulnerability** that can lead to undefined behavior or constraint bypass.

**Bug Type**: Soundness
**Severity**: Medium
**Frequency**: Low

## Why This is Critical

When multiple selectors that should be mutually exclusive can be set simultaneously:

### 1. Error Handling Breaks

```pil
// Error aggregation assumes at most one error
sel_err = sel_tag_err + sel_div_0_err + sel_overflow_err;

// If sel_tag_err = 1 AND sel_div_0_err = 1:
//   sel_err = 2 (not boolean!)
// This breaks any constraint expecting sel_err to be boolean
```

### 2. Operation Dispatch Undefined

```pil
// Which operation executes if both are set?
result = sel_add * (a + b) + sel_mul * (a * b);

// If sel_add = 1 AND sel_mul = 1:
//   result = (a + b) + (a * b)  // Garbage!
```

### 3. State Machine Corruption

```pil
// State machine should be in exactly one state
// If state_idle = 1 AND state_running = 1, behavior is undefined
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Related Selector Groups

Look for groups of selectors that logically should be mutually exclusive:

```bash
# Find error flags
grep -rn "pol commit sel_.*err\|pol commit.*_err" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find operation selectors
grep -rn "pol commit sel_op_\|pol commit sel_.*_op" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find state flags
grep -rn "pol commit state_\|pol commit phase_\|pol commit is_" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Determine Exclusivity Requirements

For each group:
- **At most one** (mutually exclusive): Error flags, operation selectors
- **Exactly one** (one-hot): State machine states
- **Multiple allowed**: Independent feature flags (no constraint needed)

### Step 3: Verify Constraints Exist

Check for exclusivity constraints:

```bash
# Pairwise exclusivity: sel_a * sel_b = 0
grep -rn "sel_.*\* sel_\|sel_.*\*sel_" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Sum constraint: sum * (1 - sum) = 0
grep -rn "+ sel_.*= 1\|+ sel_.*\* (1 -" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 4: Check Aggregation Formulas

If selectors are summed, verify the sum is constrained boolean:

```pil
// If this exists:
sel_total = sel_a + sel_b + sel_c;

// Verify this also exists:
sel_total * (1 - sel_total) = 0;
```

### Step 5: Write Negative Tests

```cpp
TEST_F(ComponentTest, NegativeMultipleSelectorsSet)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::sel_op_add, 1 },
         { C::sel_op_mul, 1 }},  // Both ops selected!
    });

    // Should fail if mutual exclusivity is enforced
    // If this passes, the constraint is missing!
    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::runtime_error
    );
}
```

## Mutual Exclusivity Patterns

### Pattern 1: Pairwise Constraints
For small number of selectors (n ≤ 4):
```pil
// For selectors a, b, c that must be mutually exclusive:
#[A_B_EXCLUSIVE]
a * b = 0;
#[A_C_EXCLUSIVE]
a * c = 0;
#[B_C_EXCLUSIVE]
b * c = 0;
```
**Pros**: Simple, clear, named constraints
**Cons**: O(n²) constraints for n selectors

### Pattern 2: Sum Constraint
For many selectors:
```pil
// Sum of mutually exclusive booleans is at most 1
pol SUM = a + b + c + d;
#[AT_MOST_ONE_SELECTOR]
SUM * (1 - SUM) = 0;  // SUM is boolean (0 or 1)
```
**Pros**: O(1) constraints
**Cons**: Requires all individual selectors to be boolean first

### Pattern 3: Priority Encoding
When one takes precedence (built into derivation):
```pil
// Priority: a > b > c
sel_a = raw_a;
sel_b = (1 - raw_a) * raw_b;
sel_c = (1 - raw_a) * (1 - raw_b) * raw_c;
```
**Pros**: Always mutually exclusive by construction
**Cons**: More complex derivation

### Pattern 4: One-Hot Encoding
When exactly one must be active:
```pil
// Exactly one of n selectors is 1
#[EXACTLY_ONE_STATE]
a + b + c + d = 1;

// Combined with boolean constraints on each
a * (1 - a) = 0;
b * (1 - b) = 0;
c * (1 - c) = 0;
d * (1 - d) = 0;
```

## Implicit Mutual Exclusivity Patterns (NOT Vulnerabilities)

**IMPORTANT**: Before flagging a missing mutual exclusivity constraint, check for these implicit enforcement patterns. These are NOT vulnerabilities and flagging them creates false positives.

### Pattern A: Shifted Constraint + Boolean Propagation

```pil
// emit_unencrypted_log.pil pattern
pol commit is_write_contract_address; // @boolean
pol commit is_write_memory_value;     // @boolean
is_write_contract_address * (1 - is_write_contract_address) = 0;
is_write_memory_value * (1 - is_write_memory_value) = 0;

// This constraint enforces mutual exclusivity implicitly:
NOT_END * (is_write_memory_value + is_write_contract_address - is_write_memory_value') = 0;
```

**Why this works**: When `NOT_END = 1`, the constraint forces `is_write_memory_value' = is_write_memory_value + is_write_contract_address`. Since `is_write_memory_value'` must be boolean (0 or 1), and both summands are non-negative booleans, their sum being forced to 0 or 1 means **at most one can be 1**.

**How to verify**: Check if the shifted value (`column'`) has a boolean constraint. If `a + b = c'` and `c` is boolean, then `a` and `b` are mutually exclusive.

### Pattern B: Conflicting Value Constraints

```pil
// ff_gt.pil pattern
pol commit sel_gt;  // @boolean
pol commit sel_dec; // @boolean
sel_gt * (1 - sel_gt) = 0;
sel_dec * (1 - sel_dec) = 0;

// These constraints make sel_gt and sel_dec mutually exclusive:
sel_gt * (cmp_rng_ctr - 4) = 0;   // sel_gt = 1 => cmp_rng_ctr = 4
sel_dec * (cmp_rng_ctr - 1) = 0;  // sel_dec = 1 => cmp_rng_ctr = 1
```

**Why this works**: If both were 1, `cmp_rng_ctr` would need to equal both 4 and 1 simultaneously, which is impossible.

**How to verify**: Look for constraints of the form `sel_a * (x - val_a) = 0` and `sel_b * (x - val_b) = 0` where `val_a ≠ val_b`.

### Pattern C: Lookup/Precomputed Table Enforcement

```pil
// tx.pil pattern - phase selectors
pol commit is_public_call_request;
pol commit is_teardown;
pol commit is_collect_fee;
// ... etc

// These are constrained by lookup into precomputed table:
#[READ_PHASE_SPEC]
sel { phase_value, is_public_call_request, is_teardown, is_collect_fee, ... }
in
precomputed.sel_phase_spec { precomputed.clk, ... };
```

**Why this works**: The precomputed table defines exactly one phase type per `phase_value`. The lookup enforces consistency with this table, guaranteeing mutual exclusivity by construction.

**How to verify**: Check if selectors are populated via a lookup into a precomputed table where mutual exclusivity is guaranteed by table structure.

### Pattern D: Algebraic Construction

```pil
// data_copy.pil pattern
pol commit sel_cd_copy; // @boolean
sel_cd_copy * (1 - sel_cd_copy) = 0;

pol commit sel_cd_copy_start;
sel_cd_copy_start = sel_start * sel_cd_copy;

pol commit sel_rd_copy_start;
sel_rd_copy_start = sel_start * (1 - sel_cd_copy);
```

**Why this works**: `sel_cd_copy_start * sel_rd_copy_start = sel_start² * sel_cd_copy * (1 - sel_cd_copy) = 0` by the boolean constraint on `sel_cd_copy`.

**How to verify**: If selectors are defined as `a = x * y` and `b = x * (1 - y)` where `y` is boolean, they are mutually exclusive by construction.

### Pattern E: Read/Write Flag Mutual Exclusivity

```pil
// keccak_memory.pil pattern
pol commit start_read;  // @boolean
pol commit start_write; // @boolean
pol commit rw;          // @boolean (0=read, 1=write)

start_read * rw = 0;        // start_read = 1 => rw = 0
start_write * (1 - rw) = 0; // start_write = 1 => rw = 1
```

**Why this works**: If both `start_read = 1` and `start_write = 1`, then `rw = 0` AND `rw = 1`, which is impossible.

**How to verify**: Look for constraints that force different values for a shared column.

### Pattern F: Caller-Enforced Exclusivity (Lookup Deduplication)

```pil
// range_check.pil pattern - lookup inverse optimization
// "This is used to decouple generation of inverses of lookups into this trace."
pol commit sel_keccak;
pol commit sel_gt;
pol commit sel_memory;
pol commit sel_alu;

// Each is boolean, but no explicit mutual exclusivity constraint
(sel_keccak + sel_gt + sel_memory + sel_alu) * (1 - sel) = 0;

// HOWEVER, each selector is used exclusively by a dedicated caller module:
// - keccakf1600.pil → range_check.sel_keccak
// - gt.pil → range_check.sel_gt
// - memory.pil → range_check.sel_memory
// - alu.pil → range_check.sel_alu
```

**Why this works**: Each row in the trace is populated by a lookup from exactly one caller module. By design, each caller module only ever uses its own dedicated selector. The selectors are mutually exclusive not by constraint but by architecture - the trace generation cannot produce a row with multiple selectors set.

**How to verify**:
1. Check if there's a comment explaining the purpose (e.g., "decouple generation of inverses")
2. Search for all usages of each selector across the codebase
3. Verify each selector is used by exactly one distinct caller module
4. Confirm no caller module uses multiple of these selectors

### Audit Step: Check for Implicit Patterns First

**Before flagging a potential vulnerability**, verify that none of these implicit patterns apply:

1. **Shifted propagation**: Is there a constraint like `a + b - c' = 0` where `c` is boolean?
2. **Conflicting values**: Do the selectors force different values for the same column?
3. **Lookup enforcement**: Are the selectors populated via lookup into a constrained table?
4. **Algebraic construction**: Are selectors defined using `x * y` and `x * (1-y)` patterns?
5. **Shared flag conflict**: Do selectors force opposite values for a shared boolean?
6. **Caller-enforced exclusivity**: Are these selectors for lookup deduplication where each caller module uses exactly one dedicated selector?

If any of these patterns apply, the mutual exclusivity is enforced implicitly and no explicit constraint is needed.

## Vulnerable vs Secure Patterns

### Vulnerable Pattern

```pil
// VULNERABLE: Errors assumed mutually exclusive but not constrained
pol commit sel_tag_err;
pol commit sel_div_0_err;
pol commit sel_overflow_err;

sel_err = sel_tag_err + sel_div_0_err + sel_overflow_err;
// No mutual exclusivity constraint!
// Multiple errors can be set, making sel_err > 1
```

### Secure Pattern

```pil
// SECURE: Explicit mutual exclusivity
pol commit sel_tag_err;
pol commit sel_div_0_err;
pol commit sel_overflow_err;

// Boolean constraints
sel_tag_err * (1 - sel_tag_err) = 0;
sel_div_0_err * (1 - sel_div_0_err) = 0;
sel_overflow_err * (1 - sel_overflow_err) = 0;

// Sum constraint for mutual exclusivity
pol SEL_ERR_SUM = sel_tag_err + sel_div_0_err + sel_overflow_err;
#[AT_MOST_ONE_ERROR]
SEL_ERR_SUM * (1 - SEL_ERR_SUM) = 0;

sel_err = SEL_ERR_SUM;  // Now safe
```

## Historical Examples

### Example 1: ALU Error States (PR #18192)
```pil
// BEFORE: div_by_0 and sel_tag_err could both be 1
pol commit sel_div_0_err;
pol commit sel_tag_err;
// No mutual exclusivity constraint!

// AFTER: Explicit exclusivity
sel_div_0_err * sel_tag_err = 0;
```
**Impact**: Undefined behavior when dividing with wrong tag.

### Example 2: Operation Selectors
```pil
// Operation selectors should be mutually exclusive
pol commit sel_add;
pol commit sel_sub;
pol commit sel_mul;
pol commit sel_div;

// Need: at most one can be 1
(sel_add + sel_sub + sel_mul + sel_div) * (1 - sel_add - sel_sub - sel_mul - sel_div) = 0;
```

## Audit Checklist

1. **Identify groups of related selectors**:
   - Error flags: `sel_*_err`
   - Operation selectors: `sel_op_*`
   - State flags: `state_*`, `phase_*`

2. **For each group, determine exclusivity requirement**:
   - Must be mutually exclusive? (at most one)
   - Must be exactly one? (one-hot)
   - Can multiple be active? (no constraint needed)

3. **Verify constraints exist** for required exclusivity

4. **Check aggregation formulas**:
   - If using sum, verify result is boolean

5. **Review simulation/tracegen code**:
   - Does it ever set multiple flags in the same group?
   - Does PIL assume single flag?

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

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/22-mutual-exclusivity.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
- [PR #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) - ALU Pre-Audit
