---
name: vm2-audit-error-state-constraint-firing
description: Audit VM2/AVM PIL files for constraints that incorrectly fire during error states. Completeness issue where constraints enforce state transitions that conflict with error handling, causing verification failures when the next row has different requirements.
version: 1.0.0
---

# VM2 Error State Constraint Firing Audit

## Purpose
Detect constraints that fire during error states when they shouldn't, causing verification failures (completeness issue).

## When to Use
- Auditing PIL files for error handling correctness
- Investigating verification failures after errors
- Reviewing state propagation constraints

## The Bug Pattern

Constraints enforcing next-row state (`column' = expr`) fire during error rows, but error recovery requires different values:

```pil
// BUG: Fires during error, forcing internal_call_id' = 0
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;
// When call stack empty and error occurs: return_id = 0 -> internal_call_id' = 0
// But teardown call after error needs: internal_call_id' = 1
// CONTRADICTION!
```

## Workflow

### Step 1: Find State Propagation Constraints
```bash
grep -rn "'" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep -v "//"
```
Look for: `column' = expr`, `column' - expr = 0`, constraints gated by operation selectors

### Step 2: Identify Error Selectors
```bash
grep -rn "sel_err\|sel_opcode_error\|sel_.*_error\|nested_failure" \
    barretenberg/cpp/pil/vm2/ --include="*.pil" | grep "pol"
```
Common: `sel_opcode_error`, `sel_err`, `nested_failure`, `sel_parsing_err`

### Step 3: Check Error Gating
For each state propagation constraint, verify it's gated by error conditions:
1. Does this constraint fire when errors occur?
2. What value does it force on next row?
3. What does next row expect during error recovery (teardown, enqueued call, halt)?

### Step 4: Trace Error Flow
For error cases: Error on row N -> Row N+1 (teardown/enqueued call/halt) -> Do constraints conflict?

## Patterns

### Vulnerable: Unguarded Error Row Propagation
```pil
// VULNERABLE: Fires during error (sel_execute_internal_return=1, error=1)
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;
// Forces internal_call_id' = return_id = 0, but next enqueued call needs 1!
```

### Vulnerable: Missing Error Exclusion
```pil
// VULNERABLE: Missing * (1 - sel_error)
pol PROPAGATE = sel_op * (1 - other_condition);
PROPAGATE * (state' - derived_state) = 0;
```

### Secure: Error-Gated Propagation
```pil
// SECURE: Only fires when NOT in error state
pol SEL_NO_ERROR = sel_execute_internal_return * (1 - sel_opcode_error);
SEL_NO_ERROR * (internal_call_id' - internal_call_return_id) = 0;
```

## Real Bug Example (PR #19485)

```pil
// BEFORE (BUG):
sel_execute_internal_return * (internal_call_id' - internal_call_return_id) = 0;

// AFTER (FIX): Use selector that excludes error rows
sel_read_unwind_call_stack * (internal_call_id' - internal_call_return_id) = 0;
```

**Trigger conditions**: Error + empty call stack + teardown follows. Single enqueued call tests pass because next row defaults to zero.

## Key Files
- `pil/vm2/opcodes/internal_call.pil` - Internal call/return
- `pil/vm2/context.pil` - Context state propagation
- `pil/vm2/execution.pil` - Execution trace state

## Severity Assessment
- **Completeness bugs reachable via canonical simulation on valid inputs are Critical** - system doesn't work
- Theoretical/unreachable: Low to Medium

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-error-state-constraint-firing` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings
- **ID**: `vm2-audit-error-state-constraint-firing-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-error-state-constraint-firing",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-error-state-constraint-firing-filename-123-issue",
    "severity": "medium",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Brief description",
    "exploitability": "low",
    "fix": "Suggested fix"
  }]
}
```
