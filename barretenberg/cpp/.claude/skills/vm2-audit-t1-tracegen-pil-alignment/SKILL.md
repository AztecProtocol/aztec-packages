---
name: vm2-audit-t1-tracegen-pil-alignment
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
| **Conditional Missing** | `col = flag * expr` in PIL | Tracegen assigns unconditionally |
| **Wrong Selector** | Accumulation loops | Tracegen uses different selector than PIL |
| **Start-Row-Only** | Gated by `sel_start *` | FALSE POSITIVE if ALL refs gated |

### Partition Derivation (Type 5)
For `sel = A + B + C`, derive algebraically:
```
sel = double_op + add_op + INFINITY_PRED
double_op = x_match * y_match
INFINITY_PRED = x_match * (1 - y_match)
=> add_op = sel - x_match (NOT intuitive guess!)
```

### False Positive Check (Type 8)
1. Find ALL references (direct + transitive)
2. Verify EVERY reference gated by `sel_start * expr`
3. Any ungated or `col'` reference -> real bug

## Workflow

> **PERFORMANCE RULE**: This audit MUST be scoped to ONE component at a time. The codebase has ~65 PIL files and ~115 tracegen files — cross-referencing all of them at once will exhaust the context window. Process component-by-component (e.g., "alu", "execution", "gas", "memory").
>
> If the user says "audit all", iterate through components one at a time with explicit progress markers, writing findings incrementally.

### Phase 1: Scope to a Single Component

Identify the PIL file and its matching tracegen file(s):
```bash
# Example for "alu" component:
ls pil/vm2/alu*.pil
ls src/barretenberg/vm2/tracegen/alu*.cpp src/barretenberg/vm2/tracegen/alu*.hpp
```

Read BOTH files fully. This is the foundation — do not skip reading either file.

### Phase 2: Batch Column Mapping

In one pass through the PIL file, list all `pol commit` columns. In one pass through the tracegen file, list all `row.<column>` assignments. Compute the diff:

- **PIL-only columns** (declared but never assigned in tracegen): potential missing assignments
- **Tracegen-only assignments** (assigned but not in PIL): potential stale code

This is a single mental diff, not per-column greps.

### Phase 3: Constraint-by-Constraint Verification

Read the PIL constraints and for each one, verify the tracegen computes the right values. Focus on:

1. **Selector toggles**: Does tracegen set `sel_X = 1` when PIL expects it?
2. **Computation correctness**: Does tracegen integer math match PIL field math? (watch for `static_cast` truncation)
3. **Error paths**: Does tracegen handle exceptions that PIL error selectors expect?
4. **Partition derivations**: For `sel = A + B + C` in PIL, verify tracegen computes sub-selectors algebraically correctly

### Phase 4: Spot-Check Event Handling

For the component being audited, check that simulation events match tracegen handlers:
```bash
grep -n "struct.*Event" src/barretenberg/vm2/simulation/ --include="*.hpp" | grep -i "<component>"
grep -n "process.*event\|handle.*event" src/barretenberg/vm2/tracegen/<component>*.cpp
```

### Phase 5: Completeness Check

After auditing the component, verify coverage:
- Count of `pol commit` columns in PIL vs count analyzed
- Any `switch`/`if` branches in tracegen that weren't verified
- Flag any columns skipped with a note explaining why (e.g., "precomputed, not tracegen responsibility")

### Component Iteration (if auditing all)

Process components in this priority order (highest-risk first):
1. execution.pil (core dispatch, most complex)
2. alu.pil (arithmetic, overflow-sensitive)
3. gas.pil (gas accounting)
4. memory.pil (memory model)
5. Remaining files alphabetically

After each component, output interim findings before moving to next. This ensures partial results are captured even if context runs low.

## Extended Examples
Read `references/known-issues.md` for detailed examples from PRs #18864, #19001, #19254, #19471, #19527.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-tracegen-pil-alignment` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Finding Format
- **ID**: `vm2-audit-t1-tracegen-pil-alignment-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path:line`
- **Description**: Brief
- **Fix**: One-line

### JSON File (Required)
Write `vm2-audit-t1-tracegen-pil-alignment.json`:
```json
{
  "skill": "vm2-audit-t1-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...", "severity": "critical", "file": "...",
    "line": 123, "description": "...", "fix": "..."
  }]
}
```
