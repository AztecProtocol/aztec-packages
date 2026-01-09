---
name: vm2-audit-premature-termination
description: Audit VM2/AVM PIL files for premature computation termination vulnerabilities. High severity soundness issue where multi-row computations can be terminated before completion due to missing trace continuity constraints, allowing provers to skip computation steps, truncate Merkle proofs, end copy operations early, or skip validation steps.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Premature Termination Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for premature computation termination vulnerabilities. Multi-row computations can be terminated before they're complete due to missing constraints that enforce continuation until a valid end condition is met.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Medium

## Why This is Critical

Premature termination enables computation truncation:
- **Skip computation steps**: Hash only half the data
- **Truncate Merkle proofs**: Claim invalid roots as valid
- **End copy operations early**: Partial data copied
- **Skip validation steps**: Bypass security checks

## The Trace Continuity Pattern

The standard pattern to prevent premature termination:

```pil
#[COMPUTATION_FINISH_AT_END]
sel * (1 - sel') * (1 - end) = 0;

// This constraint says:
// If sel = 1 (we're in computation)
// And sel' = 0 (next row exits computation)
// Then end = 1 (we properly terminated)

// Equivalently: sel = 1 AND sel' = 0 => end = 1
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Multi-Row Computations

```bash
# Look for start/end patterns
grep -rn "pol commit start\|pol commit end\|pol commit sel_end" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for counters/remaining values
grep -rn "remaining\|counter\|cnt\|idx\|row_idx" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for latch/continuation patterns
grep -rn "latch\|NOT_END\|continue\|continuity" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

**Note**: Grep may not be comprehensive. Manually review each PIL file to identify all multi-row computations.

### Step 2: Verify Trace Continuity Constraint Exists

For each multi-row computation, search for the continuity constraint:

```bash
# Look for the trace continuity pattern
grep -rn "sel.*1 - sel'.*1 - end\|sel.*(1 - sel').*(1 - end)" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Alternative patterns
grep -rn "CONTINUITY\|FINISH_AT_END\|MUST_END" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
```

### Step 3: Check End Condition Constraints

Verify that `end` can only be set when computation is truly complete:

```bash
# Look for end condition constraints
grep -rn "end.*remaining\|end.*count\|end.*done\|END_WHEN\|END_ONLY" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Check for bidirectional constraints:
```pil
// end => done (necessary)
end * remaining_count = 0;

// done => end (also necessary!)
(1 - end) * is_done_indicator = 0;
```

### Step 4: Look for Underflow Risks

Counters that underflow could wrap around, breaking termination logic:

```bash
# Look for counter decrement patterns
grep -rn "remaining'.*remaining - 1\|counter'.*counter - 1\|cnt - 1" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Check that:
- Counters can't go negative (or wrap in field arithmetic)
- Off-by-one errors don't allow early termination

### Step 5: Verify Error Handling Doesn't Break Continuity

Error paths must still require proper termination:

```bash
# Look for error-related termination
grep -rn "err.*end\|error.*end\|END_ON_ERR" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify:
- Error path still requires `end = 1` before `sel' = 0`
- Early exit on error is properly constrained with start gating

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: No Enforcement of Continuation

```pil
// VULNERABLE: No enforcement that computation continues until end
pol commit sel;
pol commit end;
// sel can drop to 0 at any time without end = 1!
```

### Vulnerable Pattern: One-Way End Condition

```pil
// VULNERABLE: end can be set prematurely
pol commit remaining_count;
pol commit end;
end * remaining_count = 0;  // Only checks end implies count = 0
// But what if end = 1 before remaining_count naturally reaches 0?
// Missing: done implies end
```

### Vulnerable Pattern: Missing Start Gating on Error

```pil
// VULNERABLE: Error can trigger end on any row
err * (1 - sel_end) = 0;  // Missing sel_start gating!
// Non-start rows with err = 1 could prematurely end
```

### Secure Pattern: Complete Trace Continuity

```pil
// SECURE: Trace continuity constraint
pol commit sel;
pol commit end;

#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
// If sel = 1 and sel' = 0, then end must be 1
// Cannot drop out of computation without properly ending

// SECURE: end only when truly finished
#[END_ONLY_WHEN_DONE]
end * remaining_count = 0;      // end implies done

#[MUST_END_WHEN_DONE]
(1 - end) * is_done = 0;        // done implies end
```

### Secure Pattern: Gated Error Termination

```pil
// SECURE: Error termination properly gated
#[END_ON_ERR]
sel_start * err * (1 - sel_end) = 0;
// Only start rows can trigger error-based end
```

## Historical Examples

### Example 1: Data Copy (PR #17877)

```pil
// BEFORE: Could truncate copy operation
pol commit sel;
pol commit sel_end;
// No constraint that sel = 1 until sel_end = 1

// AFTER: Added continuity constraint
#[COPY_CONTINUITY]
sel * (1 - sel') * (1 - sel_end) = 0;
```
**Impact**: Could copy partial data.

### Example 2: Merkle Check (PR #17771)

```pil
// BEFORE: Merkle path could be truncated
// No explicit finish-at-end constraint

// AFTER: Added constraint
#[COMPUTATION_FINISH_AT_END]
sel * (1 - sel') * (1 - end) = 0;
```
**Impact**: Could truncate Merkle proofs.

