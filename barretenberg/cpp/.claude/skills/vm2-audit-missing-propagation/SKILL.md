---
name: vm2-audit-missing-propagation
description: Audit VM2/AVM PIL files for missing propagation constraints. High severity soundness issue where values that should remain constant across multiple rows of a multi-row computation lack propagation constraints, allowing malicious provers to change context_id, clock, or operation parameters mid-computation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Propagation Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing propagation constraints. Values that should remain constant across multiple rows of a multi-row computation lack propagation constraints, allowing a malicious prover to change these values mid-computation.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Medium

## Why This is Critical

Missing propagation allows mid-computation manipulation:
- **Change context_id mid-operation**: Corrupt other execution contexts
- **Modify clock/sequence**: Break ordering guarantees
- **Alter operation parameters after validation**: Bypass checks performed at start

## The Propagation Pattern

The standard pattern for immutable values in multi-row computations:

```pil
pol LATCH_CONDITION = end + start' + precomputed.first_row;
// LATCH fires when:
//   - Current row is end of computation
//   - Next row starts new computation
//   - First row of trace

#[PROPAGATE_VALUE]
(1 - LATCH_CONDITION) * (value' - value) = 0;
// When LATCH = 0: value' must equal value (propagate)
// When LATCH = 1: value' can be anything (new computation)
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Multi-Row Computations

```bash
# Look for start/end patterns
grep -rn "pol commit start\|pol commit end\|start.*end\|latch" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for row counters or indices
grep -rn "row_idx\|counter\|cnt\|idx\|phase" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for multi-row indicators
grep -rn "is_first\|is_last\|NOT_END\|NOT_LAST" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: List Values That Should Be Constant

For each multi-row computation, identify values that should remain constant:

| Category | Examples |
|----------|----------|
| Context identifiers | `context_id`, `call_id`, `space_id` |
| Clock/sequence | `clk`, `timestamp`, `sequence_number` |
| Operation parameters | `opcode`, `dst_offset`, `src_offset` |
| Size/length values | `size`, `length`, `num_bytes` |
| Addresses | `base_addr`, `target_addr` |

