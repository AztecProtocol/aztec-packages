---
name: vm2-audit-opcode-dispatch
description: Audit VM2/AVM PIL files for opcode selector dispatch issues. Soundness issue where opcode-specific selectors (sel_op_*) can be active without main sel=1, leaving gated values unconstrained outside active rows.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Dispatch Audit

## Purpose
Detect opcode selectors (`sel_op_*`) that lack implication constraints to the main `sel`, enabling values to be unconstrained outside active rows.

## When to Use
- Auditing opcode dispatch in ALU, execution, or similar traces
- Reviewing new opcode selector additions
- Checking selector implication chains

## Severity Assessment
- **Soundness**: High if ungated values affect outputs
- **Low**: If all uses are gated by main `sel`

## Core Pattern

```pil
// VULNERABLE: sel_op_truncate active when sel=0
pol commit sel_op_truncate;
op_id = ... + sel_op_truncate * OP_ID_TRUNCATE;
// No: sel_op_truncate * (1 - sel) = 0

// SECURE: Explicit implication
sel_op_truncate * (1 - sel) = 0;

// ALSO SECURE: Derived from sel
pol SEL_OP_FOO = sel * condition;  // Inherently safe
```

## Workflow

### Step 1: Find Opcode Selectors
```bash
grep -rn "pol commit sel_op_\|pol commit sel_execute_" pil/vm2/ --include="*.pil"
```

### Step 2: Check Implication Constraint
For each `sel_op_X`, verify ONE exists:
```bash
# Direct implication
grep -n "sel_op_X.*(1 - sel)" pil/vm2/<file>.pil
# Or derived
grep -n "pol.*SEL_OP_X = sel \*" pil/vm2/<file>.pil
```

### Step 3: Check Composite Selector Membership
```bash
# If sel_op_X is in a sum that's constrained
grep -n "sel_op_X" pil/vm2/<file>.pil | grep "+"
```

If `sel_group = sel_op_X + sel_op_Y + ...` AND `sel_group * (1 - sel) = 0`, then individual ops are transitively constrained.

### Step 4: Check Dispatch Permutation
```bash
# If dispatched via permutation with op_id
grep -n "op_id" pil/vm2/<file>.pil | grep " is "
```

If `execution.sel { op_id, ... } is alu.sel { alu.op_id, ... }`, opcode selectors contributing to `op_id` are dispatch-enforced.

### Step 5: Assess Impact
If unconstrained:
- Check what values the opcode selector gates
- If all uses are `sel * sel_op_X * (...)`, then Low severity (tracegen only)
- If ANY ungated use exists, High severity

## False Positive Avoidance

| Pattern | Why Safe |
|---------|----------|
| Composite sum constrained | `sel_arith = sel_add + sel_sub`, `sel_arith * (1 - sel) = 0` |
| Dispatch permutation | `op_id` in permutation tuple enforces |
| All uses gated | `sel * sel_op_X * (expr) = 0` everywhere |
| Derived from sel | `pol SEL_OP = sel * cond` |

## Real Bug: SET/CAST Selector Bypass (PR #18192)

```pil
// alu.pil
pol commit sel_op_truncate;
// Only in op_id sum, no implication constraint
// max_bits and max_value unconstrained when sel=0
```

**Impact**: Unconstrained output parameters.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-opcode-dispatch` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-opcode-dispatch-{file}-{line}-{selector}`
- **Severity**: High / Medium / Low
- **File**: `path:line`
- **Description**: Which selector, why unconstrained
- **Fix**: Add implication or document safety

### JSON Output (required)
```json
{
  "skill": "vm2-audit-opcode-dispatch",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-opcode-dispatch-alu-23-sel_op_truncate",
    "severity": "high",
    "file": "pil/vm2/alu.pil",
    "line": 23,
    "selector": "sel_op_truncate",
    "description": "No implication constraint to main sel",
    "exploitability": "medium",
    "fix": "Add: sel_op_truncate * (1 - sel) = 0"
  }]
}
```
