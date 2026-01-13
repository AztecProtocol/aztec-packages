---
name: vm2-audit-missing-error-gating
description: Audit VM2/AVM PIL files for missing error gating on lookup/permutation interactions. Completeness issue where source selectors fire even when errors occur, causing interaction failures because the destination event was not emitted on the error path.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
version: 1.0.0
---

# VM2 Missing Error Gating Audit

Audits for missing error gating on interactions. **Completeness issue** - when errors occur, simulation doesn't emit destination events, but ungated source selectors still fire, causing lookup/permutation failures.

## Severity Assessment

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical**.

## When Usually NOT Needed

- Lookups to precomputed tables (these always emit rows regardless of error state)
- Operations that cannot produce errors (e.g., simple memory reads without type checks)
- If unsure whether an operation can error, still audit and verify destination emission

## The Problem

```pil
// VULNERABLE: Lookup fires even on error
#[OPERATION_LOOKUP]
sel_operation { input } in dest.sel { dest.input };

// When sel_operation = 1 AND an error occurs:
// - Source selector fires (sel_operation = 1)
// - But destination event was NOT emitted (error path skipped it)
// - Lookup fails: source row has no matching destination!
```

## Error Flags Reference

| Flag | Meaning | Common in |
|------|---------|-----------|
| `sel_err` | General error | execution.pil |
| `sel_tag_err` | Type tag mismatch | alu.pil, execution.pil |
| `sel_div_0_err` | Division by zero | alu.pil |
| `sel_overflow_err` | Arithmetic overflow | alu.pil |
| `sel_bytecode_retrieval_failure` | Bytecode fetch failed | execution.pil |
| `sel_instruction_fetching_failure` | Instruction parse failed | execution.pil |

## Workflow

### Step 1: Identify All Interactions

```bash
# Find all lookup/permutation interactions
grep -nP '}\s*(in|is)\b' pil/vm2/<component>.pil
```

### Step 2: For Each Interaction, Trace Source Selector

1. Identify the source selector (left side of `in` or `is`)
2. Check if it's raw (`sel_op`) or derived (`sel_op * (1 - sel_err)`)
3. Determine what error conditions can occur during this operation

### Step 3: Check Simulation Code

For each interaction:
1. Find the corresponding simulation code
2. Determine if errors can occur during this operation
3. If errors can occur, check if the destination event is emitted on error path
4. If destination NOT emitted on error, source MUST be gated

```bash
# Find simulation code for the operation
grep -rn "<operation_name>" src/barretenberg/vm2/simulation/ --include="*.cpp"
```

### Step 4: Verify Error Gating

For each interaction where errors can occur and destination is not emitted:

```bash
# Check if source selector is gated by error flags
grep -B5 "<interaction_name>" pil/vm2/<component>.pil
```

Look for patterns like:
- `sel_op * (1 - sel_err)` - gated by general error
- `sel_op * (1 - sel_tag_err) * (1 - sel_err)` - gated by multiple errors

## Pattern Checklist

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
// Source only fires when no error
```

### SECURE: Multi-Error Gating
```pil
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err) * (1 - sel_div_0_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
// Gated by all possible error types for division
```

## Real Example: ALU Lookups (PR #18192)

```pil
// BEFORE: Lookups not gated by error
#[GT_DIV_REMAINDER]
sel_div { ... } in gt.sel { ... };  // Fires on tag mismatch!

// AFTER: Properly gated
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
```

**Impact**: MUL, DIV, SHL, SHR operations failed on tag mismatch because lookups fired but destinations weren't emitted.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-missing-error-gating` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-missing-error-gating-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write `vm2-audit-missing-error-gating.json` to the output directory:

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
