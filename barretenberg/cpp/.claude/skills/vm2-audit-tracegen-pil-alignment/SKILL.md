---
name: vm2-audit-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
version: 1.0.0
---

# VM2 Tracegen-PIL Alignment Audit

## Purpose
Find completeness bugs where tracegen doesn't match PIL constraints, causing valid executions to fail verification.

## When to Use
- Auditing PIL files that have corresponding tracegen code
- Reviewing changes to tracegen event handlers
- Investigating verification failures on valid inputs

## When NOT to Use
- Pure PIL-only audits with no tracegen component (use vm2-audit-dead-columns)

## Severity
**Completeness bugs reachable via canonical simulation on valid inputs are Critical.**

## Misalignment Types

| Type | Signal | Check |
|------|--------|-------|
| **Missing Column** | `pol commit` vs `row.col =` | Column declared but never assigned |
| **Wrong Computation** | `static_cast`, integer on field | Tracegen integer math, PIL expects field |
| **Event Not Handled** | `switch`/`if` in handlers | Missing error/edge case |
| **Selector Not Toggled** | `sel_*` assignments | PIL expects sel=1, tracegen doesn't set |
| **Wrong Partition** | `sel = A + B + C` in PIL | Sub-selector boolean != algebraic derivation |
| **Conditional Missing** | `col = flag * expr` in PIL | FALSE POSITIVE if simulation struct defaults provide implicit gating |
| **Wrong Selector** | Accumulation loops | Tracegen uses different selector than PIL |
| **Start-Row-Only** | Gated by `sel_start *` | FALSE POSITIVE if ALL refs gated |
| **Missing Propagation** | No `CONTINUITY_X` constraint | FALSE POSITIVE if column only used on start row |
| **Zero Inverse** | `_inv` column = 0 when source = 0 | FALSE POSITIVE: sparse storage + IS_ZERO pattern |
| **Error Path Default** | Error handling sets defaults | Wrong value on abort/overflow |
| **Wrong Boolean** | `is_X` vs `should_X` | Different selector in accumulation |
| **Horizontal Unroll** | Loop writes same row, distinct cols | FALSE POSITIVE: intentional single-row design |
| **Unset Defaults Zero** | Error path doesn't set `sel`/`ctr` | FALSE POSITIVE if constraints satisfied at 0 |
| **Perm DST Selector** | `sel_X` never assigned in tracegen | FALSE POSITIVE if DST_SELECTOR in MultiPermutation |

### Partition Derivation (Type 5)
For `sel = A + B + C`, derive algebraically:
```
sel = double_op + add_op + INFINITY_PRED
double_op = x_match * y_match
INFINITY_PRED = x_match * (1 - y_match)
=> add_op = sel - x_match (NOT intuitive guess!)
```

### False Positive Check (Type 8 - Start-Row-Only)
1. Find ALL references (direct + transitive)
2. Verify EVERY reference gated by `sel_start * expr`
3. Any ungated or `col'` reference -> real bug

### False Positive Check (Missing Propagation)
Missing `CONTINUITY_X` constraint is NOT a bug when:
1. Column is only used in expressions gated by `start` (e.g., `start * (col + 7)`)
2. Permutations using column fire only on `start` rows
3. Contrast: `output_addr` NEEDS propagation (used on `latch` row); `state_addr` does NOT (only used on `start`)
4. Check: grep all uses of column in PIL - if ALL are `start * ...` or `STATE_READ_CONDITION * ...`, no propagation needed

### False Positive Check (Zero Inverse)
`X_inv = 0` when `X = 0` is NOT a bug:
1. TraceContainer sparse storage erases zeros (never stored)
2. `invert_column` only iterates non-zero values
3. IS_ZERO pattern: `X * (IS_ZERO * (1 - inv) + inv) - 1 + IS_ZERO = 0`
   - When X=0, IS_ZERO=1: constraint becomes `0 - 1 + 1 = 0` ✓ (inv irrelevant)
4. Examples: `path_len_min_one_inv`, `next_nullifier_inv`, `next_slot_inv`

### False Positive Check (Horizontal Unrolling)
Loop writes to same row without `row++` is NOT a bug when:
1. Each iteration writes to DIFFERENT columns (e.g., `T_0_*`, `T_1_*`, `T_2_*`)
2. PIL chains columns horizontally: `round_N_input = round_N-1_output`
3. One logical operation = one row with many columns (not many rows with few columns)
4. Examples: Poseidon2 (64 rounds in 1 row), unrolled hash functions

