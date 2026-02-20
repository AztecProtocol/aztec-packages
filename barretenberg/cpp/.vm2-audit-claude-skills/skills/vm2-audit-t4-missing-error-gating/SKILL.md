---
name: vm2-audit-t4-missing-error-gating
description: Audit VM2/AVM PIL files for missing error gating on lookup/permutation interactions. Completeness issue where source selectors fire even when errors occur, causing interaction failures because the destination event was not emitted on the error path.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Missing Error Gating Audit

## Purpose
Detect ungated interaction source selectors that fire during error states, causing lookup/permutation failures when destination events weren't emitted.

## When to Use
- Auditing PIL files for completeness issues
- Investigating lookup/permutation failures in error paths
- Reviewing operations that can produce errors (tag mismatch, division by zero, overflow)

## When NOT to Use
- Lookups to precomputed tables (always emit rows)
- Operations that cannot produce errors
- If unsure whether an operation can error, audit anyway

## Severity
**Completeness issue**: Ranges Low (unreachable) to **Critical** (blocks valid inputs via canonical simulation).

## The Problem

```pil
// VULNERABLE: Lookup fires even on error
#[OPERATION_LOOKUP]
sel_operation { input } in dest.sel { dest.input };

// When sel_operation = 1 AND error occurs:
// - Source selector fires (sel_operation = 1)
// - Destination event NOT emitted (error path skipped it)
// - Lookup fails: no matching destination row!
```

## Error Flags Reference

| Flag | Meaning |
|------|---------|
| `sel_err` | General error |
| `sel_tag_err` | Type tag mismatch |
| `sel_div_0_err` | Division by zero |
| `sel_overflow_err` | Arithmetic overflow |
| `sel_bytecode_retrieval_failure` | Bytecode fetch failed |
| `sel_instruction_fetching_failure` | Instruction parse failed |

## Workflow

> **PERFORMANCE RULE**: Do NOT iterate per-interaction with individual greps. Use batch collection to gather all interactions and error gating patterns first, then cross-reference in memory.

### Phase 1: Batch Collection (4 parallel searches)

**Search A — All interactions across all PIL files**:
```bash
grep -rnP '}\s*(in|is)\b' pil/vm2/ --include="*.pil"
```

**Search B — All error-gated selectors**:
```bash
grep -rn "(1 - sel_err)\|(1 - sel_tag_err)\|(1 - sel_opcode_error)\|(1 - error)" pil/vm2/ --include="*.pil"
```

**Search C — All error flags and which operations can error**:
```bash
grep -rn "sel_err\|sel_tag_err\|sel_div_0\|sel_overflow" pil/vm2/ --include="*.pil"
```

**Search D — Cross-file error flag survey** (catches non-ALU error gating gaps):
```bash
# Find error flags in ALL component files, not just ALU
grep -rn "sel_opcode_error\|sel_err\|sel_bytecode_retrieval_failure\|sel_instruction_fetching_failure" pil/vm2/execution/*.pil pil/vm2/context*.pil pil/vm2/tx.pil pil/vm2/bytecode/*.pil --include="*.pil"
```

> **IMPORTANT**: Do not limit analysis to ALU/arithmetic files. Error gating bugs also occur in `execution.pil`, `internal_call.pil`, `context.pil`, bytecode retrieval, and other non-arithmetic components. Search D ensures cross-file coverage.

### Phase 2: Cross-Reference (identify ungated interactions)

From the batch results:
1. ALL_INTERACTIONS = interactions from Search A (extract source selectors)
2. GATED = selectors appearing in Search B (error-gated patterns)
3. CANDIDATES = interactions whose source selectors are NOT in GATED

### Phase 3: Deep Analysis (only on candidates)

For each ungated interaction:
1. Check simulation code: can errors occur during this operation?
2. Is destination event emitted on error path?
3. If NOT emitted on error, source MUST be gated → finding

## Patterns

### VULNERABLE: Ungated Lookup
```pil
#[MY_LOOKUP]
sel_op { input } in dest.sel { output };
// If sel_op=1 when error occurs, lookup fails
```

### SECURE: Error-Gated Lookup
```pil
pol SEL_OP_NO_ERR = sel_op * (1 - sel_err);
#[MY_LOOKUP]
SEL_OP_NO_ERR { input } in dest.sel { output };
```

### SECURE: Multi-Error Gating
```pil
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err) * (1 - sel_div_0_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
```

## Illustrative Example: Ungated Arithmetic Lookup

```pil
// VULNERABLE: Ungated — fires on tag mismatch!
#[COMPARISON_CHECK]
sel_arith_op { ... } in comparator.sel { ... };

// SECURE: Properly gated
pol SEL_ARITH_NO_ERR = sel_arith_op * (1 - sel_err) * (1 - sel_tag_err);
#[COMPARISON_CHECK]
SEL_ARITH_NO_ERR { ... } in comparator.sel { ... };
```

**Impact**: Arithmetic operations fail on tag mismatch — lookups fire but destinations aren't emitted.

## Output Format

### Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t4-missing-error-gating` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-t4-missing-error-gating`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write `vm2-audit-t4-missing-error-gating.json` to output directory:

```json
{
  "skill": "vm2-audit-t4-missing-error-gating",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-missing-error-gating-filename-123-issue-type",
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
