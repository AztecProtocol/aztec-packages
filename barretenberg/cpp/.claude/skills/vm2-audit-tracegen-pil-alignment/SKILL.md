---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tracegen-PIL Alignment Audit Skill

## Overview

This skill audits VM2/AVM for misalignment between tracegen (trace generation code) and PIL constraints. Misalignment causes valid executions to fail verification.

**Bug Type**: Completeness
**Severity**: Medium
**Frequency**: High

## Why This is Important

This is a **completeness** issue - honest provers produce invalid traces even for correct executions, causing verification failures. The trace generation code must produce values that satisfy all PIL constraints.

## Common Misalignment Types

### Type 1: Missing Column Assignment

```cpp
// VULNERABLE: Column not set in tracegen
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
    // Missing: row.a_inv = compute_inverse(event.a);
}
```

### Type 2: Incorrect Column Value

```cpp
// VULNERABLE: Wrong value computation
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// tag_a - tag_b can be negative in field arithmetic!
```

### Type 3: Event Not Handled

```cpp
// VULNERABLE: Error case not handled
if (event.error == ErrorType::None) {
    // Normal case handled
}
// Missing: else { handle error case }
```

### Type 4: Selector Not Toggled

```cpp
// VULNERABLE: Selector should be 1 but not set
// For a certain code path, sel_special should be 1
// But tracegen doesn't toggle it
```

### Type 5: Wrong Selector Condition

```cpp
// VULNERABLE: Selector condition doesn't match PIL semantics
// PIL: sel = double_op + add_op + INFINITY_PRED (exactly one must be 1)
// Where: double_op = x_match * y_match, INFINITY_PRED = x_match * (1 - y_match)
// Therefore: add_op = 1 when x_match = 0 (regardless of y_match)

bool add_predicate = (!x_match && !y_match);  // WRONG: requires both to differ
bool add_predicate = !x_match;                 // CORRECT: only x must differ
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: For Each PIL Column, Verify Tracegen Assignment

```bash
# Find column declarations in PIL
grep -n "pol commit" barretenberg/cpp/pil/vm2/<component>.pil

# Check each is set in tracegen
grep -n "row\\.column_name" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

### Step 2: For Each Constraint, Trace to Tracegen

For each PIL constraint:
- What values does the constraint use?
- How are those values computed in tracegen?
- Do they satisfy the constraint for all code paths?

```bash
# Find constraints
grep -n "#\[" barretenberg/cpp/pil/vm2/<component>.pil

# Find corresponding tracegen logic
grep -rn "row\\." barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

### Step 3: Check All Code Paths

Verify trace generation handles:
- Normal execution path
- Error handling paths
- Edge cases (zero values, max values, empty collections)
- Boundary conditions

### Step 4: Verify Event Handling

```bash
# Find event types
grep -rn "struct.*Event\|enum.*Event" barretenberg/cpp/src/barretenberg/vm2/simulation/ --include="*.hpp"

# Find event processing
grep -rn "process.*event\|handle.*event" barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

Verify:
- Each simulation event type has tracegen handler
- Event fields map correctly to trace columns
- Error events emit proper trace rows

### Step 5: Check Type Conversions

```bash
# Find potentially dangerous casts
grep -rn "static_cast\|reinterpret_cast" barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

Verify:
- Field elements vs integers handled correctly
- Signed vs unsigned conversions safe
- Bit widths (64-bit vs field) considered

### Step 6: Verify Selector Toggles

```bash
# Find selector assignments in tracegen
grep -n "sel_.*= 1\|sel_.*= true" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp

# Compare with PIL selector usage
grep -n "sel_" barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 7: Derive Selector Conditions from PIL

For constraints like `sel = A + B + C` (sum of selectors equals parent selector):
1. Each sub-selector must be boolean and mutually exclusive
2. Work backwards: when should each be 1?
3. Verify tracegen boolean conditions match the derived requirements

