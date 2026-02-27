---
name: vm2-audit-t2-error-state-constraint-firing
description: Audit VM2/AVM PIL files for constraints that incorrectly fire during error states. Completeness issue where constraints enforce state transitions that conflict with error handling, causing verification failures when the next row has different requirements.
version: 2.0.0
---

# VM2 Error State Constraint Firing Audit

## Purpose
Detect constraints that fire during error states when they should not, causing verification failures (completeness issue). This includes constraints with shifted columns, lookups/permutations that fire unconditionally, and error flags that are unconstrained.

## When to Use
- Auditing PIL files for error handling correctness
- Investigating verification failures after errors
- Reviewing state propagation constraints

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every constraint that fires during error states when it should be gated is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Constraint is intentionally active during errors**: The design requires this constraint to hold even in error states (explain why with quoted design rationale).
  - (b) **Constraint is trivially satisfied**: The constraint reduces to `0 = 0` during error states due to other constraints (show the algebra with quoted constraints).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## CRITICAL: Breadth-First Approach

**DO NOT deep-dive into any single file.** This skill requires a systematic sweep across ALL components. The most common failure mode is fixating on a single file and reporting multiple variants of the same issue while missing bugs in other files entirely.

## Workflow

### Phase 1: Breadth-First Survey (MANDATORY FIRST STEP)

Before analyzing any constraint in detail, you MUST catalogue every component that has error-related selectors or flags. Search the entire `pil/vm2/` directory tree.

1. **Find all error selectors and flags across all files:**
```bash
grep -rn "sel_err\|sel_error\|sel_opcode_error\|sel_tag_err\|_failure\|nested_failure\|sel_parsing_err\|_out_of_range_err\|\berr\b" \
    barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "//" | grep "pol"
```

2. **Build a component inventory** listing every file that defines or uses an error flag. This inventory MUST include at minimum:
   - The top-level execution file (`execution.pil`)
   - The context management file (`context.pil`)
   - ALL files in the `opcodes/` directory
   - ALL multi-row gadget files (data copy, emit log, memory gadgets, etc.)
   - ALL computation gadgets (ALU, bitwise, ECC, hashing, etc.)
   - Bytecode-related files that have error paths

3. **Output the inventory** as a checklist before proceeding. Example format:
   ```
   Component Inventory:
   [ ] execution.pil - sel_error, sel_opcode_error, sel_instruction_fetching_failure, sel_bytecode_retrieval_failure, sel_out_of_gas
   [ ] context.pil - sel_error, nested_failure
   [ ] alu.pil - sel_err, sel_tag_err, sel_div_0_err
   [ ] data_copy.pil - err, src_out_of_range_err, dst_out_of_range_err
   [ ] opcodes/internal_call.pil - sel_opcode_error
   ... (every file with error selectors)
   ```

### Phase 2: Per-Component Analysis

Work through the inventory systematically. For EACH component, check the three vulnerability patterns below. **After finding 1-2 issues in a single component, move on to the next component.** Do not exhaustively document every variant in one file.

#### DEPTH MANDATE

When checking a component, you MUST do more than confirm error selectors exist. For each component:

1. **Read the actual constraints** — not just grep for the selector name. Quote specific constraint lines.
2. **Trace what happens when the error fires** — which shifted-column constraints still enforce next-row values? Which lookups still fire?
3. **Check gating completeness** — for EVERY lookup/permutation in the file, verify whether it fires when error=1. If it does and the columns are meaningless during error, this is Pattern B.
4. **Check error flag freedom** — for EVERY committed error flag, verify it is constrained on ALL active rows, not just start rows. If it's only set on start rows but used on all rows, this is Pattern C.

A component marked "Analyzed. No issues found." MUST include evidence: quote at least 2 specific constraints you verified and explain why they are correct. If you cannot quote specific constraints, you have not analyzed the component.

#### Pattern A: Shifted-Column Constraints That Fire During Error States

Look for constraints that enforce next-row state (`column' = expr`) that are gated by an operation selector but NOT gated by the relevant error flag:

```pil
// VULNERABLE: Fires when sel_op = 1 AND error = 1
sel_op * (some_column' - some_expr) = 0;

// SECURE: Gated to exclude error rows
sel_op * (1 - error_flag) * (some_column' - some_expr) = 0;
```

**How to check:** For each constraint containing a shifted column (`'`), trace whether the gating selector can be active simultaneously with an error flag. If so, determine whether the forced next-row value contradicts what the error recovery path requires (teardown call, enqueued call continuation, halt).

