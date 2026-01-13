---
name: vm2-audit-zero-check
description: Audit VM2/AVM PIL files for zero-check pattern violations. Soundness issue where the pattern used to create boolean indicators for equality checks (e.g., "e = 1 iff x = 0") is implemented incorrectly, allowing bypass of division-by-zero checks, fake equality comparisons, and conditional logic manipulation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Zero-Check Pattern Audit

Audits for zero-check pattern violations. The zero-check creates `e = 1 iff x = 0`. Incorrect implementation enables exploits.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Exploits

### 1. Bypass Division-by-Zero Checks

```pil
// If div_by_0 indicator is incorrectly implemented:
// Prover can claim divisor = 0 when it's not (force error path)
// Or claim divisor != 0 when it is (perform undefined division)
```

### 2. Fake Equality Comparisons

```pil
// For equality check: eq = 1 iff a == b
// Incorrect implementation lets prover claim a == b when a != b
// Or claim a != b when a == b
```

### 3. Manipulate Conditional Logic

```pil
// Zero-check indicators control conditional execution
// Faking them corrupts program flow
result = is_zero * zero_path + (1 - is_zero) * non_zero_path;
// With fake is_zero, result can be computed incorrectly
```

## The Correct Pattern

```pil
// Goal: e = 1 iff x = 0

pol commit x;      // Value to check
pol commit e;      // Equality indicator (1 if x = 0)
pol commit inv;    // Inverse of x (when x != 0)

// Constraint 1: e is boolean
#[E_BOOL]
e * (1 - e) = 0;

// Constraint 2: The zero-check relation
#[ZERO_CHECK]
x * (e * (1 - inv) + inv) - 1 + e = 0;

// Analysis:
// Case x = 0: 0 * (...) - 1 + e = 0  =>  e = 1  (correct!)
// Case x != 0: x * inv - 1 + e = 0
//   If inv = 1/x: x * (1/x) - 1 + e = 0  =>  e = 0  (correct!)
//   If e = 1: x * (1 - inv + inv) - 1 + 1 = x != 0  (violation!)
```

**Variants**: Equality check (`a == b`) uses `diff = a - b` as input. Division-by-zero uses the divisor as input. Same pattern applies.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Zero-Check Patterns

```bash
# Search for common zero-check indicator names
grep -rn "inv\|eq.*bool\|is_zero\|div_by_0\|_eq\|is_eq" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Search for zero-check formula pattern
grep -rn "(1 - inv)\|* inv.*- 1\|inverse" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

**Note**: Grep is not sufficient. You must manually review the PIL for:
- Zero checks (is value == 0?)
- One checks (is value == 1?)
- Equality checks (is a == b? which is essentially: is (a-b) == 0?)

### Step 2: Verify Three Required Components

For each zero-check pattern found, verify all three components exist:

1. **Boolean constraint on indicator**: `e * (1 - e) = 0`
2. **Zero-check relation**: `x * (e * (1 - inv) + inv) - 1 + e = 0`
3. **Inverse column exists and is used correctly**

```bash
# Check for boolean constraint on the indicator
grep -rn "indicator_name.*(1 - indicator_name)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Indicator Usage

When the indicator is used elsewhere, verify:
- When `e = 1`, `x` should always be 0
- When `e = 0`, `x` should never be 0

### Step 4: Check Tracegen Code

Review the corresponding tracegen/simulation code to verify:
- `e` is set to 1 iff x is 0
- `inv` is set to 1/x when x != 0 (any value when x = 0)

```bash
# Find tracegen for the component
grep -rn "inverse\|inv =\|is_zero\|eq =" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

## Vulnerable Patterns

### Pattern 1: Missing Boolean Constraint

```pil
// VULNERABLE: e not constrained boolean
pol commit e;
pol commit inv;
x * (e * (1 - inv) + inv) - 1 + e = 0;
// e could be any field value, breaking the check
```

### Pattern 2: Incorrect Formula

```pil
// VULNERABLE: Wrong formula - missing the inner term
x * inv - 1 + e = 0;

// Analysis:
// When x = 0: -1 + e = 0, so e = 1. OK.
// When x != 0 and inv = 1/x: 0 + e = 0. OK.
// BUT: When x != 0 and e = 1, prover sets inv = (1-e)/x = 0
// Then: x * 0 - 1 + 1 = 0. Passes but e = 1 when x != 0!
```

### Pattern 3: Missing Inverse Constraint

```pil
// VULNERABLE: inv not properly constrained
x * e = 0;  // e = 0 when x != 0, but...
(1 - e) * (x * inv - 1) = 0;  // Only checked when e = 0
// When x = 0, e must be 1, but not enforced!
```

### Pattern 4: Gated Boolean Without Gated Uses

```pil
// VULNERABLE: Boolean constraint gated but uses ungated
sel * e * (1 - e) = 0;  // Only enforced when sel = 1
e + other_value = 0;     // Uses e even when sel = 0!
```

## Examples

### Example 1: ALU Division by Zero

```pil
// Used in ALU for division
pol commit b;           // Divisor
pol commit div_by_0;    // 1 iff b = 0
pol commit b_inv;       // Inverse of b

#[DIV_BY_0_BOOL]
div_by_0 * (1 - div_by_0) = 0;

#[DIV_BY_0_CHECK]
b * (div_by_0 * (1 - b_inv) + b_inv) - 1 + div_by_0 = 0;
```

### Example 2: Field Greater-Than Comparison

```pil
// In gt.pil for comparing field elements
// Uses zero-check to detect equality case
pol commit is_eq;
pol commit diff_inv;

#[IS_EQ_BOOL]
is_eq * (1 - is_eq) = 0;

// Zero-check on (a - b)
#[EQ_CHECK]
(a - b) * (is_eq * (1 - diff_inv) + diff_inv) - 1 + is_eq = 0;
```

## Common Locations for Zero-Checks

Zero-check patterns typically appear in:
- **ALU**: Division by zero, equality comparisons
- **Memory**: Address equality for reads/writes
- **Control flow**: Conditional jumps based on zero
- **Greater-than comparisons**: Detecting equality case
- **Error handling**: Checking for error conditions

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-zero-check` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-zero-check-filename-123-issue-type` (MUST use full skill name: `vm2-audit-zero-check`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-zero-check.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-zero-check",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-zero-check-filename-123-issue-type",
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
  "skill": "vm2-audit-zero-check",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.