---
name: vm2-audit-t2-derived-value-constraints
description: Audit VM2/AVM PIL files for derived value underconstraints. Critical soundness issue where values that should be computed from other columns are not constrained, allowing malicious provers to set arbitrary values for next_pc, gas calculations, operation outputs, or state transitions.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Derived Value Constraints Audit

Audit for derived value underconstraints - values computed from other columns but not constrained. Enables logic bypass: control flow corruption, incorrect ALU outputs, invalid state transitions.

## Critical Concept: `pol` vs `pol commit`

| Declaration | Meaning | Needs Constraint? |
|-------------|---------|-------------------|
| `pol commit foo;` | Committed column (prover witness) | YES - explicit |
| `pol FOO = expr;` | Intermediate expression (alias) | NO - constrained by definition |
| `foo = expr;` | Constraint equation | PROVIDES constraint |

**Example:**
```pil
pol BASE_L2_GAS = opcode_gas + addressing_gas;  // Intermediate - auto-constrained
pol commit total_gas_l2;  // Committed - needs constraint
sel_should_check_gas * (prev_l2_gas_used + L2_GAS_USED - total_gas_l2) = 0;  // Constraint
```

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every `pol` (derived) expression that computes a value without enforcing it via a constraint is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Value is enforced by downstream constraint**: A constraint using this derived value exists (quote with file:line).
  - (b) **Value is used only in interactions**: It appears in a lookup/permutation tuple where the interaction enforces correctness (quote the interaction).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (unreachable) to Critical (blocks valid inputs)

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

> **PERFORMANCE RULE**: Do NOT analyze all ~1,730 committed columns individually. Use the filter-first approach below to narrow to suspicious candidates, then do deep analysis only on those. Per-column iteration will exhaust the context window.
>
> **FILE SCOPE**: Scan ALL `.pil` files under `barretenberg/cpp/pil/vm2/` **including all subdirectories**: `opcodes/`, `bytecode/`, `execution/`, `trees/`, and any others. Subdirectory files (e.g., opcode-specific PIL files) define committed columns and constraints that are just as critical as top-level files. Treat every PIL file equally regardless of directory depth.

### Phase 1: Filter to Suspicious Candidates (3 parallel batch searches)

**Search A — All committed columns** (the full set):
```bash
grep -rn "pol commit" pil/vm2/ --include="*.pil"
```

**Search B — All columns that ARE constrained** (the safe set):
```bash
# Columns on LHS of equations (col = expr, or col - expr = 0)
grep -rn "^[^/]*[a-z_][a-z_0-9]* \(=\|- \)" pil/vm2/ --include="*.pil" | grep -v "pol "
# Columns in lookup/permutation tuples
grep -rn "{.*}" pil/vm2/ --include="*.pil"
# Columns constrained by definition (equation IS the constraint)
grep -rn "pol commit.*=\|^[a-z_].*= .*;" pil/vm2/ --include="*.pil"
```

**Search C — Red flag patterns** (high-priority candidates):
```bash
grep -rn "TODO.*constrain\|FIXME.*constrain\|unconstrained\|should be\|must be" pil/vm2/ --include="*.pil"
```

### Phase 2: Compute Candidate Set

From the batch results:
1. ALL_COLUMNS = committed columns from Search A
2. CONSTRAINED = columns appearing in Search B (on LHS of equations, in tuples, etc.)
3. RED_FLAGS = columns flagged by Search C
4. CANDIDATES = (ALL_COLUMNS - CONSTRAINED) ∪ RED_FLAGS

Exclude from candidates:
- Intermediate expressions (`pol UPPER_CASE = ...` — these are constrained by definition)
- Input columns that appear in lookup DESTINATION positions (caller constrains them)
- Columns in `precomputed` namespace (populated by prover, not witnesses)

Typically yields **15-40 candidates** to investigate deeply.

### Phase 3: Deep Analysis Per Candidate

For each candidate, read the relevant PIL file (group candidates by file to minimize reads) and verify:

