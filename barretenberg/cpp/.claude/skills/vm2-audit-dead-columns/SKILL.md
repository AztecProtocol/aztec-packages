---
name: vm2-audit-dead-columns
description: Audit VM2/AVM PIL files for dead columns - columns that are declared but never used in constraints, lookups, or permutations. This can indicate incomplete constraints, missing security checks, or leftover code from refactoring that may hide soundness issues.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Dead Columns Audit Skill

## Overview

This skill audits VM2/AVM PIL files for dead columns - columns that are declared (`pol commit`) but never meaningfully used. Dead columns can indicate incomplete constraints, missing lookups, or leftover code that may hide soundness issues.

**Bug Type**: Soundness (potential) / Code Quality
**Severity**: Medium to High (depending on intent)
**Frequency**: Medium

## Why This is Important

Dead columns can indicate serious issues:
- **Incomplete constraints**: Column was supposed to constrain behavior but doesn't
- **Missing lookups/permutations**: Column should be verified against another trace
- **Forgotten security checks**: Column exists for validation but check was never added
- **Refactoring leftovers**: Column no longer needed but not removed, obscuring code
- **Prover freedom**: Uncommitted columns give prover arbitrary control

## What Counts as "Used"

A column is considered **used** if it appears in:
1. **Constraints**: `sel * (column - expected) = 0`
2. **Lookups/Permutations**: `{ column } in other.sel { other.column }`
3. **Intermediate polynomials**: `pol INTERMEDIATE = column * something`
4. **Exported to other traces**: Used in another PIL file's lookup destination

A column is **dead** if it's only:
1. Declared with `pol commit`
2. Assigned in tracegen but never constrained
3. Used only in comments or disabled code

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: List All Declared Columns

```bash
# Find all committed polynomials in a component
grep -n "pol commit" barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: For Each Column, Search for Usage

```bash
# Search for column usage in same file
grep -n "column_name" barretenberg/cpp/pil/vm2/<component>.pil | grep -v "pol commit"

# Search for column usage across all PIL files (for shared columns)
grep -rn "component\\.column_name" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Check for Virtual Trace Sharing

Some traces share column namespaces. Check if the column is used in related files:

```bash
# Find files that might share the namespace
grep -rln "namespace.*component" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Check each related file for column usage
```

### Step 4: Check Lookup/Permutation Destinations

A column might be used as a lookup destination from another trace:

```bash
# Find lookups INTO this trace
grep -rn "in component\\.sel\\|in component\\." barretenberg/cpp/pil/vm2/ --include="*.pil"

# Check what columns are in the destination tuple
```

### Step 5: Verify Tracegen Sets the Column

Even if constrained, verify tracegen actually sets it:

