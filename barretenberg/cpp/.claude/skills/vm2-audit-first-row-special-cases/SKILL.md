---
name: vm2-audit-first-row-special-cases
description: Audit VM2/AVM PIL files for first row special case issues with skippable conditions. Completeness issue where constraints involving precomputed.first_row don't work correctly with skippable optimization, causing verification failures when sel=0 on row 0 because first_row=1 prevents nullification.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 First Row Special Cases Audit

Audits for first row special case issues with skippable conditions. Constraints involving `precomputed.first_row` don't nullify when `sel = 0` on row 0 because `first_row = 1`. This is a **completeness** issue - valid traces fail verification.

## The Problem Explained

Skippable optimization skips sumcheck accumulation when `sel = 0` on both merged rows. But row 0 has `precomputed.first_row = 1`, which can prevent constraint nullification:

```pil
#[skippable_if]
sel = 0;

// VULNERABLE: Not nullified on row 0
(sel + precomputed.first_row) * (value' - expected) = 0;

// When sel = 0 and first_row = 1:
// (0 + 1) * (value' - expected) = 1 * (value' - expected) != 0
// Constraint is NOT nullified even though skippable condition is met!
```

## Key Insight

The skippable condition `sel = 0` requires that **ALL sub-relations** evaluate to 0 when `sel = 0`. Using `(sel + precomputed.first_row)` as a gating factor breaks this because on row 0:
- `sel = 0` (skippable condition met)
- `first_row = 1`
- `(sel + first_row) = 1` (constraint NOT nullified!)

## Completeness vs Soundness Reminder

- **Completeness**: Honest prover (following tracegen) can always prove valid executions
- **Soundness**: Malicious prover cannot prove invalid executions

This skill focuses on **completeness**. We assume the prover follows tracegen rules.
A constraint that rejects malicious witness values (e.g., `end = 1` when `sel = 0`)
is working correctly - that's soundness, not a completeness bug.

## The Actual Completeness Test

Before flagging any constraint as a completeness issue, you MUST answer this question:

**"When the skippable condition is met (e.g., sel = 0), would honest tracegen produce column values that FAIL this constraint?"**

- If YES → Actual completeness bug (valid trace fails verification)
- If NO → Not a bug (tracegen naturally satisfies the constraint)

### Example: Why `end * first_row = 0` is NOT a bug

```pil
// This looks ungated by sel, but is NOT a completeness issue:
end * precomputed.first_row = 0;
```

Analysis:
1. When sel = 0, what does tracegen set `end` to? → `end = 0`
2. Constraint on row 0: `0 * 1 = 0` ✓ Satisfied!
3. Honest tracegen never produces a failing trace → NOT a completeness bug

A malicious prover setting `end = 1` when `sel = 0` is a **soundness** concern (and the constraint correctly rejects it).

## False Positives to Avoid

These patterns LOOK suspicious but are typically NOT completeness issues:

### Pattern 1: Ungated invariant constraints
```pil
// NOT a bug - tracegen sets end = 0 when sel = 0
end * precomputed.first_row = 0;

// NOT a bug - tracegen sets latch = 0 when sel = 0
latch * precomputed.first_row = 0;
```
**Why safe**: These enforce invariants (e.g., "can't end on row 0"). When sel = 0, tracegen naturally sets these columns to 0, satisfying the constraint.

### Pattern 2: Constraints with tracegen-zeroed columns
```pil
// Looks ungated, but value' = 0 when sel = 0
(last_access + precomputed.first_row) * (value' - 0) = 0;
```
**Why safe**: If tracegen zeros `value'` on inactive rows, the inner expression is 0.

### The key question to avoid false positives:
> "Does tracegen ever legitimately produce non-zero values for these columns when sel = 0?"

If no → not a completeness issue.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Uses of first_row

```bash
# Find all references to first_row
grep -rn "first_row\|precomputed\.first" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find constraints gated by first_row combinations
grep -rn "(sel.*first_row\|first_row.*sel)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Check Skippable Condition

Find the skippable condition for the component:

```bash
# Find skippable_if annotation
grep -rn "skippable_if" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Common skippable conditions:
- `sel = 0` - Simple, preferred
- `sel + precomputed.first_row = 0` - Complex, problematic

