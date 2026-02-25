---
name: vm2-audit-t2-cross-constraint-contradiction
description: Audit VM2/AVM PIL files for cross-constraint contradictions where independently correct constraints become unsatisfiable under specific execution paths. Completeness issue (Critical when reachable) where error transitions, enqueued call boundaries, or multi-phase operations cause constraint conflicts that block valid traces from verifying.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Cross-Constraint Contradiction Audit

## Purpose
Detect constraints that are individually correct but become contradictory when combined under specific execution paths (error + teardown, empty stack + return, nested call + enqueued call boundary, etc.).

## When to Use
- Auditing PIL files for completeness issues on error/transition paths
- Investigating verification failures that only occur under multi-enqueued-call or error scenarios
- Reviewing constraints that force next-row values (`column' = expr`) across operation boundaries

## When NOT to Use
- Looking for missing constraints (use `t2-derived-value-constraints`)
- Looking for constraints firing on wrong rows (use `t2-error-state-constraint-firing`)
- Looking for missing error gating on lookups (use `t4-missing-error-gating`)

## The Vulnerability Pattern

Two or more constraints, each correct in isolation, enforce **contradictory requirements** on the same column under specific state combinations:

```pil
// Constraint A (in internal_call.pil): On INTERNAL_RETURN, restore call ID
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;
// When call stack is empty and error: return_id = 0, forces internal_call_id' = 0

// Constraint B (in context.pil): On new enqueued call, initialize call ID to 1
sel_first_row_in_context * (internal_call_id - 1) = 0;
// Teardown enqueued call after error: forces internal_call_id = 1

// CONTRADICTION: Row N forces next row's internal_call_id = 0,
// but row N+1 forces its own internal_call_id = 1.
// Both constraints cannot be satisfied simultaneously!
```

**Key insight**: These bugs are invisible when testing single enqueued calls because the next row defaults to zero (no subsequent enqueued call to contradict). They only manifest when there are multiple enqueued calls (e.g., setup + teardown) AND an error occurs.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every pair of constraints that appear to conflict under some execution path is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Execution path is impossible**: A prior constraint makes the conflicting path unreachable (quote the blocking constraint with file:line).
  - (b) **Constraints are compatible**: Show algebraically that both constraints can be simultaneously satisfied on all reachable paths (show the algebra).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Severity Assessment
- **Completeness bugs reachable via canonical simulation on valid inputs are Critical** - system doesn't work for valid programs
- Contradictions only reachable via malicious witness: Low (prover can avoid the state)
- Contradictions in theoretical-only paths: Informational

## Workflow

> **SCOPE**: PIL files in `barretenberg/cpp/pil/vm2/`. Focus on constraints that set next-row values (`column'`) and interact across operation boundaries.

### Phase 0: Enumerate ALL PIL Files With Next-Row Constraints (MANDATORY)

> **CRITICAL**: Before deep-diving any single file, enumerate ALL files with shifted-column constraints.

```bash
# Find all files with next-row references (column')
grep -rl "'" pil/vm2/ --include="*.pil" | sort

# Count shifted references per file to prioritize
for f in $(grep -rl "'" pil/vm2/ --include="*.pil"); do
  count=$(grep -c "'" "$f" 2>/dev/null)
  echo "$count $f"
done | sort -rn | head -20
```

Build a master checklist of all files with next-row constraints. You MUST check every file for potential contradictions.

### Phase 1: Identify Next-Row Forcing Constraints

Find all constraints that force a specific value on the next row:

```bash
# Constraints that reference shifted columns (column')
grep -rn "'" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "^[[:space:]]*//" | grep -v "^[[:space:]]*\*"
```

Categorize them:
- **Propagation**: `sel * (column' - column) = 0` (carry forward)
- **Initialization**: `sel * (column' - constant) = 0` (set to fixed value)
- **Derivation**: `sel * (column' - expr) = 0` (compute from other values)

### Phase 2: Map Operation Boundaries

Identify where execution transitions between different operation types:

```bash
# Operation-type selectors
grep -rn "sel_enter_call\|sel_exit_call\|sel_error\|enqueued_call_start\|enqueued_call_end\|sel_first_row_in_context\|sel_execute_internal" \
    barretenberg/cpp/pil/vm2/ --include="*.pil" | grep "pol "
```

