---
name: vm2-audit-error-state-constraint-firing
description: Audit VM2/AVM PIL files for constraints that incorrectly fire during error states. Completeness issue where constraints enforce state transitions that conflict with error handling, causing verification failures when the next row has different requirements.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Error State Constraint Firing Audit

Audits for constraints that fire during error states when they shouldn't. **Completeness issue** - error rows have different state expectations, and constraints designed for normal flow cause conflicts.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## The Problem

Some constraints enforce state transitions (e.g., "next row's X equals current Y"). During errors, the next row may have conflicting requirements:

```pil
// BUG: Fires during error, forcing internal_call_id' = 0
// When call stack is empty and error occurs: return_id = 0
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;

// But if there's a teardown call after error, other constraints require:
// internal_call_id' = 1  (new enqueued call starts at 1)

// CONTRADICTION: Can't be both 0 and 1!
```

## Instructions

### Step 1: Find State Propagation Constraints

```bash
# Find constraints that set next-row values
grep -rn "'" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "//"
```

Look for patterns like:
- `column' = expression` (next row equals something)
- `column' - expression = 0`
- Constraints gated by operation selectors

### Step 2: Identify Error-Related Selectors

```bash
# Find error selectors
grep -rn "sel_err\|sel_opcode_error\|sel_.*_error\|error\|failure" \
    barretenberg/cpp/pil/vm2/ --include="*.pil" | grep "pol commit\|pol "
```

Common error selectors:
- `sel_opcode_error` - Opcode execution error
- `sel_err` - General error flag
- `nested_failure` - Nested call failed
- `sel_parsing_err` - Instruction parsing error

### Step 3: Check If Constraints Are Error-Gated

For each state propagation constraint, check if it's gated by error conditions:

```bash
# Check specific constraint for error gating
grep -B2 -A2 "internal_call_id'" barretenberg/cpp/pil/vm2/opcodes/internal_call.pil
```

Questions to ask:
1. Does this constraint fire when errors occur?
2. What value does it force on the next row?
3. What does the next row expect during error recovery?

### Step 4: Trace Error Flow

For error cases, trace what happens to the next row:
1. Error occurs on row N
2. Row N+1 might be: teardown call, enqueued call start, or halt
3. What constraints apply to row N+1?
4. Do they conflict with row N's propagation?

```bash
# Find enqueued call start constraints
grep -rn "enqueued_call_start\|enqueued_call_end" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

## Patterns

### Vulnerable: Unguarded Error Row Propagation

```pil
// VULNERABLE: Fires during error (sel_execute_internal_return=1, error=1)
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;
// Forces internal_call_id' = return_id = 0 (stack empty)
// But next enqueued call needs internal_call_id' = 1!
```

### Vulnerable: Missing Error Exclusion

```pil
// VULNERABLE: Only excludes non-error cases
pol PROPAGATE = sel_op * (1 - other_condition);  // Missing: * (1 - sel_error)
PROPAGATE * (state' - derived_state) = 0;
```

### Secure: Error-Gated Propagation

```pil
// SECURE: Only fires when NOT in error state
pol SEL_NO_ERROR = sel_execute_internal_return * (1 - sel_opcode_error);
SEL_NO_ERROR * (internal_call_id' - internal_call_return_id) = 0;
```

### Secure: Use More Specific Selector

```pil
// SECURE: Use selector that excludes error cases
// sel_read_unwind_call_stack = sel_execute_internal_return * (1 - sel_opcode_error)
sel_read_unwind_call_stack * (internal_call_id' - internal_call_return_id) = 0;
```

## Examples

### Example 1: Internal Call Return (PR #19485)

```pil
// BEFORE (BUG):
// sel_execute_internal_return fires even during error
#[RESTORE_INTERNAL_ID_ON_RETURN]
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;

// When error occurs with empty call stack:
//   return_id = 0, so internal_call_id' = 0
// If teardown follows:
//   Other constraints require internal_call_id' = 1
// CONTRADICTION!

// AFTER (FIX):
// sel_read_unwind_call_stack excludes error rows
#[RESTORE_INTERNAL_ID_ON_RETURN]
sel_read_unwind_call_stack * (internal_call_id' - internal_call_return_id) = 0;
```

**Impact**: Verification failure when error occurs with empty call stack followed by teardown.

**Why missed**: Bug only manifests when:
1. Error occurs (sel_opcode_error=1)
2. Call stack is empty (return_id=0)
3. Teardown call follows (needs internal_call_id'=1)

Single enqueued call tests pass because next row defaults to zero.

## Key Files

- `pil/vm2/opcodes/internal_call.pil` - Internal call/return handling
- `pil/vm2/context.pil` - Context state propagation
- `pil/vm2/execution.pil` - Execution trace state

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-error-state-constraint-firing` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-error-state-constraint-firing-filename-123-issue-type` (MUST use full skill name: `vm2-audit-error-state-constraint-firing`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-error-state-constraint-firing.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-error-state-constraint-firing",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-error-state-constraint-firing-filename-123-issue-type",
      "severity": "medium",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "low",
      "fix": "Suggested fix"
    }
  ]
}
```

For no findings:
```json
{
  "skill": "vm2-audit-error-state-constraint-firing",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.