Example: `sel = double_op + add_op + INFINITY_PRED` where:
- `double_op = x_match * y_match` → both coords match
- `INFINITY_PRED = x_match * (1 - y_match)` → x matches, y doesn't
- `add_op` → must be 1 in remaining case: `x_match = 0`

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Missing Column

```cpp
// VULNERABLE: Column not set
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
    // Missing: row.a_inv = compute_inverse(event.a);
    // PIL constraint will fail!
}
```

### Vulnerable Pattern: Wrong Computation

```cpp
// VULNERABLE: Incorrect computation
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// Field subtraction can produce large values that don't fit in uint64_t!
```

### Vulnerable Pattern: Missing Event Handler

```cpp
// VULNERABLE: Error event not handled
void process(const Event& event, Row& row) {
    switch (event.type) {
        case EventType::Normal:
            handle_normal(event, row);
            break;
        // Missing: case EventType::Error: handle_error(...)
    }
}
```

### Secure Pattern: Complete Column Assignment

```cpp
// SECURE: All columns set
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
    row.a_inv = event.a != FF::zero() ? event.a.invert() : FF::zero();
}
```

### Secure Pattern: Correct Field Arithmetic

```cpp
// SECURE: Keep as field element
row.tag_diff = FF(tag_a) - FF(tag_b);  // Field subtraction
```

### Secure Pattern: Complete Event Handling

```cpp
// SECURE: All events handled
void process(const Event& event, Row& row) {
    switch (event.type) {
        case EventType::Normal:
            handle_normal(event, row);
            break;
        case EventType::Error:
            handle_error(event, row);
            break;
        default:
            throw std::runtime_error("Unknown event type");
    }
}
```

## Historical Examples

### Example 1: Missing Column (PR #18864)

```cpp
// BEFORE: Column not set
// execution_batched_tags_diff_inv was never set in tracegen

// AFTER: Properly set
row.execution_batched_tags_diff_inv = compute_inv(...);
```
**Impact**: Constraint using this column always fails.

### Example 2: Incorrect Boolean (PR #19001)

```cpp
// BEFORE: Wrong boolean used for selector
row.sel_batched_diff = some_condition;
// Should have been: different_condition

// AFTER: Correct condition
row.sel_batched_diff = correct_condition;
```
**Impact**: Wrong selector toggled, lookup/constraint fails.

### Example 3: Simulation-Tracegen Mismatch (PR #19254)

```cpp
// BEFORE: Simulation crashes on edge case
const ContractInstance& instance = maybe_instance.value();
// Crashes when maybe_instance is nullopt!

// AFTER: Handle missing case
auto instance = maybe_instance.value_or(ContractInstance{});
```
**Impact**: Valid execution crashes before trace generation.

### Example 4: Wrong Error Event (PR #18864)

```cpp
// BEFORE: Wrong exception type thrown
throw std::runtime_error("SHA256 error");
// Caller catches Sha256CompressionException, not runtime_error!

// AFTER: Correct exception
throw Sha256CompressionException("SHA256 error");
```
**Impact**: Error handling path broken, trace not generated.

### Example 5: Wrong Selector Condition (ECC add_predicate)

```cpp
// BEFORE: Required both coordinates to differ
bool add_predicate = (!x_match && !y_match);

// AFTER: Only x-coordinate matters (derived from PIL constraint)
bool add_predicate = !x_match;
```
**Impact**: Adding points with same y but different x (possible via cube roots of unity) failed constraint `sel = double_op + add_op + INFINITY_PRED`.

## Test Patterns

### Test 1: Valid Execution Produces Valid Trace