#### Pattern B: Lookups/Permutations That Fire Unconditionally During Error

Look for lookup or permutation interactions whose selector is active even when the component is in an error state. These should typically be gated by `(1 - error_flag)`:

```pil
// VULNERABLE: Lookup fires even when sel_err = 1
sel_active { col_a, col_b }
in target.sel { target.a, target.b };

// SECURE: Lookup gated to exclude error rows
sel_active_no_error { col_a, col_b }
in target.sel { target.a, target.b };
// where: sel_active_no_error = sel_active * (1 - sel_err);
```

**How to check:** For each lookup/permutation with a source selector, determine whether that selector can be 1 when an error flag is also 1. If the lookup references columns whose values are meaningless or contradictory during error, this is a bug.

#### Pattern C: Unconstrained Error Flags

Look for error flags (`pol commit err` or similar) that lack proper constraining -- i.e., a malicious prover could set them freely to manipulate control flow:

```pil
// VULNERABLE: err is committed but only constrained on start rows
pol commit err;
err = 1 - (1 - err_a) * (1 - err_b);  // Only meaningful when sel_start = 1
// On non-start rows, err is unconstrained -- prover can set it to anything
```

**How to check:** For each committed error flag, verify it is fully constrained on ALL active rows (not just start rows). Check whether setting it maliciously on non-start rows could trigger premature termination of multi-row computations, skip required lookups, or corrupt state propagation.

### Phase 3: Completion Checklist (MANDATORY)

Before writing the final report, verify coverage by checking off every component from the Phase 1 inventory:

```
Completion Checklist:
[x] execution.pil - Analyzed. No issues found / Found 1 issue.
[x] context.pil - Analyzed. No issues found.
[x] alu.pil - Analyzed. Found 1 issue (lookup gating).
[x] data_copy.pil - Analyzed. Found 1 issue (err unconstrained on non-start rows).
[x] opcodes/internal_call.pil - Analyzed. Found 1 issue.
... (every component from inventory)
```

**If any component is unchecked, go back and analyze it before completing.**

## Error Flow Context

Understanding the execution error cascade is critical for this audit. The VM2 execution trace has a temporality cascade:

1. **Bytecode retrieval** -- can fail with `sel_bytecode_retrieval_failure`
2. **Instruction fetching** -- can fail with `sel_instruction_fetching_failure`
3. **Addressing** -- can fail with `sel_addressing_error`
4. **Register read** -- can fail with `sel_register_read_error`
5. **Gas check** -- can fail with `sel_out_of_gas`
6. **Opcode execution** -- can fail with `sel_opcode_error`

Each stage's success gates the next stage's activation. The consolidated `sel_error` is the OR of all these. When any error occurs, the current row's error affects what the NEXT row must do (teardown, halt, enqueued call start, etc.).

For multi-row gadgets (data copy, emit log, etc.), they have their own internal error flags (e.g., `err`) that are dispatched back to execution as `sel_opcode_error` through the dispatching permutation. These gadgets also have lifecycle selectors (`sel_start`, `sel_end`) whose interaction with error flags must be carefully checked.

## Severity Assessment
- **Critical**: Completeness bugs reachable via canonical simulation on valid inputs -- the system cannot produce valid proofs for legitimate transactions
- **High**: Error state allows a malicious prover to skip constraints, corrupt lookups, or manipulate state in ways that could lead to soundness issues
- **Medium**: Theoretical constraint violations that require unusual but possible execution paths
- **Low**: Unreachable or defense-in-depth issues

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-error-state-constraint-firing` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Components in Inventory | `{N}` |
| Components Analyzed | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings
- **ID**: `vm2-audit-t2-error-state-constraint-firing-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Pattern**: A (shifted column) / B (lookup gating) / C (unconstrained error flag)
- **Description**: Brief description of the specific constraint and how error state causes it to misfire
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t2-error-state-constraint-firing",
  "status": "COMPLETED_WITH_FINDINGS",
  "components_inventoried": 15,
  "components_analyzed": 15,
  "findings": [{
    "id": "vm2-audit-error-state-constraint-firing-filename-123-issue",
    "severity": "medium",
    "file": "path/to/file.pil",
    "line": 123,
    "pattern": "A",
    "description": "Brief description",
    "exploitability": "low",
    "fix": "Suggested fix"
  }]
}
```