```bash
# Find column assignment in tracegen
grep -rn "row\\.column_name\\|column_name =" barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### Step 6: Categorize Dead Columns

For each dead column found, determine:
1. **Intentionally unused**: Placeholder for future work (should have comment)
2. **Accidentally unused**: Bug - constraint missing
3. **Refactoring leftover**: Should be removed
4. **Lookup destination**: Used by other traces (not dead)

## Dead Column Categories

### Category 1: Completely Dead

Column declared but never appears anywhere else in any PIL file.

```pil
// DEAD: Column declared but never used
pol commit unused_column;
// ... nowhere else in any file references unused_column
```

**Risk**: High - why does it exist?

### Category 2: Only in Tracegen

Column is set in tracegen but has no PIL constraints.

```pil
// PIL
pol commit value;
// No constraints on 'value'
```

```cpp
// Tracegen
row.value = compute_value();  // Set but never verified!
```

**Risk**: High - prover can set arbitrary value

### Category 3: Only in Disabled Code

Column only appears in commented-out constraints.

```pil
pol commit check_value;
// #[DISABLED_CHECK]
// sel * (check_value - expected) = 0;  // Commented out!
```

**Risk**: High - was this intentionally disabled?

### Category 4: Only Self-Referential

Column only constrains itself (boolean check) but never used elsewhere.

```pil
pol commit flag;
flag * (1 - flag) = 0;  // Boolean constraint
// But 'flag' never used to gate anything!
```

**Risk**: Medium - boolean exists but has no effect

### Category 5: Lookup Destination Only

Column exists only to be looked up by other traces - this is VALID.

```pil
// In precomputed.pil
pol commit table_value;
// No local constraints, but used as lookup destination
```

```pil
// In execution.pil
sel { value } in precomputed.sel { precomputed.table_value };
```

**Risk**: None - this is the intended pattern

## Vulnerable vs Valid Patterns

### Vulnerable Pattern: Declared But Unused

```pil
// VULNERABLE: Column never constrained
pol commit secret_value;
// Prover can set secret_value to anything!
// If this affects any computation, it's exploitable
```

### Vulnerable Pattern: Set But Not Constrained

```pil
// VULNERABLE: Tracegen sets it, but PIL doesn't verify
pol commit computed_hash;
// No constraint that computed_hash is correct!
```

```cpp
// Tracegen computes and sets
row.computed_hash = poseidon2(inputs);
// But prover could put any value here
```

### Vulnerable Pattern: Commented Constraint

```pil
// VULNERABLE: Constraint was disabled
pol commit balance;
// #[BALANCE_CHECK]
// sel * (balance - expected_balance) = 0;
// Without this, balance is unconstrained!
```

### Valid Pattern: Lookup Destination

```pil
// VALID: Used as lookup destination
pol commit precomputed_value;
// No local constraints needed - other traces look this up
```

### Valid Pattern: Intermediate Storage

```pil
// VALID: Used in intermediate then constrained
pol commit raw_value;
pol PROCESSED = raw_value * factor;
sel * (PROCESSED - expected) = 0;  // raw_value is constrained through PROCESSED
```

### Valid Pattern: Conditional Usage

```pil
// VALID: Used conditionally
pol commit optional_check;
sel_special * (optional_check - expected) = 0;
// Constrained when sel_special = 1
```

## Test Patterns

### Test 1: Dead Column Allows Arbitrary Value

```cpp
TEST_F(ComponentTest, NegativeDeadColumnArbitrary)
{
    // If column is truly dead, any value should work
    auto trace1 = create_trace_with_column_value(0);
    auto trace2 = create_trace_with_column_value(12345);
    auto trace3 = create_trace_with_column_value(FF::random());

    // All should pass if column is unconstrained (BAD!)
    check_relation<ComponentRelation>(trace1);
    check_relation<ComponentRelation>(trace2);
    check_relation<ComponentRelation>(trace3);
}
```

**Interpretation**:
- **All pass**: Column is dead/unconstrained - potential vulnerability
- **Some fail**: Column IS constrained - not dead

### Test 2: Column Should Affect Outcome

```cpp
TEST_F(ComponentTest, NegativeColumnShouldMatter)
{
    // Set column to wrong value
    auto trace = create_valid_trace();
    trace.set(C::supposed_to_be_constrained, wrong_value);

    // Should fail if column is properly constrained
    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::exception
    );
}
```

## Audit Checklist

1. **List all declared columns**:
   - [ ] `grep -n "pol commit" component.pil`
   - [ ] Document each column

2. **For each column, check usage**:
   - [ ] Used in constraints? (`grep "column_name" | grep -v "pol commit"`)
   - [ ] Used in lookups/permutations?
   - [ ] Used in intermediate polynomials?

3. **Check cross-file usage**:
   - [ ] Used as lookup destination from other traces?
   - [ ] Used in virtual trace sharing?

4. **Categorize dead columns**:
   - [ ] Completely dead (never referenced)
   - [ ] Only in tracegen (no PIL constraint)
   - [ ] Only in comments (disabled)
   - [ ] Only self-referential (boolean only)

5. **For each dead column, determine**:
   - [ ] Is it intentionally unused (documented)?
   - [ ] Should it be constrained?
   - [ ] Should it be removed?
   - [ ] Is it a security issue?

6. **Verify tracegen alignment**:
   - [ ] Column set in tracegen?
   - [ ] Value computed correctly?

## Automated Detection Script

```bash
#!/bin/bash
# Find potentially dead columns in a PIL file

PIL_FILE="$1"
if [ -z "$PIL_FILE" ]; then
    echo "Usage: $0 <pil_file>"
    exit 1
fi

echo "=== Declared columns in $PIL_FILE ==="
COLUMNS=$(grep "pol commit" "$PIL_FILE" | sed 's/.*pol commit \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/')

for col in $COLUMNS; do
    # Count non-declaration uses in same file
    LOCAL_USES=$(grep -c "$col" "$PIL_FILE" | grep -v "pol commit")

    # Count uses in other PIL files
    OTHER_USES=$(grep -rn "$col" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "$PIL_FILE" | wc -l)

    TOTAL=$((LOCAL_USES + OTHER_USES - 1))  # -1 for declaration

    if [ "$TOTAL" -le 1 ]; then
        echo "POTENTIALLY DEAD: $col (uses: $TOTAL)"
    fi
done
```

## Fix Patterns

### Fix 1: Add Missing Constraint

```pil
// BEFORE: Dead column
pol commit value;

// AFTER: Add constraint
pol commit value;
#[VALUE_CHECK]
sel * (value - expected_value) = 0;
```

### Fix 2: Remove Unused Column

```pil
// BEFORE: Leftover column
pol commit old_unused_column;

// AFTER: Remove it entirely
// (also remove from tracegen)
```

### Fix 3: Document Intentional Non-Use

```pil
// If column is intentionally unused (e.g., placeholder):
pol commit future_feature;  // TODO: Will be constrained in PR #XXXX
```

### Fix 4: Add Lookup Connection

```pil
// BEFORE: Column not connected
pol commit hash_result;

// AFTER: Connect via lookup
#[HASH_LOOKUP]
sel_hash { input, hash_result } in poseidon2.sel { poseidon2.input, poseidon2.output };
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

Dead columns can appear in any PIL file, but commonly in:
- **Complex traces**: `execution.pil`, `tx.pil` - many columns, easy to miss one
- **Refactored code**: Files that underwent significant changes
- **New features**: Recently added columns that aren't fully integrated
- **Gadgets**: `poseidon2.pil`, `sha256.pil` - intermediate values

## References

- [Commented Constraints Skill](../vm2-audit-commented-constraints/SKILL.md)
- [Tracegen-PIL Alignment Skill](../vm2-audit-tracegen-pil-alignment/SKILL.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
