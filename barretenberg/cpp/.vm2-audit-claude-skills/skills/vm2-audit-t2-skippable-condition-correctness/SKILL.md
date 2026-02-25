---
name: vm2-audit-t2-skippable-condition-correctness
description: Audit VM2/AVM PIL files for incorrect skippable_if conditions. Completeness issue where the relation-skipping optimization uses a condition that is too broad, causing constraints gated by non-sel selectors (e.g., last, start, end) to go unchecked on rows where sel=0 but other selectors are active (typically error rows).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Skippable Condition Correctness Audit

## Purpose
Detect `#[skippable_if]` declarations that are too broad, causing constraints to go unchecked on rows where the skip condition is met but other gating selectors in the same relation are active.

## When to Use
- Auditing PIL files for completeness issues on error paths
- Reviewing multi-row computation traces with lifecycle selectors (start, end, last)
- After any change to error handling that alters which selectors are active on error rows

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every `#[skippable_if]` condition that might be too broad (allowing constraint skipping when it shouldn't) is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Condition matches constraint scope exactly**: Every constraint in the skippable block is gated by the same selector as the skippable_if condition (verify ALL constraints, quote any that aren't gated).
  - (b) **Broader condition is safe**: The skippable_if condition is broader than necessary but all constraints are trivially satisfied when the condition holds (show the algebra for each constraint).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Background: What is `#[skippable_if]`?

PIL's `#[skippable_if]` is a **performance optimization**. When the condition is satisfied for ALL rows in a block, the prover skips checking ALL constraints in that relation. This is sound only if the condition guarantees that every constraint in the relation is trivially satisfied (evaluates to 0).

```pil
#[skippable_if]
sel = 0;

// ALL constraints below are skipped when sel = 0 for the entire block.
// This is only correct if EVERY constraint is gated by sel (directly or transitively).
```

**Key subtlety**: The skip applies to the **entire relation** (all constraints in the namespace). If ANY constraint is gated by a selector other than `sel`, and that selector can be active when `sel = 0`, the skip is unsound.

## The Vulnerability Pattern

```pil
namespace multi_row_gadget;

#[skippable_if]
sel = 0;
// ^ Claims: "if sel = 0 on all rows, skip everything"

// ... many constraints gated by sel ...
sel * (ctr' - ctr + 1) * (1 - last) = 0;   // OK: gated by sel

// BUT these constraints are gated by `last`, not `sel`:
#[INIT_X]
last * (accum_x - byte_x) = 0;   // NOT gated by sel!
#[INIT_Y]
last * (accum_y - byte_y) = 0;   // NOT gated by sel!
#[INIT_Z]
last * (accum_z - byte_z) = 0;   // NOT gated by sel!
```

**On error rows**: `err = 1` forces `last = 1` (via `err * (last - 1) = 0`), but `ctr = 0` forces `sel = 0` (via the ctr-sel equivalence). So `sel = 0` AND `last = 1` simultaneously.

The `skippable_if sel = 0` condition is met, so all constraints are skipped — including the `last`-gated ones that should be checked!

**Fix**: The skippable condition must account for ALL active selectors:
```pil
#[skippable_if]
sel + last = 0;
// ^ Now: skip only when BOTH sel = 0 AND last = 0
```

## Severity Assessment

**`skippable_if` bugs are completeness bugs, NOT soundness bugs.** Here's why:

- `skippable_if` is a **prover-side optimization only**. The verifier never uses it — it checks the sumcheck proof over the actual polynomial relations.
- In the sumcheck protocol, each subrelation gets a random challenge α_j. A constraint violation contributes a non-zero term that cannot be cancelled (Schwartz-Zippel). A malicious prover who violates a "skipped" constraint will still fail verification.
- Therefore, a malicious prover **cannot exploit** a too-broad `skippable_if` to forge proofs.

**The real risk is completeness**: the honest prover's sumcheck accumulation uses the skip optimization. If it skips a row where a constraint evaluates to non-zero, the prover computes an incorrect sumcheck polynomial and the proof is rejected by the verifier. The honest prover fails to prove a valid trace.

**However**, a completeness bug is only reachable if the canonical trace generator (tracegen) actually produces rows where the skipped constraint evaluates to non-zero. If tracegen always populates columns such that the constraint is trivially satisfied (even on skipped rows), the skip is harmless in practice.

### Severity levels
- **Critical**: Mismatch found AND tracegen produces rows that trigger the non-zero constraint on skipped rows → honest prover failure on valid inputs.
- **Medium**: Mismatch found BUT tracegen always satisfies the constraint on skipped rows → no practical impact, but a latent defense-in-depth issue that could become critical if tracegen changes.
- **Low**: Theoretical mismatch that cannot be reached by any valid execution path.

## Workflow

> **SCOPE**: PIL files in `barretenberg/cpp/pil/vm2/`.

### Phase 1: Collect All Skippable Conditions

```bash
grep -rn "skippable_if" barretenberg/cpp/pil/vm2/ --include="*.pil" -A 1
```

