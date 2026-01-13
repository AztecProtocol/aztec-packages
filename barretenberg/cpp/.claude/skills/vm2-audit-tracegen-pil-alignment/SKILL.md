---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tracegen-PIL Alignment Audit

Audits for tracegen-PIL misalignment - **completeness issue** where trace generation doesn't match PIL constraints, causing valid executions to fail verification.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

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

### Type 5: Wrong Selector Condition (Partition Derivation Error)

When PIL defines `sel = A + B + C` (partition), derive each sub-selector algebraically:

```cpp
// PIL: sel = double_op + add_op + INFINITY_PRED
// Where: double_op = x_match * y_match, INFINITY_PRED = x_match * (1 - y_match)
// Derivation: add_op = sel - x_match, so add_op = 1 when x_match = 0

bool add_predicate = (!x_match && !y_match);  // WRONG
bool add_predicate = !x_match;                 // CORRECT
```

### Type 6: Conditional Column Assignment Mismatch

PIL `column = flag * expr` requires tracegen to apply the same condition:

```cpp
// PIL: member_write_offset = is_valid * (dst_offset + 1)
row.member_write_offset = dst_offset + 1;                        // WRONG
row.member_write_offset = is_valid ? (dst_offset + 1) : 0;       // CORRECT
```

### Type 7: Wrong Selector Used in Accumulation

```cpp
// PIL uses should_apply_indirection[i], tracegen uses wrong selector
batched_tags_diff += FF(is_indirect_effective[i] ? 1 : 0) * ...;  // WRONG
if (should_apply_indirection[i]) { batched_tags_diff += ...; }    // CORRECT
```

### Type 8: False Positive - Start-Row-Only Columns (NO FIX NEEDED)

Columns without propagation are SAFE if influence is strictly limited to start rows.

```pil
// SAFE: offset gated by sel_start, never referenced when sel_start=0
offset_plus_size = sel_start * (offset + copy_size);
```

**Validation Protocol**:
1. Find ALL references (direct + transitive via intermediate defs like `tmp = col + x`)
2. Verify EVERY reference is gated by a start-row selector (`sel_start * expr`)
3. Confirm gating selector is boolean-constrained and only active on start rows
4. Check column is NOT in lookups/permutations outside start-row gating
5. IF any ungated usage OR next-row reference (`col'`) → Flag Vulnerability
6. ELSE → Mark False Positive (Start-Row-Only Input)

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

### Step 7: Derive Selector Conditions from PIL Partitions

For `sel = A + B + C` partitions: algebraically derive each sub-selector, then verify tracegen boolean matches.

```bash
grep -rn "sel.*=.*+.*+" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 8: Check Conditional Column Assignments

For PIL `column = flag * expr`, verify tracegen applies the same condition.

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

### Example 5: Wrong Partition Derivation - ECC add_predicate (PR #19471)

```cpp
// PIL: sel = double_op + add_op + INFINITY_PRED
// Algebraic derivation shows: add_op = 1 when x_match = 0
bool add_predicate = (!x_match && !y_match);  // WRONG
bool add_predicate = !x_match;                 // CORRECT
```

### Example 6: Conditional Assignment - GetContractInstance (PR #19527)

```cpp
// PIL: member_write_offset = is_valid * (dst_offset + 1)
row.member_write_offset = dst_offset + 1;                    // WRONG
row.member_write_offset = is_valid ? (dst_offset + 1) : 0;   // CORRECT
```

### Example 7: Wrong Selector in Accumulation (Commit 9fa812c)

```cpp
// PIL uses should_apply_indirection, tracegen used is_indirect_effective
if (should_apply_indirection[i]) { ... }  // CORRECT selector
```

## Debugging Tips

1. **Print trace row when constraint fails** - log the failing row values
2. **Compare expected vs actual** - add debug output in tracegen
3. **For selector partitions** - verify sum of sub-selectors equals parent selector

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-tracegen-pil-alignment-filename-123-issue-type` (MUST use full skill name: `vm2-audit-tracegen-pil-alignment`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-tracegen-pil-alignment.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tracegen-pil-alignment-filename-123-issue-type",
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

For no findings:
```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.
