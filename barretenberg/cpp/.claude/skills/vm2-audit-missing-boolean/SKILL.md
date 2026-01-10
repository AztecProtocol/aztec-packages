---
name: vm2-audit-missing-boolean
description: Audit VM2/AVM PIL files for missing boolean selector constraints. Critical soundness issue where columns used as booleans lack `sel * (1 - sel) = 0` constraints, allowing field arithmetic exploits including error cancellation, conditional logic corruption, and accumulator manipulation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Boolean Selector Audit

Audits for missing boolean constraints on selector columns. This is a **critical soundness vulnerability** that enables field arithmetic exploits:

### 1. Error Cancellation (Most Common)

```pil
// Example: Error aggregation
sel_err = sel_out_of_bound + sel_wrong_tag;

// If sel_wrong_tag is not constrained boolean, prover can set:
//   sel_out_of_bound = 1
//   sel_wrong_tag = p - 1  (where p is the field modulus)
//   sel_err = 1 + (p - 1) = 0  (mod p)
// The error is cancelled out!
```

### 2. Conditional Logic Corruption (MUX Pattern)

```pil
// Select between two values based on selector
result = sel * A + (1 - sel) * B;

// If sel is not boolean, prover can set sel = 2:
//   result = 2*A + (1-2)*B = 2*A - B
// Result is neither A nor B - completely corrupted!
```

### 3. Accumulator/Counter Manipulation

```pil
// Counting occurrences
count = sel_a + sel_b + sel_c;

// If selectors aren't boolean, prover can set arbitrary counts
// e.g., sel_a = 5 gives count = 5 even if only one event occurred
```

**Important clarification**: `sel * expr = 0` with `sel = 2` does NOT allow bypassing constraints (in a field, non-zero `sel` simply means `expr = 0`). The vulnerability is specifically in **additive expressions** and **multiplicative factor uses** where non-boolean values produce incorrect results.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Boolean Columns

```bash
# Find @boolean annotations and selector declarations
grep -rn "@boolean\|pol commit.*sel\|pol commit is_" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Note that this is just a first pass. There may be columns that are used as booleans without being named or annotated as such! After checking via grep, double check by reviewing the usage of each column.

### Step 2: Verify Boolean Constraints Exist

For each boolean column, verify one of these applies:

1. **Explicit constraint**: `col * (1 - col) = 0;`
2. **Lookup to binary table**: Document this with a comment
3. **Derived from other booleans**: Must prove the derivation preserves boolean property

```bash
# Search for boolean constraints on a specific column
grep -rn "my_selector.*1 - my_selector" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Check for Gated Boolean Constraints

Gated boolean constraints are acceptable IF all uses are also gated:

```pil
// ACCEPTABLE: Gated boolean constraint with all uses also gated
sel * my_bool * (1 - my_bool) = 0;
sel * (output - my_bool * value) = 0;  // Also gated by sel

// VULNERABLE: Gated boolean but ungated use
sel * my_bool * (1 - my_bool) = 0;  // Gated
other_expr + my_bool = 0;            // UNGATED USE - VULNERABLE!
```

### Step 4: Document Findings

Record for each boolean column:
- Column name and location
- How it's constrained (explicit, lookup, derived)
- Whether constraint is gated and if all uses are also gated
- Any implicit constraints from other relations

## Patterns

### Vulnerable Pattern

```pil
// VULNERABLE: Boolean annotation without constraint
pol commit my_selector; // @boolean
// VULNERABLE: Used as boolean but not constrained
pol commit is_active;
is_active * some_expression = 0;  // Assumes is_active in {0, 1}
```

### Secure Pattern

```pil
// SECURE: Explicit boolean constraint
pol commit my_selector; // @boolean
#[MY_SELECTOR_BOOL]
my_selector * (1 - my_selector) = 0;
// SECURE: Boolean via lookup (documented)
pol commit sel;
sel { sel } in precomputed.sel_binary { precomputed.binary_value };
```

## Examples

### Example 1: ECC Memory (PR #19256)
```pil
// ecc_mem.pil - sel not explicitly boolean constrained
pol commit sel;
// Missing: sel * (1 - sel) = 0;
```
**Fix**: Added explicit `sel * (1 - sel) = 0;`

### Example 2: ALU Shift Operations (PR #18192)
```pil
// Missing boolean for shift operation selectors
pol commit sel_op_shl;
pol commit sel_op_shr;
pol commit sel_shift_ops_no_overflow;
// None had boolean constraints
```
**Impact**: Could fake shift operation results.

### Example 3: To Radix Memory (PR #19256)
```pil
// to_radix_mem.pil - selector missing boolean
pol commit sel;
// Was missing boolean constraint
```

## Zero-Check Pattern (Special Case)

The zero-check pattern is a well-known vulnerability when the indicator isn't boolean:

```pil
// e = 1 iff x = 0
pol commit e;
pol commit inv;
x * (e * (1 - inv) + inv) - 1 + e = 0;

// If e is not constrained boolean, the check can be bypassed!
// MUST have: e * (1 - e) = 0;
```

Always verify boolean constraint exists on zero-check indicators.

## Exploitability Note

The actual exploitability of a missing boolean depends heavily on how the column is used in other relations. Focus on:
1. **Spotting** missing boolean constraints
2. **Checking** if the column appears in additive expressions
3. **Documenting** the finding for further analysis

Avoid over-claiming specific exploits without analyzing all related constraints.

## References

- [PR #19256](https://github.com/AztecProtocol/aztec-packages/pull/19256) - Missing Bool Selectors Fix
- [PR #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) - ALU Pre-Audit

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