For each, record:
- File and namespace
- The skip condition (e.g., `sel = 0`, `sel + last = 0`, `sel_foo = 0`)
- The set of columns referenced in the condition (call this SKIP_COLS)

### Phase 2: Find All Gating Selectors in Each Relation

For each namespace with a `skippable_if`, identify ALL constraints and their gating selectors:

```bash
# For a given file, find all constraint lines (lines with = 0 or in/is)
grep -n "= 0;\|in$\|is$" barretenberg/cpp/pil/vm2/<file>.pil | grep -v "^[[:space:]]*//"
```

Extract the **outermost gating selector** of each constraint. A constraint like:
- `sel * (X - Y) = 0` is gated by `sel`
- `last * (X - Y) = 0` is gated by `last`
- `start * (1 - err) * (X - Y) = 0` is gated by `start` (and `(1 - err)`)
- `(1 - last) * (X - Y) = 0` is gated by `(1 - last)` — active when `last = 0`
- `sel * (X - Y) * (1 - last) = 0` is gated by `sel` AND `(1 - last)`

Build the set GATE_COLS = all selectors that gate at least one constraint.

### Phase 3: Check Coverage

For each namespace, verify that the skip condition implies ALL gating selectors are inactive:

**Safe**: `skippable_if sel = 0` when every constraint is gated by `sel` (directly or via a column that requires `sel = 1`)

**Unsafe**: `skippable_if sel = 0` when some constraint is gated by `last` and `last` can be 1 when `sel = 0`

The check:
1. SKIP_CONDITION implies GATE_COL = 0 for every GATE_COL?
2. If not: Can GATE_COL = 1 when SKIP_CONDITION is true?

### Phase 4: Trace Error/Boundary Paths

For each potential mismatch, determine if the gating selector can actually be active when the skip condition holds:

1. **Error rows**: On error, which selectors are forced to specific values?
   - `err = 1` often forces `last = 1` via `err * (last - 1) = 0`
   - `err = 1` may force `sel = 0` via counter/lifecycle logic
   - Result: `sel = 0` AND `last = 1` — skip condition met but `last`-gated constraints active

2. **Boundary rows**: First/last row of trace, or first/last row of a multi-row computation
   - `precomputed.first_row` or `end` selectors may be active on rows where `sel = 0`

3. **Padding rows**: Rows after computation ends but before next starts
   - Usually safe (all selectors 0), but verify

```bash
# Check which selectors are forced by error conditions
grep -rn "err.*last\|err.*(.*- 1)" barretenberg/cpp/pil/vm2/<file>.pil
# Check lifecycle: how sel relates to other selectors
grep -rn "sel.*=.*ctr\|ctr.*sel" barretenberg/cpp/pil/vm2/<file>.pil
```

### Phase 4b: Check Tracegen for Reachability

For each mismatch found in Phase 4, check the canonical trace generator to determine if the completeness bug is actually reachable:

1. **Find the tracegen file**: Look in `src/barretenberg/vm2/tracegen/` for the corresponding `*_trace.cpp` file (e.g., `bitwise_trace.cpp` for `bitwise.pil`).

2. **Find the error/boundary code path**: Locate the code that handles the trigger condition identified in Phase 4 (e.g., error handling for bitwise errors).

3. **Check column population**: On the relevant rows, does the tracegen set the columns such that the skipped constraint evaluates to 0?
   - Example: For `last * (acc_ia - ia_byte) = 0`, check if tracegen sets `acc_ia == ia_byte` on error rows.
   - Columns not explicitly set default to 0 in the trace container.

4. **Determine severity**:
   - If tracegen populates columns such that the constraint IS satisfied → **Medium** (defense-in-depth issue, not reachable)
   - If tracegen does NOT satisfy the constraint on skipped rows → **Critical** (honest prover will fail)

```bash
# Find the tracegen file for a given subtrace
find src/barretenberg/vm2/tracegen/ -name "*<subtrace>*trace*.cpp"
# Look for error handling code
grep -n "err\|error\|tag_ff\|tag_mismatch" src/barretenberg/vm2/tracegen/<subtrace>_trace.cpp
```

### Phase 5: Verify Fix Pattern

For any flagged issue, the fix is to widen the skip condition to include all independently-active selectors:

```pil
// BEFORE (too broad):
#[skippable_if]
sel = 0;

// AFTER (correct):
#[skippable_if]
sel + last = 0;  // or sel + start + end = 0, depending on which selectors gate constraints
```

Alternatively, the constraint can be modified to include `sel` gating:
```pil
// BEFORE:
last * (acc_ia - ia_byte) = 0;
// AFTER:
sel * last * (acc_ia - ia_byte) = 0;  // But this changes semantics and increases degree!
```

The skip-condition fix is usually preferred over adding `sel` to every constraint.

## Common Patterns to Check

### Multi-Row Computations with start/end/last

Many VM2 traces use lifecycle selectors:
- `start`: first row of computation
- `end` or `last`: final row of computation
- `sel`: active during computation

If `sel` is derived from a counter (`sel = 1 iff ctr != 0`) and errors set `ctr = 0`, then error rows have `sel = 0` but may have `start = 1` or `last = 1`.