```bash
# Find potential constant values
grep -rn "pol commit context\|pol commit clk\|pol commit.*_id\|pol commit.*size\|pol commit.*addr" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Initialization Constraints

For each constant value, verify there's an initialization on start:

```bash
# Look for initialization patterns
grep -rn "start.*value\|start.*(.*-" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[VALUE_INIT]
start * (value - expected_value) = 0;
```

### Step 4: Verify Propagation Constraints

For each constant value, verify there's a propagation constraint:

```bash
# Look for propagation patterns
grep -rn "value'.*-.*value\|value.*-.*value'" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for latch-gated propagation
grep -rn "LATCH\|NOT_END\|1 - end" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[VALUE_PROPAGATE]
(1 - LATCH) * (value' - value) = 0;
```

### Step 5: Check Latch Condition Completeness

Verify the latch condition handles all boundary cases:

```pil
// Common latch conditions (from simplest to most complete)
pol LATCH = end;                                    // Simple
pol LATCH = end + precomputed.first_row;            // Handles row 0
pol LATCH = end + start';                           // Handles consecutive ops
pol LATCH = end + start' + precomputed.first_row;   // Most complete
```

Check for:
- Does it handle the first row of the trace?
- Does it handle consecutive operations (end followed by start)?
- Does it handle the last row of the trace?

### Step 6: Watch for Propagation Gaps

Special conditions can create gaps where propagation breaks:

```bash
# Look for conditional propagation that might have gaps
grep -rn "is_.*\*.*propagate\|phase.*\*.*propagate" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Example gap:
```pil
// VULNERABLE: Gap before special phase
(1 - is_special_phase') * (value' - value) = 0;
// Row before special_phase has unconstrained value!
```

### Step 7: Cross-Reference with Tracegen

Verify tracegen sets values correctly:

```bash
# Find tracegen for the component
grep -rn "context_id\|propagat" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Value Set Once, Not Propagated

```pil
// VULNERABLE: Value set once, not propagated
pol commit context_id;
// Set on first row, but no constraint on subsequent rows
start * (context_id - expected_context_id) = 0;
// On rows where start = 0, context_id is unconstrained!
```

### Vulnerable Pattern: Incomplete Latch

```pil
// VULNERABLE: Latch doesn't handle first row
pol LATCH = end;  // Missing: + precomputed.first_row
(1 - LATCH) * (value' - value) = 0;
// Row 0 may have unconstrained value!
```

### Vulnerable Pattern: Conditional Gap

```pil
// VULNERABLE: Gap in propagation
(1 - is_teardown') * (gas_limit' - gas_limit) = 0;
// Row before teardown has unconstrained gas_limit!
```

### Secure Pattern: Complete Propagation

```pil
// SECURE: Propagation with complete latch condition
pol commit context_id;
pol LATCH_CONDITION = end + start' + precomputed.first_row;

#[CONTEXT_ID_INIT]
start * (context_id - expected_context_id) = 0;

#[CONTEXT_ID_PROPAGATE]
(1 - LATCH_CONDITION) * (context_id' - context_id) = 0;
// context_id stays constant until end of computation
```

## Historical Examples

### Example 1: TX Phase Attributes (PR #18336)

```pil
// BEFORE: Phase static attributes not propagated
pol commit phase_gas_limit;
// Set on phase start, but could change mid-phase!

// AFTER: Proper propagation
pol PHASE_LATCH = end_phase + precomputed.first_row;
#[PHASE_GAS_LIMIT_PROPAGATE]
(1 - PHASE_LATCH) * (phase_gas_limit' - phase_gas_limit) = 0;
```
**Impact**: Could change gas limits mid-phase.

### Example 2: Data Copy (PR #17877)

```pil
// Missing propagation of context_id
pol commit context_id;
// Only set on start row, not propagated

// Missing propagation of clk
pol commit clk;
// Only set on start row, not propagated
```
**Impact**: Could change context or timing mid-copy.

### Example 3: TX Context Gas Limits (PR #18606)

```pil
// Gas limit propagation gap at teardown
// Propagation constraint breaks on is_teardown', leaving gap
#[GAS_LIMIT_PROPAGATE]
(1 - is_teardown') * (gas_limit' - gas_limit) = 0;
// Row before teardown has unconstrained gas_limit!
```
**Impact**: Arbitrary gas limits before teardown.

## Test Patterns

### Test 1: Changed Value Mid-Operation

```cpp
TEST_F(ComponentTest, NegativeChangedContextMidOperation)
{
    auto trace = TestTraceContainer({
        // Row 0: start with context_id = 1
        {{ C::sel, 1 }, { C::start, 1 }, { C::context_id, 1 }},
        // Row 1: middle with different context_id = 2 (INVALID)
        {{ C::sel, 1 }, { C::start, 0 }, { C::context_id, 2 }},
        // Row 2: end
        {{ C::sel, 1 }, { C::end, 1 }, { C::context_id, 2 }},
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "CONTEXT_ID_PROPAGATE"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Propagation enforced - secure
- **Test fails (no throw)**: Value can change mid-operation - vulnerable

### Test 2: Changed Clock Mid-Operation

```cpp
TEST_F(ComponentTest, NegativeChangedClockMidOperation)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 }, { C::start, 1 }, { C::clk, 100 }},
        {{ C::sel, 1 }, { C::start, 0 }, { C::clk, 999 }},  // Changed!
        {{ C::sel, 1 }, { C::end, 1 }, { C::clk, 999 }},
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "CLK_PROPAGATE"
    );
}
```

### Test 3: Changed Size Mid-Copy

```cpp
TEST_F(DataCopyTest, NegativeChangedSizeMidCopy)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 }, { C::start, 1 }, { C::size, 10 }},
        {{ C::sel, 1 }, { C::start, 0 }, { C::size, 5 }},  // Shrunk!
        {{ C::sel, 1 }, { C::end, 1 }, { C::size, 5 }},
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<DataCopyRelation>(trace),
        "SIZE_PROPAGATE"
    );
}
```

## Audit Checklist

1. **Identify multi-row computations**:
   - [ ] Look for `start`, `end`, `latch` patterns
   - [ ] Look for row counters or indices
   - [ ] Identify computation boundaries

2. **List values that should be constant**:
   - [ ] Context identifiers (`context_id`, `call_id`)
   - [ ] Clock/sequence values (`clk`, `timestamp`)
   - [ ] Operation parameters set at start
   - [ ] Size/length values

3. **For each constant value, verify**:
   - [ ] Initialization constraint on start row exists
   - [ ] Propagation constraint on non-latch rows exists
   - [ ] Latch condition correctly identifies boundaries

4. **Check latch condition completeness**:
   - [ ] Handles first row of trace (`precomputed.first_row`)
   - [ ] Handles end of computation (`end`)
   - [ ] Handles consecutive operations (`start'`)

5. **Watch for gaps in propagation**:
   - [ ] Special conditions that break propagation
   - [ ] Edge cases at trace boundaries
   - [ ] Phase transitions

## Fix Pattern

```pil
// Add propagation constraint
pol commit value;
pol LATCH = end + start' + precomputed.first_row;

#[VALUE_INIT]
start * (value - initial_value) = 0;

#[VALUE_PROPAGATE]
(1 - LATCH) * (value' - value) = 0;
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

Multi-row computations typically appear in:
- **Data copy operations**: `data_copy.pil`, `calldata.pil`, `returndata.pil`
- **Hashing**: `poseidon2.pil`, `keccak*.pil`, `sha256.pil`
- **Transaction processing**: `tx.pil`, `execution.pil`
- **Memory operations**: `memory.pil`, `*_mem.pil`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/05-missing-propagation.md)
- [Missing Initialization](../../../pil/vm2/claude-skills/06-missing-initialization.md)
- [Premature Termination](../../../pil/vm2/claude-skills/07-premature-termination.md)