### False Positive Check (Unset Defaults Zero)
Error path not setting `sel`/`ctr` columns is NOT a bug when:
1. TraceContainer returns 0 for unset columns (sparse storage)
2. Constraints gated by `sel * (...)` are satisfied when sel=0
3. `#[skippable_if] sel = 0` skips most relations when sel=0
4. Check: `ctr * (...) - sel = 0` satisfied at ctr=0, sel=0
5. PIL may explicitly document: "ctr is left unconstrained (0 is optimal)"

### False Positive Check (Permutation DST Selectors)
Permutation destination selector columns NOT assigned in tracegen is NOT a bug when:
1. Column is a `DST_SELECTOR` in a `MultiPermutationBuilder` configuration
2. Check: `*_trace.cpp` for `.add<InteractionType::MultiPermutation, ...settings...>`
3. Check: Generated `perms_*.hpp` for `DST_SELECTOR = Column::the_missing_column`
4. `MultiPermutationBuilder::set_destination_selector()` auto-sets these during interaction processing
5. Examples: `memory_sel_addressing_*`, `memory_sel_register_op_*`, `bc_decomposition_sel_packed_read_*`

### False Positive Check (Conditional Missing - Implicit Gating)
Tracegen "unconditional" assignment is NOT a bug when:
1. **Exception path provides default values**: When simulation throws before populating a struct, C++ default initialization (often 0) matches PIL's gated value
2. **Trace the actual data flow**: Exception → struct defaults → event → tracegen. The "gating" happens in simulation, not tracegen
3. **PIL gating may intentionally exclude errors**: e.g., `PARSING_ERROR_EXCEPT_TAG_ERROR` excludes `tag_out_of_range` because instruction was validly parsed
4. Check: What values does the event struct contain when each error type occurs?

## Workflow

### 1. Map PIL Columns to Tracegen
```bash
grep -n "pol commit" pil/vm2/<component>.pil
grep -n "row\\.<column>" src/barretenberg/vm2/tracegen/<component>*.cpp
```

### 2. Trace Constraints to Tracegen
For each constraint: What values? How computed in tracegen? Satisfied for all paths?

### 3. Check All Code Paths (CRITICAL for missed bugs)
- Normal execution
- Error handling (correct exception types?)
- Edge cases (zero, max, empty, overflow)
- **Error path defaults**: When error occurs, are aborted columns set to correct defaults?
- **Cascaded errors**: If A fails, does B still try to execute and set wrong columns?

### 4. Verify Event Handling
```bash
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp"
grep -rn "process.*event" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### 5. Check Type Conversions
```bash
grep -rn "static_cast" src/barretenberg/vm2/tracegen/ --include="*.cpp"
```

### 6. Verify Partition Derivations
```bash
grep -rn "sel.*=.*+.*+" pil/vm2/ --include="*.pil"
```

### 7. Check MultiPermutation DST Selectors
Before flagging "missing" selector columns, verify not auto-set:
```bash
grep -rn "MultiPermutation" src/barretenberg/vm2/tracegen/*_trace.cpp
grep -rn "DST_SELECTOR.*Column::the_column" src/barretenberg/vm2/generated/relations/perms_*.hpp
```

### 8. Check Batched/Accumulated Values
For `batched_X = sum of (selector[i] * value[i])`:
- Tracegen must use SAME selector as PIL (e.g., `should_apply_X` not `is_X_effective`)
- Check each index includes correct condition

## Extended Examples
Read `references/known-issues.md` for detailed examples from PRs #18864, #19001, #19254, #19471, #19527.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-tracegen-pil-alignment` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-tracegen-pil-alignment-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write to output directory as `vm2-audit-tracegen-pil-alignment.json`:

```json
{
  "skill": "vm2-audit-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-tracegen-pil-alignment-addressing-123-error-path",
      "severity": "critical",
      "file": "src/barretenberg/vm2/tracegen/addressing_trace.cpp",
      "line": 123,
      "description": "Column toggled before error check, PIL expects off on error",
      "exploitability": "high",
      "fix": "Move column assignment after error check"
    }
  ]
}
```