### Step 3: Verify Constraint Nullification

For each constraint using `first_row`, verify it's nullified when skippable condition is met:

```pil
// PROBLEMATIC patterns to find:
(sel + precomputed.first_row) * ...      // first_row prevents nullification
(sel + first_row) * ...                  // Same issue
sel + precomputed.first_row = 0          // Complex skippable condition
```

Ask for each constraint:
1. What is the skippable condition?
2. When that condition is met (e.g., `sel = 0`), does this constraint evaluate to 0?
3. What happens specifically on row 0?

### Step 4: Check Shifted Constraints

Shifted constraints (using `value'`, `pc'`, etc.) are especially prone to this issue:

```bash
# Find shifted constraints
grep -rn "'" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "//"
```

For shifted constraints, prefer using the shifted selector:
```pil
// BETTER: Use sel' for shifted constraints
sel' * (value' - expected) = 0;

// WORSE: Using sel for shifted constraints
sel * (value' - expected) = 0;
```

### Step 5: Test with Skippable Enabled

```bash
# Run tests with skippable enabled
AVM_SKIPPABLE=1 vmtg "ComponentTest*"

# Or set environment variable
export AVM_SKIPPABLE=1
vmtg "ComponentTest*"
```

If tests fail only with skippable enabled, there's likely a first_row issue.

## Patterns

### Vulnerable Pattern: first_row Prevents Nullification

```pil
#[skippable_if]
sel = 0;
// VULNERABLE: first_row prevents nullification
#[INIT_OR_ACTIVE]
(sel + precomputed.first_row) * constraint = 0;
```

### Vulnerable Pattern: Shifted Constraint with first_row

```pil
#[skippable_if]
sel = 0;
// VULNERABLE: Shifted constraint with first_row
#[PC_INCREMENT]
(sel + precomputed.first_row) * (pc_index' - pc_index - 1) = 0;
```

### Vulnerable Pattern: Complex Skippable Condition

```pil
// VULNERABLE: Complex skippable condition
#[skippable_if]
sel + precomputed.first_row = 0;
```

### Secure Pattern: Use Shifted Selector

```pil
#[skippable_if]
sel = 0;
// SECURE: Use shifted selector for shifted constraints
#[PC_INCREMENT]
sel' * (pc_index' - pc_index - 1) = 0;
```

### Secure Pattern: Separate Constraints

```pil
#[skippable_if]
sel = 0;
// SECURE: Separate first row constraint
#[INIT_FIRST_ROW]
precomputed.first_row * (value - INIT_VALUE) = 0;
// SECURE: Separate propagation constraint (excludes first row)
#[PROPAGATE_NON_FIRST]
sel * (1 - precomputed.first_row) * (value' - value) = 0;
```

### Secure Pattern: Gate by sel Only

```pil
#[skippable_if]
sel = 0;
// SECURE: Gate by sel, not (sel + first_row)
#[CONSTRAINT_WHEN_ACTIVE]
sel * some_constraint = 0;
```

## Examples

### Example 1: BC Hashing PC Increment (PR #18424)

```pil
// BEFORE: first_row interference
#[PC_INCREMENTS]
(sel + precomputed.first_row) * (pc_index' - pc_index - some_value) = 0;
// On row 0 with sel = 0, not nullified by skippable!

// AFTER: Use sel' for shifted constraint
#[PC_INCREMENTS]
sel' * (pc_index' - pc_index - some_value) = 0;
```
**Impact**: Verification fails with skippable enabled.

### Example 2: Memory First Row

```pil
// BEFORE: Complex skippable condition
#[skippable_if]
sel + precomputed.first_row = 0;
// Requires BOTH sel = 0 AND first_row = 0
// But first_row = 1 on row 0!

// AFTER: Simple condition
#[skippable_if]
sel = 0;
// And ensure tracegen zeros columns when sel = 0
```
**Impact**: Skippable never works on row 0.

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
