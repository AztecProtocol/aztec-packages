---
name: vm2-audit-commented-constraints
description: Audit VM2/AVM PIL files for commented-out security constraints. Critical soundness issue where security-critical constraints are disabled via FIXME, TODO, or comments, often indicating incomplete implementations that create severe vulnerabilities while still compiling and passing tests.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Commented-Out Constraints Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for commented-out security constraints. Security-critical constraints that are disabled via comments (FIXME, TODO, or just commented out) often indicate incomplete implementations that create severe vulnerabilities.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Low

## Why This is Critical

This is often the **most dangerous** vulnerability type because:
- **The constraint was identified as necessary**: Someone knew it was needed
- **Someone intentionally disabled it**: Not an oversight, but deliberate
- **Easy to forget during review**: Comments blend into the background
- **Code still compiles/passes tests**: No obvious failure signal
- **False sense of security**: Boolean constraint may exist without aggregation

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Scan for FIXME/TODO Comments

```bash
# Find all FIXME/TODO/HACK comments in PIL files
grep -rn "FIXME\|TODO\|HACK\|TEMPORARY\|DISABLED" barretenberg/cpp/pil/vm2/*.pil

# Also check for common variations
grep -rn "FIX ME\|TO DO\|WORKAROUND\|XXX\|BROKEN" barretenberg/cpp/pil/vm2/*.pil
```

### Step 2: Scan for Commented-Out Constraints

```bash
# Find lines that look like commented-out constraints
grep -rn "^[[:space:]]*//.*=" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "pol\|include\|Example\|e.g."

# Find commented-out constraint blocks
grep -rn "^[[:space:]]*/\*" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find conditional compilation that disables constraints
grep -rn "#if 0\|#ifdef DISABLE\|#ifndef ENABLE" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Assess Each Finding

For each commented-out constraint or FIXME/TODO:

1. **Is this security-critical?**
   - Error aggregation constraints
   - Boolean constraints
   - Implication constraints
   - Propagation constraints
   - Zero-check formulas

2. **What happens without this constraint?**
   - Can a prover bypass validation?
   - Can errors be suppressed?
   - Can state be corrupted?

3. **Is there a valid reason it's disabled?**
   - Incomplete feature implementation
   - Performance optimization pending
   - Bug workaround

4. **When will it be re-enabled?**
   - Is there a tracking issue?
   - Is there a timeline?

### Step 4: Check for Boolean-Only Error Flags

A common pattern is error flags that only have boolean constraints but missing aggregation:

```bash
# Find error-related selectors
grep -rn "sel_err\|sel_.*_err\|_error\|parsing_err" barretenberg/cpp/pil/vm2/ --include="*.pil"

# For each, verify aggregation exists (not just boolean)
grep -rn "sel_err.*=\|sel_err - " barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Suspicious pattern:
```pil
// SUSPICIOUS: Error flag only has boolean constraint
sel_error * (1 - sel_error) = 0;
// Missing: sel_error = err_a + err_b + err_c;
```

### Step 5: Cross-Reference with Individual Errors

For each aggregate error flag, verify all individual errors are included:

```bash
# Find individual error flags
grep -rn "pol commit.*_err\|pol commit err_\|out_of_range\|overflow" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Verify they're all aggregated
grep -rn "sel_err.*=.*+" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

## What To Look For

```pil
// Common dangerous patterns:
// FIXME: ...
// TODO: ...
// HACK: ...
// TEMPORARY: ...
// DISABLED: ...
// COMMENTED OUT: ...

// Also look for:
// #if 0 ... #endif  (in C++ includes)
// /* ... */ around constraints
// Lines starting with // that look like constraints
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Commented-Out Aggregation

```pil
// VULNERABLE: Critical constraint commented out
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
sel_parsing_err * (1 - sel_parsing_err) = 0;  // Only boolean constraint!

// The error aggregation is completely missing!
// A malicious prover can set sel_parsing_err = 0 even when
// individual error flags are 1.
```

### Vulnerable Pattern: Partial Implementation TODO

```pil
// VULNERABLE: Constraint acknowledged but missing
// TODO: Add constraint for XYZ case
// (constraint missing)

// The absence of constraint may not be obvious without the TODO
```

### Secure Pattern: Complete Implementation

```pil
// SECURE: All constraints present
#[PARSING_ERR_BOOL]
sel_parsing_err * (1 - sel_parsing_err) = 0;

#[PARSING_ERR_AGGREGATION]
sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
```

## Historical Examples

### Example 1: Instruction Fetching Error Aggregation

```pil
// instr_fetching.pil
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;

// Only this constraint exists:
sel_parsing_err * (1 - sel_parsing_err) = 0;
```
**Impact**: CRITICAL - Prover can set `sel_parsing_err = 0` even when individual error flags are 1, bypassing error propagation to execution layer. Could claim valid instruction at invalid PC.

