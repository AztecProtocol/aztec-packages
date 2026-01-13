---
name: vm2-audit-derived-value-constraints
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

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (unreachable) to Critical (blocks valid inputs)

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

> PIL files in `barretenberg/cpp/pil/vm2/`. Use `find pil/vm2 -name "*.pil"` to list.

### Step 1: Identify Committed Columns

```bash
grep -rn "pol commit" pil/vm2/ --include="*.pil"
# Distinguish from intermediate expressions (uppercase by convention):
grep -rn "^pol [A-Z]" pil/vm2/ --include="*.pil"
```

### Step 2: Categorize Each Column

| Category | Examples | Constraint Source |
|----------|----------|-------------------|
| **Input** | `opcode`, `operand` | Lookup/permutation |
| **Derived** | `next_pc`, `output`, `remaining_gas` | **AUDIT FOCUS** |
| **Witness** | `inv`, `quotient`, `diff_inv` | Zero-check pattern |
| **Selector** | `sel_add`, `sel_jump` | Decomposition |
| **Constrained by Definition** | `sel_error = err_a + err_b...` | Equation IS constraint |

### Step 3: Check Constraint Patterns

```bash
# Direct constraint (col = expr or expr - col = 0)
grep -rn "column_name\s*=" pil/vm2/ --include="*.pil"
# Selector-gated constraint
grep -rn "sel.*column_name\|column_name.*sel" pil/vm2/ --include="*.pil"
# In lookup/permutation tuple
grep -rn "column_name" pil/vm2/ --include="*.pil" | grep -E "(in|is)\s"
# In interaction tuple
grep -rn "column_name" pil/vm2/ --include="*.pil" | grep "{"
```

### Step 4: Verify "Constrained by Definition" Pattern

```pil
pol commit sel_error;
sel_error = err_a + err_b - err_a * err_b;  // Equation IS constraint - NOT a bug
```

### Step 5: Check Selector Deactivation Cascades

```pil
// Cascade from execution.pil:
// sel == 0 ==> sel_bytecode_retrieval_success == 0 ==> ... ==> sel_should_execute_opcode == 0
```

Verify derived values are either:
1. Constrained when `sel == 1`, OR
2. Proven 0/irrelevant when `sel == 0` via cascade

### Step 6: Check Case Coverage

```pil
// VULNERABLE: Only one case constrained
sel_op_a * (derived - formula_a) = 0;
// What if sel_op_a = 0?

// SECURE: Complete coverage
sel_op_a * (derived - formula_a) = 0;
sel_op_b * (derived - formula_b) = 0;
(1 - sel_op_a - sel_op_b) * derived = 0;  // Default case
```

### Step 7: Search for Red Flags

```bash
grep -rn "TODO.*constrain\|FIXME.*constrain\|unconstrained" pil/vm2/ --include="*.pil"
grep -rn "@boolean" pil/vm2/ --include="*.pil"  # Should have boolean constraint
grep -rn "should be\|must be\|derived from" pil/vm2/ --include="*.pil"
```

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
| Skill | `vm2-audit-derived-value-constraints` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Columns Analyzed | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format:**
- **ID**: `vm2-audit-derived-value-constraints-{file}-{line}-{column}`
- **Severity**: Critical / High / Medium / Low
- **File**: `pil/vm2/path/file.pil:line`
- **Column**: `column_name`
- **Description**: What column should derive from, why unconstrained
- **Constraint Gap**: Which cases/selectors lack coverage
- **Fix**: Specific constraint to add

### JSON File (Required)

Write `vm2-audit-derived-value-constraints.json` to output directory:

```json
{
  "skill": "vm2-audit-derived-value-constraints",
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