1. **Constrained by definition?** `col = expr;` means the equation IS the constraint
2. **Selector-gated constraint?** `sel * (col - expr) = 0;` — check ALL cases are covered
3. **In a lookup/permutation tuple?** Constrained by the interaction
4. **Cascade-protected?** When `sel == 0`, does the cascade make it irrelevant?
5. **Missing default case?** If `sel_op_a * (col - X) = 0; sel_op_b * (col - Y) = 0;` but no `(1 - sel_op_a - sel_op_b) * col = 0;`

### Phase 4: Completeness Check

After analyzing candidates, verify nothing was missed by the batch filter:

```bash
# Per-file column count: compare declared vs analyzed (use find to ensure all subdirs are covered)
find pil/vm2/ -name "*.pil" -type f | sort | while read f; do
  declared=$(grep -c "pol commit" "$f" 2>/dev/null || echo 0)
  echo "$f: $declared columns"
done
```

Cross-check: for any file with >10 columns where 0 candidates were found, do a quick manual scan of that file's constraint section to verify all columns are indeed constrained. This is O(files), not O(columns), so it stays bounded. **Pay special attention to subdirectory files** (`opcodes/`, `bytecode/`, `trees/`, `execution/`) — these are easy to overlook but often contain critical constraints for derived values.

Also check for any column categories not handled by the batch filter:
- Array columns (`pol commit col[N]`) — may need loop constraint verification
- Columns only referenced via namespace prefix in other files

## Vulnerable Patterns

### Committed but Unconstrained
```pil
pol commit next_pc;  // Never appears on LHS of any equation!
```

### Partial Coverage
```pil
sel_gas_bitwise { mem_tag_reg[0], dynamic_l2_gas_factor } in precomputed...;
// Missing fallback for other opcodes - no DYN_L2_GAS_IS_ZERO constraint
```

## Secure Patterns

### Constrained by Definition
```pil
pol commit sel_should_execute_opcode;
sel_should_execute_opcode = sel_should_check_gas * (1 - sel_out_of_gas);
```

### Complete Case Coverage
```pil
sel_op_a * (output - formula_a) = 0;
sel_op_b * (output - formula_b) = 0;
(1 - sel_op_a - sel_op_b) * output = 0;
```

### Lookup-Constrained
```pil
#[TAG_MAX_BITS_VALUE]
sel { ia_tag, max_bits, max_value } in precomputed.sel_tag_parameters { ... };
```

## Known Constrained Columns

| Value | Location | Pattern |
|-------|----------|---------|
| `sel_out_of_gas` | gas.pil | `= 1 - (1-out_of_gas_l2)*(1-out_of_gas_da)` |
| `total_gas_l2` | gas.pil | `sel * (prev + used - total) = 0` |
| `sel_error` | execution.pil | Sum of individual errors |
| `dynamic_l2_gas_factor` | execution.pil | Multiple constraints + zero fallback |

## Checklist

For each `pol commit` column:
- [ ] Equation `col = expr` or `sel * (col - expr) = 0`?
- [ ] In lookup/permutation tuple?
- [ ] ALL conditional cases covered (including default)?
- [ ] Constrained to 0 when gating selector is off?
- [ ] Selector cascade ensures safety on inactive rows?

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-derived-value-constraints` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Columns Analyzed | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format:**
- **ID**: `vm2-audit-t2-derived-value-constraints-{file}-{line}-{column}`
- **Severity**: Critical / High / Medium / Low
- **File**: `pil/vm2/path/file.pil:line`
- **Column**: `column_name`
- **Description**: What column should derive from, why unconstrained
- **Constraint Gap**: Which cases/selectors lack coverage
- **Fix**: Specific constraint to add

### JSON File (Required)

Write `vm2-audit-t2-derived-value-constraints.json` to output directory:

```json
{
  "skill": "vm2-audit-t2-derived-value-constraints",
  "status": "COMPLETED_WITH_FINDINGS",
  "files_scanned": 42,
  "columns_analyzed": 150,
  "findings": [{
    "id": "vm2-audit-derived-value-constraints-file-123-col",
    "severity": "critical",
    "file": "pil/vm2/path/file.pil",
    "line": 123,
    "column": "col_name",
    "description": "Column should derive from X but unconstrained",
    "constraint_gap": "Missing when sel_foo = 0",
    "exploitability": "high",
    "fix": "(1 - sel_foo) * col_name = 0;"
  }]
}
```
