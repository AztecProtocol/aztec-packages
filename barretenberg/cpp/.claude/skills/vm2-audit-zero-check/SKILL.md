---
name: vm2-audit-zero-check
description: Audit VM2/AVM PIL files for zero-check pattern violations. Soundness issue where the pattern used to create boolean indicators for equality checks (e.g., "e = 1 iff x = 0") is implemented incorrectly, allowing bypass of division-by-zero checks, fake equality comparisons, and conditional logic manipulation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Zero-Check Pattern Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for zero-check pattern violations. The zero-check pattern creates a boolean indicator `e` that equals 1 if and only if a value `x` equals 0. Incorrect implementation allows bypassing equality checks.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Low

## Why This is Critical

Incorrect zero-check implementations enable several exploit patterns:

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

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

### Step 5: Write Negative Tests

Test both directions of the zero-check:

```cpp
TEST_F(ComponentTest, NegativeFakeZeroCheck)
{
    // Try to claim x = 0 when x != 0
    auto trace = TestTraceContainer({
        {{ C::x, 5 },          // x is not zero
         { C::e, 1 },          // Claiming x = 0 (INVALID)
         { C::inv, 0 }},       // Some inverse
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ZERO_CHECK"
    );
}

TEST_F(ComponentTest, NegativeFakeNonZero)
{
    // Try to claim x != 0 when x = 0
    auto trace = TestTraceContainer({
        {{ C::x, 0 },          // x is zero
         { C::e, 0 },          // Claiming x != 0 (INVALID)
         { C::inv, 1 }},       // Some inverse
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "ZERO_CHECK"
    );
}
```

**Interpretation**:
- **Test passes (no exception)**: Zero-check NOT enforced - exploitable bug
- **Test fails (throws)**: Constraint catches it - working correctly

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

## Secure Patterns

### Complete Zero-Check Implementation

```pil
pol commit x;
pol commit is_zero;  // 1 iff x = 0
pol commit x_inv;    // 1/x when x != 0

#[IS_ZERO_BOOL]
is_zero * (1 - is_zero) = 0;

#[ZERO_CHECK]
x * (is_zero * (1 - x_inv) + x_inv) - 1 + is_zero = 0;
```

### Equality Check (a == b)

```pil
pol diff = a - b;
pol commit eq;      // 1 iff a == b
pol commit diff_inv;

#[EQ_BOOL]
eq * (1 - eq) = 0;

#[EQ_CHECK]
diff * (eq * (1 - diff_inv) + diff_inv) - 1 + eq = 0;
```

### Division by Zero Check

```pil
pol commit b;           // Divisor
pol commit div_by_0;    // 1 iff b = 0
pol commit b_inv;       // Inverse of b

#[DIV_BY_0_BOOL]
div_by_0 * (1 - div_by_0) = 0;

#[DIV_BY_0_CHECK]
b * (div_by_0 * (1 - b_inv) + b_inv) - 1 + div_by_0 = 0;
```

## Historical Examples

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

## Audit Checklist

1. **Find all zero-check patterns**:
   - Look for `inv` columns paired with equality indicators
   - Search for `is_zero`, `is_eq`, `div_by_0`, `eq` columns
   - Check anywhere equality/zero comparison is needed

2. **For each zero-check, verify the three components**:
   - [ ] Boolean constraint on the indicator: `e * (1 - e) = 0`
   - [ ] Zero-check relation: `x * (e * (1 - inv) + inv) - 1 + e = 0`
   - [ ] Inverse column exists and used correctly

3. **Check that indicator is used correctly**:
   - [ ] When `e = 1`, x should always be 0
   - [ ] When `e = 0`, x should never be 0

4. **Verify in tracegen**:
   - [ ] `e` is set to 1 iff x is 0
   - [ ] `inv` is set to 1/x when x != 0 (any value when x = 0)

5. **Check for variant patterns**:
   - One-checks (is x == 1?)
   - Arbitrary equality (is a == b?)
   - These are all zero-checks in disguise (check x-1 or a-b)

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

## Common Locations for Zero-Checks

Zero-check patterns typically appear in:
- **ALU**: Division by zero, equality comparisons
- **Memory**: Address equality for reads/writes
- **Control flow**: Conditional jumps based on zero
- **Greater-than comparisons**: Detecting equality case
- **Error handling**: Checking for error conditions

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/08-zero-check-violations.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
- [Error Aggregation Pattern](../../../pil/vm2/claude-skills/10-error-aggregation.md)

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
| Skill | vm2-audit-zero-check |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-zero-check-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-zero-check",
  "finding_prefix": "vm2-audit-zero-check",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-zero-check-filename-line-subtype",
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

- Format: `vm2-audit-zero-check-[filename]-[line]-[subtype]`
- Example: `vm2-audit-zero-check-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
