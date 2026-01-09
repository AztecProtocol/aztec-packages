---
name: vm2-audit-tag-validation
description: Audit VM2/AVM PIL files for tag validation gaps. Medium severity soundness issue where type tags (U8, U16, U32, U64, U128, FF) are not properly validated before operations or tag mismatch errors are not handled correctly, enabling type confusion, invalid arithmetic, and range check bypass.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tag Validation Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for tag validation gaps. Type tags (indicating whether a value is U8, U16, U32, U64, U128, or FF) are not properly validated before operations or the tag mismatch error is not handled correctly.

**Bug Type**: Soundness
**Severity**: Medium
**Frequency**: Medium

## Why This is Important

Missing tag validation enables type confusion attacks:
- **Type confusion enables invalid arithmetic**: Treat U8 as U128
- **Wrong tag can bypass range checks**: Claim value fits in smaller type
- **Incorrect output types corrupt memory**: Write with wrong tag

## Tag System Overview

```pil
// Tags in AVM:
// U1 = 1, U8 = 2, U16 = 3, U32 = 4, U64 = 5, U128 = 6, FF = 7

// Tag checking verifies:
// 1. Input operands have expected tags
// 2. Output has correct tag for operation
// 3. Memory reads/writes have consistent tags
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Operation Without Tag Check

```pil
// VULNERABLE: Operation proceeds without tag check
pol commit a_tag;
pol commit b_tag;
// No constraint that a_tag == b_tag for binary operations!
```

### Vulnerable Pattern: Tag Mismatch Doesn't Trigger Error

```pil
// VULNERABLE: Tag mismatch doesn't trigger error
pol commit sel_tag_err;
// sel_tag_err not constrained to 1 when tags mismatch
```

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

// SECURE: Output tag constrained
#[OUTPUT_TAG]
sel * (1 - sel_err) * (c_tag - expected_tag) = 0;
```

## Historical Examples

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

## Audit Checklist

1. **Identify all operations with tag requirements**:
   - [ ] Arithmetic (ADD, SUB, MUL, DIV)
   - [ ] Bitwise (AND, OR, XOR, NOT, SHL, SHR)
   - [ ] Comparison (EQ, LT, LTE)
   - [ ] Memory operations
   - [ ] Hashing operations

2. **For each operation, verify**:
   - [ ] Input tags validated
   - [ ] Tag mismatch triggers error
   - [ ] Output tag constrained
   - [ ] Error gates further processing

3. **Check tag error handling**:
   - [ ] `sel_tag_err` properly set on mismatch
   - [ ] `sel_tag_err = 0` enforced on match
   - [ ] Lookups/permutations gated by tag error
   - [ ] No computation proceeds on tag error

4. **Verify tag value assumptions**:
   - [ ] Tag differences handled as field elements
   - [ ] No overflow assumptions about tag arithmetic
   - [ ] No uint64_t casts on tag differences

5. **Check tracegen tag handling**:
   - [ ] Tags read from memory correctly
   - [ ] Tags compared properly (as field elements)
   - [ ] Error events emitted on mismatch

## Fix Pattern

```pil
// Add tag validation

// Input tag check
#[INPUT_TAG_A]
sel * (a_tag - EXPECTED) * (1 - sel_tag_err) = 0;

// Binary operation tag match
#[TAG_MATCH]
sel * (a_tag - b_tag) * tag_match_inv * (1 - sel_tag_err) = 0;

// Output tag
#[OUTPUT_TAG]
sel * (1 - sel_err) * (c_tag - output_tag_for_op) = 0;

// Gate by tag error
pol SEL_NO_TAG_ERR = sel * (1 - sel_tag_err);
#[GATED_LOOKUP]
SEL_NO_TAG_ERR { ... } in other.sel { ... };
```

## Common Locations to Audit

Tag validation is critical in:
- **ALU**: `alu.pil` - all arithmetic and bitwise operations
- **Comparisons**: `gt.pil`, comparison operations
- **Memory**: `memory.pil` - load/store tag consistency
- **Hashing**: `poseidon2.pil`, `sha256.pil`, `keccak.pil` - expect FF inputs
- **Execution**: `execution.pil` - operand tag validation

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/12-tag-validation.md)
- [Missing Error Gating Skill](../vm2-audit-missing-error-gating/SKILL.md)
- [Range Check Overflow](../../../pil/vm2/claude-skills/13-range-check-overflow.md)

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | vm2-audit-tag-validation |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-tag-validation-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "vm2-audit-tag-validation",
  "finding_prefix": "vm2-audit-tag-validation",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-tag-validation-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `vm2-audit-tag-validation-[filename]-[line]-[subtype]`
- Example: `vm2-audit-tag-validation-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
