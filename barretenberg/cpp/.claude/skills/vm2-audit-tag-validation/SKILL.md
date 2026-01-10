---
name: vm2-audit-tag-validation
description: Audit VM2/AVM PIL files for tag validation gaps. Medium severity soundness issue where type tags (U8, U16, U32, U64, U128, FF) are not properly validated before operations or tag mismatch errors are not handled correctly, enabling type confusion, invalid arithmetic, and range check bypass.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tag Validation Audit

Audits for tag validation gaps - type tags (U8-U128, FF) not validated before operations. Enables type confusion, range check bypass, memory corruption.

## Tag System Overview

```pil
// Tags in AVM:
// U1 = 1, U8 = 2, U16 = 3, U32 = 4, U64 = 5, U128 = 6, FF = 7

// Tag checking verifies:
// 1. Input operands have expected tags
// 2. Output has correct tag for operation
// 3. Memory reads/writes have consistent tags
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Operations with Tag Requirements

```bash
# Find tag-related columns
grep -rn "pol commit.*tag\|_tag\|tag_" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find tag error flags
grep -rn "sel_tag_err\|tag_err\|tag_mismatch" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Operations requiring tag validation:
- **Arithmetic**: ADD, SUB, MUL, DIV, MOD
- **Bitwise**: AND, OR, XOR, NOT, SHL, SHR
- **Comparison**: EQ, LT, LTE, GT, GTE
- **Memory**: LOAD, STORE
- **Hashing**: Poseidon2, SHA256, Keccak (expect FF inputs)

### Step 2: Verify Input Tag Validation

For each operation, check that input tags are validated:

```bash
# Look for input tag constraints
grep -rn "a_tag\|b_tag\|input_tag" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for tag match checks
grep -rn "tag.*match\|tag.*==\|tag.*-.*tag" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected patterns:
```pil
// Single input tag check
sel * (input_tag - EXPECTED_TAG) * (1 - sel_tag_err) = 0;

// Binary operation tag match
sel * (a_tag - b_tag) * tag_match_inv * (1 - sel_tag_err) = 0;
```

### Step 3: Verify Tag Mismatch Triggers Error

```bash
# Look for tag error constraints
grep -rn "sel_tag_err\|tag_err" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify:
- Tag mismatch sets `sel_tag_err = 1`
- Tag match means `sel_tag_err = 0`
- Error is bidirectional (mismatch ⟺ error)

### Step 4: Verify Output Tag Constrained

```bash
# Look for output tag constraints
grep -rn "c_tag\|output_tag\|result_tag" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Output tag rules:
- ADD/SUB/MUL: Same as input tag
- DIV/MOD: Same as input tag (or error on field type)
- Comparison (EQ, LT): U1
- Field ops: FF
- Bitwise: Same as input (or FF for NOT on FF)

### Step 5: Verify Error Gates Further Processing

```bash
# Check that tag errors gate lookups/permutations
grep -rn "sel_tag_err\|tag_err" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "commit"
```

Verify:
- Lookups/permutations gated by `(1 - sel_tag_err)`
- No computation proceeds on tag error

### Step 6: Check Tag Value Assumptions in Tracegen

```bash
# Find tag handling in simulation/tracegen
grep -rn "tag\|Tag::" --include="*.cpp" barretenberg/cpp/src/barretenberg/vm2/simulation/<component>*.cpp
```

Verify:
- Tag differences handled as field elements (not cast to uint64_t)
- No overflow assumptions about tag arithmetic
- Tags compared properly

## Tag Checking Patterns

### Pattern 1: Input Tag Validation

```pil
// Verify input has expected tag
pol commit input_tag;
pol commit sel_tag_err;

#[INPUT_TAG_CHECK]
sel * (input_tag - EXPECTED_TAG) * (1 - sel_tag_err) = 0;
```

### Pattern 2: Binary Operation Tag Match

```pil
// Both inputs must have same tag
pol commit a_tag;
pol commit b_tag;
pol tag_match_indicator;  // 1 iff a_tag == b_tag

#[TAG_MATCH_CHECK]
sel * (1 - tag_match_indicator) * (1 - sel_tag_err) = 0;
```

### Pattern 3: Output Tag Derivation

```pil
// Output tag based on operation
// ADD/SUB/MUL: same as input
// Comparison: U1
// Field ops: FF

#[OUTPUT_TAG_ADD]
sel_add * (1 - sel_err) * (c_tag - a_tag) = 0;

#[OUTPUT_TAG_EQ]
sel_eq * (1 - sel_err) * (c_tag - Tag::U1) = 0;
```

## Patterns

### Vulnerable Pattern: Incorrect Tag Value Assumptions

```cpp
// VULNERABLE: Incorrect assumption about tag values
auto tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// Tag::FF - Tag::U32 can be p - 4, not fitting in 64 bits!
```

### Secure Pattern: Complete Tag Validation

```pil
// SECURE: Explicit tag matching for binary ops
pol TAG_MATCH = (a_tag == b_tag indicator);
pol commit sel_tag_err;
#[TAG_ERR_ON_MISMATCH]
(1 - TAG_MATCH) * (1 - sel_tag_err) = 0;  // Mismatch => error
#[NO_TAG_ERR_ON_MATCH]
TAG_MATCH * sel_tag_err = 0;  // Match => no error
```

## Examples

### Example 1: SHA256 Batched Tag Checks (PR #19244)

```cpp
// BEFORE: Invalid assumption about tag value size
auto tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// Tag::FF - Tag::U32 can be p - 4, not fitting in 64 bits!

// AFTER: Proper field element handling
auto tag_diff = tag_a - tag_b;  // Keep as field element
```
**Impact**: Incorrect tag validation in SHA256.

### Example 2: Poseidon2 Tag Check (PR #19300)

```pil
// BEFORE: Missing tag check found by fuzzer
// No validation that inputs have expected FF tag

// AFTER: Added proper tag check
#[TAG_CHECK]
sel * (input_tag - Tag::FF) * (1 - sel_tag_err) = 0;
```
**Impact**: Could process non-field elements as field elements.

### Example 3: ALU NOT Output Tag (PR #18192)

```pil
// BEFORE: Output tag for NOT not constrained when non-field
// For field type: output tag should be field
// For integer type: output tag should match input
// Was triggering tag error instead of constraining correctly

// AFTER: Proper output tag constraint
```
**Impact**: Incorrect output type for bitwise NOT.

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
