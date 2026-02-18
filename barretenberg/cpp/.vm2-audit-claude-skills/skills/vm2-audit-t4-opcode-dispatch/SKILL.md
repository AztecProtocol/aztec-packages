---
name: vm2-audit-t4-opcode-dispatch
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
- **Soundness** (malicious prover exploits): High if ungated values affect outputs
- **Completeness** (honest prover fails): Low to Critical based on reachability
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

| Pattern | Soundness | Completeness |
|---------|-----------|--------------|
| Ungated selector affecting outputs | High | Critical if tracegen triggers |
| All uses gated by main `sel` | Low | Low (tracegen only) |

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

> **PERFORMANCE RULE**: Do NOT iterate per-selector with individual greps. Use batch collection to gather all opcode selectors and implication constraints first, then cross-reference in memory.

### Phase 1: Batch Collection (3 parallel searches)

**Search A — All opcode selectors**:
```bash
grep -rn "pol commit sel_op_\|pol commit sel_execute_" pil/vm2/ --include="*.pil"
```

**Search B — All implication constraints and derivations**:
```bash
grep -rn "sel_op_.*\* (1 - sel)\|pol.*= sel \*" pil/vm2/ --include="*.pil"
```

**Search C — All composite selector sums and dispatch permutations**:
```bash
grep -rn "sel_op_.*+\|op_id.*} is " pil/vm2/ --include="*.pil"
```

### Phase 2: Set Difference (compute candidates)

From the batch results:
1. ALL_OPS = opcode selectors from Search A
2. PROTECTED = selectors in Search B (implication or derivation) + transitively constrained via sums in Search C
3. CANDIDATES = ALL_OPS - PROTECTED

### Phase 3: Deep Analysis (only on candidates)

For each unprotected selector:
- Check what values it gates
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
| Skill | `vm2-audit-t4-opcode-dispatch` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-t4-opcode-dispatch-{file}-{line}-{selector}`
- **Severity**: High / Medium / Low
- **File**: `path:line`
- **Description**: Which selector, why unconstrained
- **Fix**: Add implication or document safety

### JSON Output (required)
```json
{
  "skill": "vm2-audit-t4-opcode-dispatch",
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