Key boundaries where contradictions arise:
1. **Error -> Teardown**: Error on last instruction of setup -> teardown starts
2. **Nested call exit -> Enqueued call end**: Return from nested call that is also last in enqueued call
3. **Internal return + error**: `INTERNAL_RETURN` with empty call stack -> error row
4. **Multi-phase gadget end -> Next operation**: Last row of multi-row computation -> next instruction

### Phase 3: Build Constraint Conflict Graph

For each column that has next-row constraints:

1. **List all constraints** that force `column'` to a value, noting their gating selectors
2. **Identify overlapping activation**: Can two gating selectors be true simultaneously?
3. **Check for value conflicts**: When both active, do they force different values?

Example analysis:
```
Column: internal_call_id'
  Constraint A: sel_execute_internal_return * (internal_call_id' - return_id) = 0
    Active when: sel_execute_internal_return = 1
    Forces: internal_call_id' = return_id

  Constraint B: sel_first_row_in_context * (internal_call_id - 1) = 0
    Active when: sel_first_row_in_context = 1 (on NEXT row)
    Forces: internal_call_id = 1 (on NEXT row, which is internal_call_id')

  Overlap: Can A's row be followed by B's row?
    YES: Error during INTERNAL_RETURN -> teardown enqueued call starts

  Conflict: A forces internal_call_id' = 0 (empty stack), B forces = 1
    CONTRADICTION when return_id = 0 AND teardown follows
```

### Phase 4: Trace Execution Paths

For each potential conflict, trace the concrete execution path:

1. What state leads to both selectors being active on adjacent rows?
2. Is this reachable via the canonical simulation with valid inputs?
3. What specific input triggers it? (e.g., "program that calls INTERNAL_RETURN with empty call stack, with teardown function configured")

```bash
# Check if the conflicting selectors can co-occur on adjacent rows
# Look at how selectors are derived in tracegen
grep -rn "sel_execute_internal_return\|sel_read_unwind_call_stack" \
    barretenberg/cpp/src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### Phase 5: Verify Fix Patterns

For any found contradictions, check if the existing fix pattern is applied:

```bash
# Common fix: gate by error to prevent next-row forcing during error
grep -rn "1 - sel_opcode_error\|1 - sel_error\|sel_read_unwind" \
    barretenberg/cpp/pil/vm2/ --include="*.pil"
```

## Contradiction Categories

### Category 1: Error Path + Initialization Conflict
**Pattern**: Constraint forces `column' = X` on error row, but next row's initialization requires `column = Y` where X != Y.

```pil
// VULNERABLE
sel_op * (column' - derived_value) = 0;       // Fires even during error
sel_init * (column - INIT_VALUE) = 0;          // Next row's init wants different value
// When sel_op=1 on error row AND sel_init=1 on next row: contradiction
```

**Fix**: Gate by `(1 - sel_error)`:
```pil
sel_op * (1 - sel_opcode_error) * (column' - derived_value) = 0;
```

### Category 2: Overlapping Propagation + Derivation
**Pattern**: Default propagation and operation-specific derivation both active.

```pil
// VULNERABLE
DEFAULT_ROW * (column' - column) = 0;          // Propagate unchanged
sel_special_op * (column' - new_value) = 0;    // Set to new value
// If DEFAULT_ROW and sel_special_op can both be 1: contradiction when column != new_value
```

**Fix**: Ensure mutual exclusion in DEFAULT_ROW definition:
```pil
pol DEFAULT_ROW = 1 - (sel_special_op + sel_other_op + ...);
```

### Category 3: Multi-Enqueued-Call Boundary
**Pattern**: End-of-enqueued-call constraints conflict with start-of-next-enqueued-call initialization.

```pil
// VULNERABLE
enqueued_call_end * (column' - final_value) = 0;  // End cleanup
enqueued_call_start * (column - INIT) = 0;          // Start init
// If enqueued_call_end on row N and enqueued_call_start on row N+1:
// column' on row N must equal column on row N+1
// final_value must equal INIT, but they may differ!
```

### Category 4: Gadget Boundary + Operation Selector
**Pattern**: Multi-row gadget's last-row constraint conflicts with the next operation's first-row requirement.

