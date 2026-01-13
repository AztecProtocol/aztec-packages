---
name: vm2-audit-tag-validation
description: Audit VM2/AVM PIL files for tag validation gaps. Medium severity soundness issue where type tags (U8, U16, U32, U64, U128, FF) are not properly validated before operations or tag mismatch errors are not handled correctly, enabling type confusion, invalid arithmetic, and range check bypass.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Tag Validation Audit

## Purpose
Detect missing or incomplete type tag validation that enables type confusion, range check bypass, or memory corruption.

## When to Use
- Auditing PIL files with arithmetic/bitwise operations
- Reviewing operations that require tag matching (ADD, SUB, MUL, etc.)
- Checking memory operations for tag consistency
- Analyzing hash functions that expect specific input types

## When NOT to Use
- Non-tag-related PIL audits (use specific audit skill instead)

## Tag System

```pil
// Tags: U1=1, U8=2, U16=3, U32=4, U64=5, U128=6, FF=7
// Validation ensures: input tags match, output tag correct, memory consistent
```

## Workflow

### Step 1: Identify Tag-Related Columns

```bash
grep -rn "pol commit.*tag\|_tag\|tag_" pil/vm2/ --include="*.pil"
grep -rn "sel_tag_err\|tag_err\|tag_mismatch" pil/vm2/ --include="*.pil"
```

Operations requiring validation: ADD, SUB, MUL, DIV, MOD, AND, OR, XOR, NOT, SHL, SHR, EQ, LT, LTE, LOAD, STORE, Poseidon2, SHA256, Keccak

### Step 2: Verify Input Tag Validation

Expected pattern:
```pil
// Single input
sel * (input_tag - EXPECTED_TAG) * (1 - sel_tag_err) = 0;

// Binary operation - both inputs must match
sel * (1 - tag_match_indicator) * (1 - sel_tag_err) = 0;
```

Check for missing validation - operations that use tags without constraining them.

### Step 3: Verify Tag Mismatch Triggers Error

Requirements:
- Tag mismatch => `sel_tag_err = 1`
- Tag match => `sel_tag_err = 0`
- Bidirectional (mismatch <=> error)

Missing bidirectionality allows malicious prover to claim error when tags match.

### Step 4: Verify Output Tag Constrained

Output tag rules:
- ADD/SUB/MUL: Same as input
- DIV/MOD: Same as input (or error on FF)
- Comparison (EQ, LT): U1
- Field ops: FF
- Bitwise: Same as input

```pil
sel_add * (1 - sel_err) * (c_tag - a_tag) = 0;
sel_eq * (1 - sel_err) * (c_tag - Tag::U1) = 0;
```

### Step 5: Verify Error Gates Processing

Lookups/permutations must gate on `(1 - sel_tag_err)`. No computation on tag error.

### Step 6: Check Tracegen Tag Handling

```bash
grep -rn "tag\|Tag::" --include="*.cpp" src/barretenberg/vm2/simulation/
```

Verify: Tag differences as field elements (NOT cast to uint64_t), no overflow assumptions.

## Vulnerability Patterns

### Missing Tag Check
```pil
// VULNERABLE: No input tag validation
sel * (a + b - c) = 0;  // What if a has wrong tag?
```

### Incorrect Tag Arithmetic (Tracegen)
```cpp
// VULNERABLE: Tag diff can be ~p, not fit in 64 bits
auto tag_diff = static_cast<uint64_t>(tag_a - tag_b);

// SECURE: Keep as field element
auto tag_diff = tag_a - tag_b;
```

### Non-Bidirectional Error
```pil
// VULNERABLE: Only one direction
(1 - TAG_MATCH) * (1 - sel_tag_err) = 0;  // Mismatch => error
// Missing: TAG_MATCH * sel_tag_err = 0;  // Match => no error
```

## Real Bug Examples

### SHA256 Batched Tag Checks (PR #19244)
```cpp
// BUG: uint64_t cast loses precision for field tag differences
auto tag_diff = static_cast<uint64_t>(tag_a - tag_b);
// Tag::FF - Tag::U32 = p - 4, overflows!
```

### Poseidon2 Missing Tag Check (PR #19300)
```pil
// BUG: Inputs not validated to be FF type
// Could process non-field elements as field elements
```

### ALU NOT Output Tag (PR #18192)
```pil
// BUG: Output tag for NOT unconstrained for integer types
// For field: output tag = FF; For integer: output tag = input tag
```

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High
- **Completeness** (honest prover fails): Low to Critical based on reachability

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tag-validation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format

- **ID**: `vm2-audit-tag-validation-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (Required)

Write `vm2-audit-tag-validation.json` to specified output directory:

```json
{
  "skill": "vm2-audit-tag-validation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tag-validation-filename-123-issue-type",
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
