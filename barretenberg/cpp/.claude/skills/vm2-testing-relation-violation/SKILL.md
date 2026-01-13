---
name: vm2-testing-relation-violation
description: Write negative tests that verify PIL constraints catch invalid column values. Use hand-crafted TestTraceContainer with deliberately wrong values, then check_relation to confirm the constraint throws.
version: 1.0.0
---

# VM2 Relation Violation Testing

## Purpose
Write negative tests proving PIL constraints reject invalid values via `check_relation<>()`.

## When to Use
- Testing boolean constraints catch non-boolean values (sel = 2)
- Testing aggregation constraints catch mismatched error flags
- Testing derived value constraints catch wrong computations
- Testing implication constraints catch selector-without-main-sel
- Confirming a specific constraint rejects invalid input

## Core Pattern

```cpp
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/constraining/relations/component.hpp"

TEST_F(ComponentConstrainingTest, NegativeDescriptiveName)
{
    auto trace = TestTraceContainer({
        {
            { C::component_sel, 1 },
            { C::some_column, INVALID_VALUE },  // The violation
        },
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "CONSTRAINT_NAME"  // The #[NAME] from PIL
    );
}
```

## Test Categories

### Non-Boolean Selector
```cpp
// sel * (1 - sel) = 0 catches values outside {0, 1}
auto trace = TestTraceContainer({{ { C::component_sel, 2 } }});  // Non-boolean!
EXPECT_THROW_WITH_MESSAGE(check_relation<ComponentRelation>(trace), "SEL_BOOL");
// No throw → BUG: Missing boolean constraint
```

### Error Aggregation Mismatch
```cpp
// sel_err = err_a + err_b + ... catches suppressed errors
auto trace = TestTraceContainer({{
    { C::sel, 1 },
    { C::err_type_a, 1 },  // Individual error SET
    { C::sel_err, 0 },     // But aggregate claims NO error!
}});
EXPECT_THROW_WITH_MESSAGE(check_relation<...>(trace), "ERROR_AGGREGATION");
```

### Wrong Derived Value
```cpp
// Derived values (next_pc, output, gas) must be constrained
auto trace = TestTraceContainer({{
    { C::sel, 1 }, { C::pc, 100 }, { C::instr_length, 4 },
    { C::sel_jump, 0 },   // Not a jump
    { C::next_pc, 999 },  // Should be 104!
}});
EXPECT_THROW_WITH_MESSAGE(check_relation<...>(trace), "PC_STANDARD_INCREMENT");
```

### Selector Without Main Selector
```cpp
// Sub-selectors require sel = 1
auto trace = TestTraceContainer({{
    { C::component_sel, 0 },  // Main selector OFF
    { C::sub_selector, 1 },   // But sub-selector ON!
}});
EXPECT_THROW_WITH_MESSAGE(check_relation<...>(trace), "SUB_SELECTOR_REQUIRES_SEL");
```

### Propagation Violation (Multi-Row)
```cpp
// Values must propagate correctly across rows
auto trace = TestTraceContainer({
    {{ C::sel, 1 }, { C::sel_end, 0 }, { C::context_id, 5 }},   // Row 0
    {{ C::sel, 1 }, { C::sel_end, 0 }, { C::context_id, 99 }},  // Row 1: changed illegally!
});
EXPECT_THROW_WITH_MESSAGE(check_relation<...>(trace), "CONTEXT_ID_PROPAGATION");
```

### Zero-Check Indicator
```cpp
// Zero-check formulas: e = 1 iff x = 0
auto trace = TestTraceContainer({{
    { C::sel, 1 },
    { C::value, 0 },     // Value IS zero
    { C::is_zero, 0 },   // But indicator says NOT zero!
}});
EXPECT_THROW_WITH_MESSAGE(check_relation<...>(trace), "ZERO_CHECK");
```

## Finding Constraint Names

Constraint names come from `#[NAME]` annotations in PIL:
```bash
grep -n "#\[" pil/vm2/component.pil
```

## Test Without Specific Constraint Name

```cpp
// Just expect SOME constraint to fail
EXPECT_THROW(check_relation<ComponentRelation>(trace), std::runtime_error);
```

## Debugging

If test doesn't throw when expected:
1. **Check column names**: Use correct `C::` enum
2. **Check constraint gating**: Is constraint gated by a selector you didn't set?
3. **Regenerate**: Run `vmp` to ensure C++ matches PIL
4. **Debug output**:
   ```cpp
   std::cout << "Row " << row << ": sel=" << trace.get(C::sel, row) << std::endl;
   ```

## Build and Run

```bash
vmp                                          # Regenerate C++ from PIL
vmb                                          # Build tests
vmtg "ComponentConstraining*Negative*"       # Run negative tests
```

## File Location

```
src/barretenberg/vm2/constraining/relations/<component>.test.cpp
```

## Quick Reference

| Violation | Invalid Value | Constraint Pattern |
|-----------|---------------|-------------------|
| Non-boolean | sel = 2 | `SEL_BOOL` |
| Suppressed error | err = 1, sel_err = 0 | `ERROR_AGGREGATION` |
| Wrong derived | next_pc = wrong | `PC_*` |
| Ghost selector | sel = 0, sub_sel = 1 | `*_REQUIRES_SEL` |
| Bad propagation | value' != expected | `*_PROPAGATION` |
| Zero-check bypass | x = 0, is_zero = 0 | `ZERO_CHECK` |
