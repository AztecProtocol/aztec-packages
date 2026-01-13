---
name: vm2-audit-first-row-special-cases
description: Audit VM2/AVM PIL files for first row special case issues with skippable conditions. Completeness issue where constraints involving precomputed.first_row don't work correctly with skippable optimization, causing verification failures when sel=0 on row 0 because first_row=1 prevents nullification.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# VM2 First Row Special Cases Audit

## Purpose
Detect completeness bugs where constraints using `precomputed.first_row` fail to nullify when `sel = 0` on row 0, causing valid traces to fail verification with skippable optimization.

## When to Use
- Auditing PIL files for first_row constraint issues
- Debugging skippable-related verification failures
- Reviewing constraints that combine `sel` and `first_row`

## When NOT to Use
- Soundness audits (this skill focuses on completeness)
- General PIL constraint review (use other audit skills)

## The Bug

Skippable optimization skips sumcheck when `sel = 0`. But row 0 has `first_row = 1`, preventing nullification:

```pil
#[skippable_if]
sel = 0;

// BUG: When sel = 0 on row 0:
// (0 + 1) * (value' - expected) = 1 * (...) != 0
(sel + precomputed.first_row) * (value' - expected) = 0;
```

## Critical Test Before Flagging

**"When sel = 0, does honest tracegen produce values that FAIL this constraint?"**
- YES -> Completeness bug (valid trace fails)
- NO -> Not a bug (tracegen naturally satisfies it)

### NOT a Bug: Tracegen-Zeroed Columns
```pil
// NOT a bug - tracegen sets end = 0 when sel = 0
end * precomputed.first_row = 0;  // Row 0: 0 * 1 = 0 OK
```
These enforce invariants. When sel = 0, tracegen zeros these columns, satisfying the constraint.

## Workflow

### Step 1: Find first_row Usage
```bash
grep -rn "first_row" barretenberg/cpp/pil/vm2/ --include="*.pil"
grep -rn "(sel.*first_row\|first_row.*sel)" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Check Skippable Condition
```bash
grep -rn "skippable_if" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

For each constraint with `first_row`, verify it evaluates to 0 when skippable condition is met.

### Step 3: Check Shifted Constraints
```bash
grep -rn "'" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "//"
```

Shifted constraints are especially prone. Prefer `sel'` for shifted values.

### Step 4: Test with Skippable
```bash
AVM_SKIPPABLE=1 vmtg "ComponentTest*"
```

## Vulnerable Patterns

```pil
// BUG: first_row prevents nullification when sel = 0
(sel + precomputed.first_row) * constraint = 0;

// BUG: Complex skippable never works on row 0
#[skippable_if]
sel + precomputed.first_row = 0;
```

## Secure Patterns

```pil
// FIX: Use shifted selector for shifted constraints
sel' * (pc_index' - pc_index - 1) = 0;

// FIX: Gate by sel only
sel * some_constraint = 0;

// FIX: Separate first row from propagation
precomputed.first_row * (value - INIT_VALUE) = 0;
sel * (1 - precomputed.first_row) * (value' - value) = 0;
```

## Real Example: BC Hashing PC Increment (PR #18424)

```pil
// BEFORE: Not nullified on row 0 when sel = 0
(sel + precomputed.first_row) * (pc_index' - pc_index - some_value) = 0;

// AFTER: Use sel' for shifted constraint
sel' * (pc_index' - pc_index - some_value) = 0;
```

## Severity Assessment

- **Critical**: Completeness bug reachable via canonical simulation on valid inputs
- **High**: Reachable but requires specific conditions
- **Medium/Low**: Theoretical or unlikely to be hit

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-first-row-special-cases` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-first-row-special-cases-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (Required)

Write `vm2-audit-first-row-special-cases.json` to the output directory:

```json
{
  "skill": "vm2-audit-first-row-special-cases",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-first-row-special-cases-filename-123-issue-type",
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