### Constraints Gated by `(1 - last)` or `(1 - end)`

These are active on ALL rows except the last. If the skip condition is `sel = 0`, they're skipped entirely — but they should still be checked on intermediate rows where `sel = 0` might occur due to an error in the middle of computation.

### Shift Constraints

Constraints referencing shifted columns (`column'`) may need to be checked even when `sel = 0` on the current row if the NEXT row has `sel = 1`.

## Example Pattern: Skippable Initialization Condition

Consider a multi-row gadget with lifecycle selectors:

**Bug pattern**: `#[skippable_if] sel = 0` but some constraints are gated by a lifecycle selector (e.g., `last`, `start`, `end`) rather than `sel`. On error rows, the error flag forces `last = 1` while a counter reset forces `sel = 0`. The skip condition `sel = 0` is met, so ALL constraints are skipped -- including the lifecycle-gated ones that should still be checked.

```pil
#[skippable_if]
sel = 0;

// These constraints are gated by `last`, not `sel`:
last * (accum_x - byte_x) = 0;   // Skipped when sel=0, even if last=1!
last * (accum_y - byte_y) = 0;   // Same problem
```

**Why normal tests miss it**: In non-error execution, `last = 1` implies `ctr >= 1` implies `sel = 1`, so `sel = 0` and `last = 1` never co-occur. Only the error path creates this combination.

**Fix**: Widen the skip condition to cover all independently-active selectors: `#[skippable_if] sel + last = 0;`

## Key Files
- All PIL files in `pil/vm2/` that have `#[skippable_if]` declarations (~55 files)
- Focus on files with multi-row computations: `bitwise.pil`, `sha256.pil`, `keccakf1600.pil`, `poseidon2_perm.pil`, `poseidon2_hash.pil`, `to_radix.pil`, `ecc.pil`, `scalar_mul.pil`, `data_copy.pil`

## Related Skills
- **vm2-audit-t2-error-state-constraint-firing**: Constraints firing on wrong rows during errors (overlapping concern — this skill checks the skip optimization, that skill checks the constraints directly)
- **vm2-audit-t2-cross-constraint-contradiction**: Contradictory constraints on error paths (complementary)

## Checklist

For each `#[skippable_if]` declaration:
- [ ] List ALL selectors that gate constraints in this relation (GATE_COLS)
- [ ] For each GATE_COL not in the skip condition: can it be 1 when the skip condition holds?
- [ ] Check error paths: does `err = 1` force any GATE_COL = 1 while allowing skip condition to be true?
- [ ] Check boundary paths: can lifecycle selectors (`start`, `end`, `last`) be active when skip condition holds?
- [ ] If mismatch found: check the tracegen (`src/barretenberg/vm2/tracegen/*_trace.cpp`) to see if the constraint is satisfied on skipped rows
- [ ] If tracegen satisfies the constraint: severity is Medium (defense-in-depth). If not: severity is Critical (honest prover failure)

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-skippable-condition-correctness` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Skippable Declarations Checked | `{n}` |
| Findings | `{e.g., "1 High, 2 Medium" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format
- **ID**: `vm2-audit-t2-skippable-condition-correctness-{file}-{line}-{selector}`
- **Severity**: Critical / High / Medium / Low
- **File**: `pil/vm2/path/file.pil:line`
- **Skip Condition**: The current `skippable_if` expression
- **Ungated Selector**: The selector that can be active when skip condition holds
- **Constraints Affected**: List of constraint names that use this selector
- **Trigger Path**: How the mismatch is reached (e.g., "error row with err=1, last=1, sel=0")
- **Exploitability**: `completeness-reachable` (tracegen hits it → Critical) or `completeness-latent` (tracegen satisfies constraint → Medium, defense-in-depth only). Never `soundness` — skippable_if is prover-side only.
- **Description**: What constraints are skipped and why
- **Fix**: Suggested updated skip condition

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t2-skippable-condition-correctness",
  "status": "COMPLETED_WITH_FINDINGS",
  "statistics": {
    "files_scanned": 55,
    "skippable_declarations_checked": 55,
    "genuine_findings": 1,
    "findings_by_severity": {
      "critical": 0,
      "high": 0,
      "medium": 1,
      "low": 0
    }
  },
  "findings": [{
    "id": "vm2-audit-t2-skippable-condition-correctness-gadget-87-last",
    "severity": "medium",
    "file": "pil/vm2/gadget.pil",
    "line": 87,
    "skip_condition": "sel = 0",
    "ungated_selector": "last",
    "constraints_affected": ["INIT_X (line 203)", "INIT_Y (line 205)"],
    "trigger_path": "Error row: err=1 forces last=1, ctr=0 forces sel=0",
    "tracegen_check": "gadget_trace.cpp error path sets accum values on error rows, constraints satisfied, not reachable by canonical tracegen",
    "description": "skippable_if sel=0 causes last-gated initialization constraints to be skipped on error rows where last=1 but sel=0. Defense-in-depth issue only.",
    "exploitability": "completeness-latent",
    "fix": "Change to: #[skippable_if] sel + last = 0;"
  }]
}
```
