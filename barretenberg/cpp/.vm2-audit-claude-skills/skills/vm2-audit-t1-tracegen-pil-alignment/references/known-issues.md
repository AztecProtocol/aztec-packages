# Known Tracegen-PIL Alignment Issues

This file contains synthetic examples illustrating each misalignment type. Use these as reference when auditing for similar patterns.

## Example 1: Missing Column

**Type**: Missing Column Assignment

```cpp
// BEFORE: Column not set
// inverse_helper was never set in tracegen

// AFTER: Properly set
row.inverse_helper = compute_inv(...);
```

**Impact**: Constraint using this column always fails - the inverse column is needed for zero-check patterns but tracegen never computed it.

**Detection**: Search for `pol commit` columns that have no corresponding `row.<col> =` in tracegen.

---

## Example 2: Incorrect Boolean

**Type**: Wrong Selector Condition

```cpp
// BEFORE: Wrong boolean used for selector
row.sel_diff_flag = some_condition;
// Should have been: different_condition

// AFTER: Correct condition
row.sel_diff_flag = correct_condition;
```

**Impact**: Wrong selector toggled, lookup/constraint fails because the selector fires on wrong rows.

**Detection**: Compare PIL selector definitions with tracegen boolean expressions.

---

## Example 3: Simulation-Tracegen Mismatch

**Type**: Event Not Handled / Crash on Edge Case

```cpp
// BEFORE: Simulation crashes on edge case
const ContractData& data = maybe_data.value();
// Crashes when maybe_data is nullopt!

// AFTER: Handle missing case
auto data = maybe_data.value_or(ContractData{});
```

**Impact**: Valid execution crashes before trace generation even starts. This is a completeness bug that prevents honest provers from generating traces.

**Detection**: Look for `.value()` calls on optionals without prior checks.

---

## Example 4: Wrong Error Event

**Type**: Exception Type Mismatch

```cpp
// BEFORE: Wrong exception type thrown
throw std::runtime_error("Gadget error");
// Caller catches GadgetSpecificException, not runtime_error!

// AFTER: Correct exception
throw GadgetSpecificException("Gadget error");
```

**Impact**: Error handling path broken, trace not generated for valid error cases. The catch block never triggers because the wrong exception type is thrown.

**Detection**: Check that exception types thrown match what callers catch.

---

## Example 5: Wrong Partition Derivation

**Type**: Wrong Partition Derivation

```pil
// PIL defines:
sel = double_op + add_op + SPECIAL_PRED
// Where:
double_op = match_x * match_y
SPECIAL_PRED = match_x * (1 - match_y)
```

**Algebraic derivation**:
```
add_op = sel - double_op - SPECIAL_PRED
add_op = sel - match_x * match_y - match_x * (1 - match_y)
add_op = sel - match_x * (match_y + 1 - match_y)
add_op = sel - match_x
// Therefore: add_op = 1 when sel = 1 and match_x = 0
```

```cpp
// WRONG (intuitive but incorrect):
bool add_predicate = (!match_x && !match_y);

// CORRECT (algebraically derived):
bool add_predicate = !match_x;
```

**Impact**: Selector fires on wrong rows, causing constraint failures.

**Detection**: For any `sel = A + B + C` partition, algebraically solve for each sub-selector and compare with tracegen.

---

## Example 6: Conditional Assignment

**Type**: Missing Conditional Gating

```pil
// PIL: output_offset = is_valid * (dst_offset + 1)
```

```cpp
// WRONG: Unconditional assignment
row.output_offset = dst_offset + 1;

// CORRECT: Apply same condition as PIL
row.output_offset = is_valid ? (dst_offset + 1) : 0;
```

**Impact**: When `is_valid = 0`, PIL expects `output_offset = 0`, but tracegen sets it to `dst_offset + 1`. Constraint fails.

**Detection**: For each `col = flag * expr` in PIL, verify tracegen applies the same conditional.

---

## Example 7: Wrong Selector in Accumulation

**Type**: Wrong Selector Used

```cpp
// PIL uses apply_indirection[i] for accumulation
// Tracegen was using is_effective[i]

// WRONG:
accumulated_diff += FF(is_effective[i] ? 1 : 0) * ...;

// CORRECT:
if (apply_indirection[i]) { accumulated_diff += ...; }
```

**Impact**: Accumulator computed with wrong values, constraint fails.

**Detection**: When tracegen has loops that accumulate based on selectors, verify the selector name matches PIL exactly.

---

## Vulnerable vs Secure Pattern Summary

### Vulnerable: Missing Column
```cpp
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
    // Missing: row.a_inv = compute_inverse(event.a);
}
```

### Secure: Complete Column Assignment
```cpp
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
    row.a_inv = event.a != FF::zero() ? event.a.invert() : FF::zero();
}
```

### Vulnerable: Wrong Field Arithmetic
```cpp
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// tag_a - tag_b can be negative in field arithmetic!
```

### Secure: Correct Field Arithmetic
```cpp
row.tag_diff = FF(tag_a) - FF(tag_b);  // Field subtraction
```

### Vulnerable: Missing Event Handler
```cpp
void process(const Event& event, Row& row) {
    switch (event.type) {
        case EventType::Normal:
            handle_normal(event, row);
            break;
        // Missing: case EventType::Error!
    }
}
```

### Secure: Complete Event Handling
```cpp
void process(const Event& event, Row& row) {
    switch (event.type) {
        case EventType::Normal:
            handle_normal(event, row);
            break;
        case EventType::Error:
            handle_error(event, row);
            break;
    }
}
```
