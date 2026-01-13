---
name: vm2-audit-missing-error-gating
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

### 1. Identify All Interactions
```bash
grep -nP '}\s*(in|is)\b' pil/vm2/<component>.pil
```

### 2. For Each Interaction
1. Identify source selector (left side of `in` or `is`)
2. Check if raw (`sel_op`) or gated (`sel_op * (1 - sel_err)`)
3. Determine what errors can occur during this operation

### 3. Check Simulation Code
```bash
grep -rn "<operation_name>" src/barretenberg/vm2/simulation/ --include="*.cpp"
```
- Can errors occur during this operation?
- Is destination event emitted on error path?
- If NOT emitted on error, source MUST be gated

### 4. Verify Error Gating
```bash
grep -B5 "<interaction_name>" pil/vm2/<component>.pil
```

Look for:
- `sel_op * (1 - sel_err)` - gated by general error
- `sel_op * (1 - sel_tag_err) * (1 - sel_err)` - multi-error gating

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

## Real Example: ALU Lookups (PR #18192)

```pil
// BEFORE: Ungated - fires on tag mismatch!
#[GT_DIV_REMAINDER]
sel_div { ... } in gt.sel { ... };

// AFTER: Properly gated
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
```

**Impact**: MUL, DIV, SHL, SHR failed on tag mismatch - lookups fired but destinations weren't emitted.

## Output Format

### Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-missing-error-gating` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-missing-error-gating-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write `vm2-audit-missing-error-gating.json` to output directory:

```json
{
  "skill": "vm2-audit-missing-error-gating",
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