```pil
// In gadget:
last_row * (output_column' - result) = 0;
// In next operation:
first_row * (input_column - expected) = 0;
// If output_column and input_column are the same trace column: potential contradiction
```

## Illustrative Example: Call ID Contradiction on Error + Teardown

A return-from-call constraint forces `call_tracker' = restored_id` even during error, where `restored_id = 0` (empty stack). But the next enqueued call's initialization requires `call_tracker = 1`. These two constraints cannot be satisfied simultaneously on the boundary row.

**Fix pattern**: Gate the return constraint by `(1 - sel_error)` or use a selector that excludes error rows.

### Why single-call tests miss this
The bug only manifests when there are multiple enqueued calls. With a single enqueued call, the row after an error is a padding/halt row where the default value is acceptable. The contradiction only appears when a subsequent enqueued call follows.

## Key Files
- `pil/vm2/context.pil` - Context state, initialization, propagation
- `pil/vm2/execution.pil` - Operation selectors, DEFAULT_CTX_ROW
- `pil/vm2/opcodes/internal_call.pil` - Internal call/return constraints
- `pil/vm2/gas.pil` - Gas state propagation
- `pil/vm2/tx.pil` - Transaction-level constraints, enqueued call boundaries

## Related Skills
- **vm2-audit-t2-error-state-constraint-firing**: Constraints firing on wrong rows (subset of this pattern)
- **vm2-audit-t1-operation-transition-continuity**: Missing constraints at transitions (complementary)
- **vm2-audit-t2-mutual-exclusivity**: Selectors not properly exclusive (can cause overlapping activation)
- **vm2-audit-t2-missing-initialization**: Missing init constraints (different: this is about conflicting ones)

## Checklist

For each column with next-row constraints (`column'`):
- [ ] List ALL constraints that force `column'` to a value
- [ ] For each pair, can their gating selectors both be active on adjacent rows?
- [ ] If yes, do they force different values for `column'`?
- [ ] Is the conflicting path reachable via canonical simulation?
- [ ] Are error paths properly gated with `(1 - sel_error)` or equivalent?
- [ ] Do enqueued call boundaries have consistent init/final values?
- [ ] Is the contradiction masked by single-call testing? (Check multi-call scenarios)

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-cross-constraint-contradiction` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Columns Analyzed | `{n}` |
| Findings | `{e.g., "1 Critical, 2 Medium" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format
- **ID**: `vm2-audit-t2-cross-constraint-contradiction-{file}-{line}-{column}`
- **Severity**: Critical / High / Medium / Low
- **File**: `pil/vm2/path/file.pil:line`
- **Column**: The column with contradictory constraints
- **Constraint A**: First constraint (with file:line)
- **Constraint B**: Second constraint (with file:line)
- **Conflict Path**: Execution path that triggers the contradiction
- **Exploitability**: `completeness` (blocks valid proofs) or `soundness` (allows invalid proofs)
- **Description**: What values are forced and why they conflict
- **Fix**: Suggested resolution (typically error-gating or selector refinement)

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t2-cross-constraint-contradiction",
  "status": "COMPLETED_WITH_FINDINGS",
  "statistics": {
    "files_scanned": 42,
    "columns_analyzed": 85,
    "constraint_pairs_checked": 200,
    "genuine_findings": 1,
    "findings_by_severity": {
      "critical": 0,
      "high": 1,
      "medium": 0,
      "low": 0
    }
  },
  "findings": [{
    "id": "vm2-audit-t2-cross-constraint-contradiction-internal_call-35-internal_call_id",
    "severity": "high",
    "file": "pil/vm2/opcodes/internal_call.pil",
    "line": 35,
    "column": "internal_call_id",
    "constraint_a": "sel_execute_internal_return * (internal_call_id' - return_id) = 0 (internal_call.pil:38)",
    "constraint_b": "sel_first_row_in_context * (internal_call_id - 1) = 0 (context.pil:295)",
    "conflict_path": "INTERNAL_RETURN with empty call stack -> error -> teardown enqueued call",
    "description": "Constraint A forces internal_call_id'=0 (empty stack return_id), Constraint B forces internal_call_id=1 (new context init). Unsatisfiable on error+teardown path.",
    "exploitability": "completeness",
    "fix": "Gate Constraint A by (1 - sel_opcode_error) or use sel_read_unwind_call_stack selector"
  }]
}
```
