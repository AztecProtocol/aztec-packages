---
name: vm2-audit-missing-error-gating
description: Audit VM2/AVM PIL files for missing error gating on lookup/permutation interactions. Completeness issue where source selectors fire even when errors occur, causing interaction failures because the destination event was not emitted on the error path.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Error Gating Audit

Audits for missing error gating on interactions. **Completeness issue** - when errors occur, simulation doesn't emit destination events, but ungated source selectors still fire:

```pil
// VULNERABLE: Lookup fires even on error
pol SOURCE = sel_operation;
#[OPERATION_LOOKUP]
SOURCE { input } in dest.sel { dest.input };

// When sel_operation = 1 and sel_err = 1:
// - Source selector fires (sel_operation = 1)
// - But destination event was not emitted (error path)
// - Interaction fails!
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Interactions

```bash
# Find all lookup/permutation interactions
grep -nP '}\s*(in|is)\b' barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: Trace Source Selectors

For each interaction found:
1. Identify the source selector (left side of `in` or `is`)
2. Check if it's raw (`sel_op`) or derived (`sel_op * condition`)
3. Determine what error conditions can occur during this operation

### Step 3: List All Error Flags

```bash
# Find error-related columns
grep -rn "sel_err\|sel_.*_err\|err\|fail" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Common error flags to check:
| Flag | Meaning |
|------|---------|
| `sel_err` | General error |
| `sel_tag_err` | Type tag mismatch |
| `sel_div_0_err` | Division by zero |
| `sel_overflow_err` | Arithmetic overflow |
| `sel_bytecode_retrieval_failure` | Bytecode fetch failed |
| `sel_instruction_fetching_failure` | Instruction parse failed |

### Step 4: Verify Error Gating

For each interaction, verify the source selector is gated by relevant error flags:

```bash
# Check if selector is gated by error
grep -rn "sel_op.*1 - sel_err\|sel_op.*(1 - sel" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 5: Check Simulation Code

Review the corresponding simulation code to understand:
- Does the error path emit the destination event?
- If not, the source selector MUST be gated

## Patterns

### Vulnerable Pattern

```pil
// VULNERABLE: Lookup fires even on error
#[MY_LOOKUP]
sel_op { input } in dest.sel { output };
```

### Secure Pattern

```pil
// SECURE: Gate source by no-error condition
pol SEL_OP_NO_ERR = sel_op * (1 - sel_err);
#[MY_LOOKUP]
SEL_OP_NO_ERR { input } in dest.sel { output };
```

## Examples

### Example 1: ALU Lookups (PR #18192)
```pil
// BEFORE: Lookups not gated by error
#[GT_DIV_REMAINDER]
sel_div { ... } in gt.sel { ... };  // Fires on tag mismatch!

// AFTER: Properly gated
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
```
**Impact**: MUL, DIV, SHL, SHR operations failed on tag mismatch.

### Example 2: Execution Dispatch
```pil
// Gate bytecode/instruction lookups by error
pol SEL_FETCH = sel * (1 - sel_bytecode_retrieval_failure);
SEL_FETCH { ... } in bc_retrieval.sel { ... };
```

## References

- [PR #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) - ALU Pre-Audit

## REQUIRED OUTPUT FORMAT

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
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
<!-- END MACHINE-READABLE FINDINGS -->

For no findings:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
