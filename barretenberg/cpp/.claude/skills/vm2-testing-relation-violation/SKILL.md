---
name: vm2-testing-relation-violation
description: Write negative tests that verify PIL constraints catch invalid column values. Use hand-crafted TestTraceContainer with deliberately wrong values, then check_relation to confirm the constraint throws.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Relation Violation Testing

## Purpose

Write **negative tests** that prove PIL constraints catch invalid values. These tests hand-craft traces with deliberately wrong column values and verify that `check_relation<>()` throws an exception naming the violated constraint.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## When to Use

- Testing that a boolean constraint catches non-boolean values (sel = 2)
- Testing that an aggregation constraint catches mismatched error flags
- Testing that a derived value constraint catches wrong computations
- Testing that an implication constraint catches selector-without-main-sel
- Any test where you want to confirm a specific constraint rejects invalid input

## Core Pattern

```cpp
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/constraining/relations/component.hpp"

TEST_F(ComponentConstrainingTest, NegativeDescriptiveName)
{
    // 1. Create trace with deliberately INVALID values
    auto trace = TestTraceContainer({
        {
            { C::component_sel, 1 },
            { C::some_column, INVALID_VALUE },  // <-- The violation
        },
    });

    // 2. Expect check_relation to throw, naming the violated constraint
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "CONSTRAINT_NAME"  // The #[NAME] from PIL
    );
}
```

## Test Categories

### 1. Non-Boolean Selector

Tests that `sel * (1 - sel) = 0` catches values outside {0, 1}.

```cpp
TEST_F(ComponentConstrainingTest, NegativeNonBooleanSelector)
{
    auto trace = TestTraceContainer({
        {{ C::component_sel, 2 }},  // Non-boolean!
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "SEL_BOOL"
    );
}
```

**Interpretation:**
- Throws with "SEL_BOOL" → Constraint exists, catching the violation
- No throw → **BUG**: Missing boolean constraint

### 2. Error Aggregation Mismatch

Tests that `sel_err = err_a + err_b + ...` catches suppressed errors.

```cpp
TEST_F(ComponentConstrainingTest, NegativeErrorSuppressed)
{
    auto trace = TestTraceContainer({
        {
            { C::sel, 1 },
            { C::err_type_a, 1 },    // Individual error SET
            { C::sel_err, 0 },       // But aggregate claims NO error!
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ERROR_AGGREGATION"
    );
}
```

### 3. Wrong Derived Value

Tests that derived values (next_pc, output, gas) are constrained.

```cpp
TEST_F(ComponentConstrainingTest, NegativeWrongDerivedValue)
{
    auto trace = TestTraceContainer({
        {
            { C::sel, 1 },
            { C::pc, 100 },
            { C::instr_length, 4 },
            { C::sel_jump, 0 },       // Not a jump
            { C::next_pc, 999 },      // Should be 104!
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "PC_STANDARD_INCREMENT"
    );
}
```

### 4. Selector Without Main Selector (Implication)

Tests that sub-selectors require `sel = 1`.

```cpp
TEST_F(ComponentConstrainingTest, NegativeSelectorOnInactiveRow)
{
    auto trace = TestTraceContainer({
        {
            { C::component_sel, 0 },      // Main selector OFF
            { C::sub_selector, 1 },       // But sub-selector ON!
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "SUB_SELECTOR_REQUIRES_SEL"
    );
}
```

### 5. Propagation Violation

Tests that values propagate correctly across rows.

```cpp
TEST_F(ComponentConstrainingTest, NegativePropagationViolation)
{
    auto trace = TestTraceContainer({
        // Row 0: context_id = 5
        {
            { C::sel, 1 },
            { C::sel_end, 0 },
            { C::context_id, 5 },
        },
        // Row 1: context_id changed illegally!
        {
            { C::sel, 1 },
            { C::sel_end, 0 },
            { C::context_id, 99 },  // Should still be 5!
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "CONTEXT_ID_PROPAGATION"
    );
}
```

### 6. Zero-Check Indicator

Tests that zero-check formulas are correct.

```cpp
TEST_F(ComponentConstrainingTest, NegativeZeroCheckBypass)
{
    auto trace = TestTraceContainer({
        {
            { C::sel, 1 },
            { C::value, 0 },         // Value IS zero
            { C::is_zero, 0 },       // But indicator says NOT zero!
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ZERO_CHECK"
    );
}
```

## Finding the Constraint Name

The constraint name comes from the `#[NAME]` annotation in PIL:

```pil
#[SEL_BOOL]
sel * (1 - sel) = 0;
```

To find constraint names:
```bash
# List all constraint names in a component
grep -n "#\[" pil/vm2/component.pil
```

## Setting Up Multi-Row Traces

For constraints involving `'` (next row):

```cpp
auto trace = TestTraceContainer({
    // Row 0
    {
        { C::sel, 1 },
        { C::value, 10 },
    },
    // Row 1 (the "next" row from row 0's perspective)
    {
        { C::sel, 1 },
        { C::value, 20 },  // Constraint checks value' from row 0
    },
});
```

## Common Column Enum Pattern

Column enums are generated from PIL. Access them via the `C::` namespace alias:

```cpp
using C = Column;  // Usually defined in test fixture

// Columns come from PIL declarations:
// pol commit sel;           → C::component_sel
// pol commit my_value;      → C::component_my_value
```

## Test Without Specific Constraint Name

If you don't know/care which constraint catches it:

```cpp
TEST_F(ComponentConstrainingTest, NegativeInvalidTrace)
{
    auto trace = TestTraceContainer({...});

    // Just expect SOME constraint to fail
    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::runtime_error
    );
}
```

## Debugging Test Failures

If your test doesn't throw when expected:

1. **Check column names**: Ensure you're using the right `C::` enum
2. **Check constraint gating**: Is the constraint gated by a selector you didn't set?
3. **Run PIL regeneration**: `vmp` to ensure C++ matches PIL
4. **Print trace values**: Add debug output to see actual values

```cpp
// Debug: Print what's in the trace
for (uint32_t row = 0; row < 2; row++) {
    std::cout << "Row " << row << ": sel=" << trace.get(C::sel, row)
              << " value=" << trace.get(C::value, row) << std::endl;
}
```

## Build and Run

```bash
# Regenerate C++ from PIL (if PIL changed)
vmp

# Build tests
vmb

# Run specific test
vmtg "ComponentConstraining*NegativeDescriptiveName"

# Run all negative tests for component
vmtg "ComponentConstraining*Negative*"
```

## File Location

Tests go in:
```
src/barretenberg/vm2/constraining/relations/<component>.test.cpp
```

## Quick Reference

| Violation Type | Invalid Value | Expected Constraint |
|----------------|---------------|---------------------|
| Non-boolean | sel = 2 | `SEL_BOOL` |
| Suppressed error | err = 1, sel_err = 0 | `ERROR_AGGREGATION` |
| Wrong derived | next_pc = wrong | `PC_*` |
| Ghost selector | sel = 0, sub_sel = 1 | `*_REQUIRES_SEL` |
| Bad propagation | value' != expected | `*_PROPAGATION` |
| Zero-check bypass | x = 0, is_zero = 0 | `ZERO_CHECK` |