### Example 3: TX is_padded (PR #18336)

```pil
// BEFORE: is_padded didn't imply end_phase
// Could extend trace infinitely via counter underflow

// AFTER: Added implication
#[IS_PADDED_END_PHASE]
is_padded * (1 - end_phase) = 0;
```
**Impact**: Infinite trace extension.

### Example 4: Data Copy sel_end (PR #17877)

```pil
// sel_end could be toggled prematurely because:
// 1. err not constrained beyond first row
// 2. sel_start missing as gating factor in #[END_ON_ERR]

// BEFORE:
err * (1 - sel_end) = 0;  // Missing sel_start!

// AFTER:
#[END_ON_ERR]
sel_start * err * (1 - sel_end) = 0;
```
**Impact**: Premature end on non-start rows.

## Test Patterns

### Test 1: Premature Exit Without End

```cpp
TEST_F(ComponentTest, NegativePrematureTermination)
{
    auto trace = TestTraceContainer({
        // Row 0: start computation with 3 remaining
        {{ C::sel, 1 }, { C::start, 1 }, { C::remaining, 3 }},
        // Row 1: continue
        {{ C::sel, 1 }, { C::remaining, 2 }},
        // Row 2: PREMATURE EXIT without end (remaining = 1, not 0)
        {{ C::sel, 0 }, { C::end, 0 }, { C::remaining, 1 }},
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "COMPUTATION_FINISH_AT_END"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Continuity enforced - secure
- **Test fails (no throw)**: Premature termination allowed - vulnerable

### Test 2: Fake End Before Done

```cpp
TEST_F(ComponentTest, NegativeFakeEnd)
{
    auto trace = TestTraceContainer({
        // Row 0: start computation with 3 remaining
        {{ C::sel, 1 }, { C::start, 1 }, { C::remaining, 3 }},
        // Row 1: fake end while remaining > 0
        {{ C::sel, 1 }, { C::end, 1 }, { C::remaining, 2 }},  // INVALID
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "END_ONLY_WHEN_DONE"
    );
}
```

### Test 3: Missing End When Done

```cpp
TEST_F(ComponentTest, NegativeMissingEndWhenDone)
{
    auto trace = TestTraceContainer({
        // Row 0: start with 1 remaining
        {{ C::sel, 1 }, { C::start, 1 }, { C::remaining, 1 }},
        // Row 1: remaining = 0 but end = 0 (should be 1)
        {{ C::sel, 1 }, { C::end, 0 }, { C::remaining, 0 }},  // INVALID
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "MUST_END_WHEN_DONE"
    );
}
```

### Test 4: Error on Non-Start Row

```cpp
TEST_F(ComponentTest, NegativeErrorOnNonStartRow)
{
    auto trace = TestTraceContainer({
        // Row 0: start computation
        {{ C::sel, 1 }, { C::start, 1 }, { C::err, 0 }},
        // Row 1: middle row with error trying to end
        {{ C::sel, 1 }, { C::start, 0 }, { C::err, 1 }, { C::sel_end, 1 }},
    });

    // Should fail if err-based end requires start gating
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "END_ON_ERR"
    );
}
```

## Audit Checklist

1. **Identify multi-row computations**:
   - [ ] Look for `start`, `end`, `latch` patterns
   - [ ] Look for `remaining`, `counter`, `cnt` values
   - [ ] Manually review each PIL file

2. **For each computation, verify**:
   - [ ] Trace continuity constraint exists: `sel * (1 - sel') * (1 - end) = 0`
   - [ ] End condition properly checked (bidirectional)
   - [ ] Cannot exit without proper termination

3. **Check end condition constraints**:
   - [ ] `end => done`: `end * remaining_count = 0`
   - [ ] `done => end`: `(1 - end) * is_done = 0`
   - [ ] Cannot set `end = 1` arbitrarily

4. **Look for underflow risks**:
   - [ ] Counters that could underflow and wrap
   - [ ] Off-by-one errors in termination checks

5. **Verify error handling doesn't break continuity**:
   - [ ] Error path still requires proper termination
   - [ ] Early exit on error is properly gated by `start`

## Fix Pattern

```pil
// Add trace continuity constraint
pol commit sel;
pol commit end;

#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;

// Optionally, also constrain that end only when truly done
#[END_WHEN_COMPLETE]
end * remaining_count = 0;

#[MUST_END_WHEN_COMPLETE]
(1 - end) * (remaining_count_is_zero) = 0;
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

Multi-row computations requiring continuity checks:
- **Data operations**: `data_copy.pil`, `calldata.pil`, `returndata.pil`
- **Hashing**: `poseidon2.pil`, `keccak*.pil`, `sha256.pil`
- **Tree operations**: `merkle.pil`, `merkle_check.pil`
- **Transaction**: `tx.pil` - phase transitions
- **Memory operations**: Multi-row memory copies

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/07-premature-termination.md)
- [Missing Propagation Skill](../vm2-audit-missing-propagation/SKILL.md)
- [Missing Initialization Skill](../vm2-audit-missing-initialization/SKILL.md)