### Example 2: Partial Implementation TODOs

```pil
// TODO: Add constraint for XYZ case
// (constraint missing)

// The absence of constraint may not be obvious without the TODO
```
**Impact**: Varies - depends on what's missing.

## Test Patterns

### Test 1: Error Not Aggregated

```cpp
TEST_F(ComponentTest, NegativeErrorNotAggregated)
{
    // Individual error is set but aggregate error is not
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::pc_out_of_range, 1 },      // Individual error!
         { C::sel_parsing_err, 0 }},     // But aggregate claims no error
    });

    // If aggregation constraint exists, this should fail
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ERROR_AGGREGATION"  // or similar
    );

    // If this test PASSES (no throw), the aggregation is missing!
}
```

**Interpretation**:
- **Test passes (throws)**: Aggregation constraint enforced - secure
- **Test fails (no throw)**: Aggregation missing - CRITICAL vulnerability

### Test 2: Multiple Individual Errors Suppressed

```cpp
TEST_F(ComponentTest, NegativeMultipleErrorsSuppressed)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::pc_out_of_range, 1 },
         { C::opcode_out_of_range, 1 },
         { C::instr_out_of_range, 1 },
         { C::sel_parsing_err, 0 }},     // All errors suppressed!
    });

    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::runtime_error
    );
}
```

### Test 3: Verify FIXME Constraint Would Catch Error

```cpp
TEST_F(ComponentTest, VerifyCommentedConstraintNeeded)
{
    // This test documents what the commented constraint SHOULD catch
    // If this test passes, the commented constraint is still needed!

    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::individual_error, 1 },
         { C::aggregate_error, 0 }},  // Mismatch
    });

    // Document the expected behavior when constraint is enabled
    // EXPECT_THROW_WITH_MESSAGE(
    //     check_relation<ComponentRelation>(trace),
    //     "AGGREGATION"
    // );

    // Currently this passes (no throw) - VULNERABLE!
    check_relation<ComponentRelation>(trace);  // Should fail but doesn't
}
```

## Audit Checklist

1. **Scan for FIXME/TODO comments**:
   - [ ] `grep -rn "FIXME\|TODO\|HACK" *.pil`
   - [ ] Document each finding

2. **Scan for commented-out constraints**:
   - [ ] `grep -n "^[[:space:]]*//.*=" *.pil`
   - [ ] Check for `/* */` blocks around constraints
   - [ ] Check for `#if 0` blocks

3. **For each finding, assess**:
   - [ ] Is this a security-critical constraint?
   - [ ] What happens without this constraint?
   - [ ] Is there a valid reason it's disabled?
   - [ ] When will it be re-enabled?
   - [ ] Is there a tracking issue?

4. **Check for aggregation constraints**:
   - [ ] Find all `sel_err`, `sel_*_err` flags
   - [ ] Verify each has aggregation (not just boolean)
   - [ ] Verify all individual errors are included in aggregation

5. **Look for boolean-only error flags**:
   - [ ] Error flag has `* (1 - flag) = 0`
   - [ ] But missing `flag = err_a + err_b + ...`

## Fix Pattern

```pil
// Re-enable or add the constraint
// BEFORE:
// FIXME: constrain this
// sel_err = err_a + err_b;

// AFTER:
#[ERROR_AGGREGATION]
sel_err - err_a - err_b = 0;
// Or equivalently:
sel_err = err_a + err_b;
```

## Prevention Checklist

When reviewing PRs that add FIXME/TODO:
1. Is this a security-critical constraint?
2. Is there an issue tracking this?
3. What's the plan to enable it?
4. Can we add a test that will fail when it's missing?
5. Should this block the PR?

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

Commented-out constraints are most dangerous in:
- **Error handling**: `instr_fetching.pil`, `execution.pil`
- **Validation**: Any PIL with error aggregation
- **Security checks**: Access control, bounds checking
- **State transitions**: Phase/state machine constraints

## Quick Scan Commands

```bash
# Full audit scan for a component
cd barretenberg/cpp/pil/vm2

# 1. Find all TODOs/FIXMEs
grep -n "FIXME\|TODO\|HACK" <component>.pil

# 2. Find commented constraints
grep -n "^[[:space:]]*//.*=" <component>.pil | grep -v "Example\|e.g.\|i.e."

# 3. Find error flags
grep -n "sel_.*err\|_error" <component>.pil

# 4. Find aggregations (or lack thereof)
grep -n "err.*=.*+" <component>.pil
```

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/09-commented-out-constraints.md)
- [Error Aggregation](../../../pil/vm2/claude-skills/10-error-aggregation.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
