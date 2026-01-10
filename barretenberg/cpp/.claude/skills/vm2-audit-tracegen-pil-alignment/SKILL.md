---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tracegen-PIL Alignment Audit

Audits for tracegen-PIL misalignment - **completeness issue** where trace generation doesn't match PIL constraints, causing valid executions to fail verification.

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

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

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

## Patterns

### Vulnerable Pattern: Missing Column

```cpp
// VULNERABLE: Column not set
void process_event(const Event& event, Row& row) {
    row.sel = 1;
    row.a = event.a;
}
```

### Vulnerable Pattern: Wrong Computation

```cpp
// VULNERABLE: Incorrect computation
row.tag_diff = static_cast<uint64_t>(tag_a - tag_b);
```

### Vulnerable Pattern: Missing Event Handler

```cpp
// VULNERABLE: Error event not handled
void process(const Event& event, Row& row) {
    switch (event.type) {
        case EventType::Normal:
            handle_normal(event, row);
            break;
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
    }
}
```

## Examples

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

## REQUIRED OUTPUT FORMAT

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
      "severity": "critical",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "high",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->

For no findings:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