```cpp
TEST_F(ComponentTest, PositiveValidExecution)
{
    PrecomputedTraceBuilder precomputed;
    ComponentTraceBuilder builder;

    auto event = create_valid_event();

    TestTraceContainer trace;
    precomputed.process(trace);
    builder.process(event, trace);

    // All constraints should pass
    check_relation<ComponentRelation>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

### Test 2: Edge Case Produces Valid Trace

```cpp
TEST_F(ComponentTest, PositiveEdgeCase)
{
    auto event = create_edge_case_event();

    TestTraceContainer trace;
    builder.process(event, trace);

    // Edge case should also produce valid trace
    check_relation<ComponentRelation>(trace);
}
```

### Test 3: Error Case Produces Valid Trace

```cpp
TEST_F(ComponentTest, PositiveErrorCase)
{
    auto event = create_error_event();

    TestTraceContainer trace;
    builder.process(event, trace);

    // Error case should produce valid trace with error flag set
    check_relation<ComponentRelation>(trace);
    EXPECT_EQ(trace.get(C::sel_error, 0), 1);
}
```

## Audit Checklist

1. **For each PIL column, verify tracegen assignment**:
   - [ ] Column is assigned in tracegen
   - [ ] Value computation is correct
   - [ ] All code paths set the column

2. **For each constraint, verify satisfaction**:
   - [ ] Tracegen produces values that satisfy constraint
   - [ ] Normal path satisfies constraint
   - [ ] Error path satisfies constraint

3. **Check all code paths**:
   - [ ] Normal execution path
   - [ ] Error handling paths
   - [ ] Edge cases (zero, max, empty)
   - [ ] Boundary conditions

4. **Verify event handling**:
   - [ ] All event types have handlers
   - [ ] Event fields map to correct columns
   - [ ] Error events produce valid traces

5. **Check type conversions**:
   - [ ] Field element arithmetic correct
   - [ ] No unsafe integer casts
   - [ ] Bit widths considered

6. **Verify selector toggles**:
   - [ ] Selectors set on correct conditions
   - [ ] No missing selector assignments

7. **Derive and verify selector conditions**:
   - [ ] For `sel = A + B + C` patterns, derive when each sub-selector should be 1
   - [ ] Verify tracegen boolean logic matches derived conditions
   - [ ] Consider edge cases (e.g., domain-specific math like cube roots of unity)

## Fix Patterns

### Fix 1: Add Missing Column

```cpp
void process_event(const Event& event, Row& row) {
    // ... existing assignments ...
    row.missing_column = compute_value(event);
}
```

### Fix 2: Fix Value Computation

```cpp
// BEFORE: Wrong computation
row.value = static_cast<uint32_t>(a - b);

// AFTER: Correct computation (field arithmetic)
row.value = FF(a) - FF(b);
```

### Fix 3: Handle Missing Event

```cpp
void process_event(const Event& event, Row& row) {
    if (event.type == EventType::Normal) {
        handle_normal(event, row);
    } else if (event.type == EventType::Error) {
        handle_error(event, row);  // Add this!
    }
}
```

### Fix 4: Fix Selector Toggle

```cpp
// Toggle selector on correct condition
row.sel_special = (event.condition == ExpectedValue);
```

## Debugging Tips

1. **Print trace row when constraint fails**:
   ```cpp
   // In test, log the failing row
   std::cerr << "Row " << i << ": " << row << std::endl;
   ```

2. **Compare expected vs actual**:
   ```cpp
   // Add debug output in tracegen
   LOG("Setting column_a = " << value);
   ```

3. **Check constraint evaluation**:
   ```cpp
   // Evaluate constraint manually
   auto result = lhs - rhs;  // Should be 0
   if (result != 0) { LOG("Constraint violated: " << result); }
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

Tracegen-PIL alignment is critical in:
- **Tracegen files**: `barretenberg/cpp/src/barretenberg/vm2/tracegen/*.cpp`
- **Simulation files**: `barretenberg/cpp/src/barretenberg/vm2/simulation/*.cpp`
- **Event definitions**: `barretenberg/cpp/src/barretenberg/vm2/simulation/events.hpp`
- **All PIL files**: `barretenberg/cpp/pil/vm2/**/*.pil`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/14-tracegen-pil-alignment.md)
- [Missing Error Gating Skill](../vm2-audit-missing-error-gating/SKILL.md)
- [Optional Value Safety Skill](../vm2-audit-optional-value-safety/SKILL.md)
