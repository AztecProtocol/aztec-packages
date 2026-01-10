---
name: vm2-audit-premature-termination
description: Audit VM2/AVM PIL files for premature computation termination vulnerabilities. High severity soundness issue where multi-row computations can be terminated before completion due to missing trace continuity constraints, allowing provers to skip computation steps, truncate Merkle proofs, end copy operations early, or skip validation steps.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Premature Termination Audit

Audits for premature computation termination - multi-row computations can exit early without reaching valid end condition. Enables skipped hash steps, truncated Merkle proofs, partial copies, bypassed validation.

## The Trace Continuity Pattern

The standard pattern to prevent premature termination:

```pil
#[COMPUTATION_FINISH_AT_END]
sel * (1 - sel') * (1 - end) = 0;

// This constraint says:
// If sel = 1 (we're in computation)
// And sel' = 0 (next row exits computation)
// Then end = 1 (we properly terminated)

// Equivalently: sel = 1 AND sel' = 0 => end = 1
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Multi-Row Computations

```bash
# Look for start/end patterns
grep -rn "pol commit start\|pol commit end\|pol commit sel_end" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for counters/remaining values
grep -rn "remaining\|counter\|cnt\|idx\|row_idx" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for latch/continuation patterns
grep -rn "latch\|NOT_END\|continue\|continuity" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

**Note**: Grep may not be comprehensive. Manually review each PIL file to identify all multi-row computations.

### Step 2: Verify Trace Continuity Constraint Exists

For each multi-row computation, search for the continuity constraint:

```bash
# Look for the trace continuity pattern
grep -rn "sel.*1 - sel'.*1 - end\|sel.*(1 - sel').*(1 - end)" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Alternative patterns
grep -rn "CONTINUITY\|FINISH_AT_END\|MUST_END" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
```

### Step 3: Check End Condition Constraints

Verify that `end` can only be set when computation is truly complete:

```bash
# Look for end condition constraints
grep -rn "end.*remaining\|end.*count\|end.*done\|END_WHEN\|END_ONLY" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Check for bidirectional constraints:
```pil
// end => done (necessary)
end * remaining_count = 0;

// done => end (also necessary!)
(1 - end) * is_done_indicator = 0;
```

### Step 4: Look for Underflow Risks

Counters that underflow could wrap around, breaking termination logic:

```bash
# Look for counter decrement patterns
grep -rn "remaining'.*remaining - 1\|counter'.*counter - 1\|cnt - 1" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Check that:
- Counters can't go negative (or wrap in field arithmetic)
- Off-by-one errors don't allow early termination

### Step 5: Verify Error Handling Doesn't Break Continuity

Error paths must still require proper termination:

```bash
# Look for error-related termination
grep -rn "err.*end\|error.*end\|END_ON_ERR" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify:
- Error path still requires `end = 1` before `sel' = 0`
- Early exit on error is properly constrained with start gating

## Patterns

### Vulnerable Pattern: No Enforcement of Continuation

```pil
// VULNERABLE: No enforcement that computation continues until end
pol commit sel;
pol commit end;
```

### Vulnerable Pattern: One-Way End Condition

```pil
// VULNERABLE: end can be set prematurely
pol commit remaining_count;
pol commit end;
end * remaining_count = 0;  // Only checks end implies count = 0
```

### Vulnerable Pattern: Missing Start Gating on Error

```pil
// VULNERABLE: Error can trigger end on any row
err * (1 - sel_end) = 0;  // Missing sel_start gating!
```

### Secure Pattern: Complete Trace Continuity

```pil
// SECURE: Trace continuity constraint
pol commit sel;
pol commit end;
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
// SECURE: end only when truly finished
#[END_ONLY_WHEN_DONE]
end * remaining_count = 0;      // end implies done
```

### Secure Pattern: Gated Error Termination

```pil
// SECURE: Error termination properly gated
#[END_ON_ERR]
sel_start * err * (1 - sel_end) = 0;
```

## Examples

### Example 1: Data Copy (PR #17877)

```pil
// BEFORE: Could truncate copy operation
pol commit sel;
pol commit sel_end;
// No constraint that sel = 1 until sel_end = 1

// AFTER: Added continuity constraint
#[COPY_CONTINUITY]
sel * (1 - sel') * (1 - sel_end) = 0;
```
**Impact**: Could copy partial data.

### Example 2: Merkle Check (PR #17771)

```pil
// BEFORE: Merkle path could be truncated
// No explicit finish-at-end constraint

// AFTER: Added constraint
#[COMPUTATION_FINISH_AT_END]
sel * (1 - sel') * (1 - end) = 0;
```
**Impact**: Could truncate Merkle proofs.

### Example 3: TX is_padded (PR #18336)

```pil
// BEFORE: is_padded didn't imply end_phase
// Could extend trace infinitely via counter underflow

// AFTER: Added implication
#[IS_PADDED_END_PHASE]
is_padded * (1 - end_phase) = 0;
```
**Impact**: Infinite trace extension.

### Example 4: Data Copy sel_end (PR #17877)

```pil
// sel_end could be toggled prematurely because:
// 1. err not constrained beyond first row
// 2. sel_start missing as gating factor in #[END_ON_ERR]

// BEFORE:
err * (1 - sel_end) = 0;  // Missing sel_start!

// AFTER:
#[END_ON_ERR]
sel_start * err * (1 - sel_end) = 0;
```
**Impact**: Premature end on non-start rows.

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
