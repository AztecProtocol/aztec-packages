---
name: vm2-audit-operation-transition-continuity
description: Audit VM2/AVM execution trace for state continuity gaps during operation transitions. Critical soundness issue where default continuity constraints are gated by operation-type selectors (DEFAULT_CTX_ROW), leaving state variables unconstrained when sel_enter_call, sel_exit_call, or sel_error are active. Allows malicious provers to set arbitrary tree roots, sizes, or context state during transitions.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Operation Transition Continuity Audit

## Purpose
Detect state continuity gaps where operation-type selectors (`sel_enter_call`, `sel_exit_call`, `sel_error`) disable default continuity constraints, leaving state variables unconstrained during transitions.

## When to Use
- Auditing context.pil or execution.pil for soundness issues
- Reviewing call/return handling for state corruption vulnerabilities
- Checking tree root/size propagation across nested calls

## The Vulnerability Pattern

```pil
// DEFAULT_CTX_ROW = 1 for normal rows, 0 for special operations
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);

// Continuity ONLY fires when DEFAULT_CTX_ROW = 1
#[STATE_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (state - prev_state') = 0;

// PROBLEM: When sel_enter_call = 1, DEFAULT_CTX_ROW = 0
// Constraint becomes: NOT_LAST_EXEC * 0 * (...) = 0 -- ALWAYS TRUE
// Prover can set prev_state' to ANY value on nested context's first row
```

**Impact**: Arbitrary tree state in nested calls, bypassed Merkle proofs, cross-context corruption.

## Workflow

### Step 1: Find Operation-Type Selectors
```bash
grep -rn "sel_enter_call\|sel_exit_call\|sel_error\|DEFAULT_CTX_ROW" \
    barretenberg/cpp/pil/vm2/context.pil barretenberg/cpp/pil/vm2/execution.pil
```

### Step 2: Identify State Variables Requiring Continuity

| Category | Variables |
|----------|-----------|
| Tree roots | `note_hash_tree_root`, `nullifier_tree_root`, `public_data_tree_root`, `written_public_data_slots_tree_root` |
| Tree sizes | `note_hash_tree_size`, `nullifier_tree_size`, `public_data_tree_size`, `written_public_data_slots_tree_size` |
| Side effects | `num_note_hashes_emitted`, `num_nullifiers_emitted`, `num_unencrypted_log_fields`, `num_l2_to_l1_messages` |
| Gas state | `l2_gas_used`, `da_gas_used`, `l2_gas_limit`, `da_gas_limit` |

### Step 3: For Each State Variable, Check All Operation Types

| Operation | Selector | Expected Behavior |
|-----------|----------|-------------------|
| Default row | `DEFAULT_CTX_ROW = 1` | State propagates unchanged |
| Enter call | `sel_enter_call = 1` | State propagates to nested context |
| Exit (return) | `nested_return = 1` | State restored from stack |
| Exit (rollback) | `nested_failure = 1` | State restored from stack |
| Error | `sel_error = 1` | Depends on error type |

```bash
# Check for enter_call constraints (often missing!)
grep -rn "sel_enter_call.*tree\|sel_enter_call.*size" barretenberg/cpp/pil/vm2/context.pil

# Check stack interactions include all state columns
grep -A30 "CTX_STACK_CALL\|CTX_STACK_RETURN" barretenberg/cpp/pil/vm2/context.pil
```

### Step 4: Verify Stack Interactions
Exit calls may rely on stack lookups. Verify ALL state variables are in stack interaction tuples.

## Vulnerable vs Secure Patterns

### VULNERABLE: Only Default Row Constrained
```pil
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);
#[TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (tree_root - prev_tree_root') = 0;
// NO constraint when sel_enter_call = 1!
```

### SECURE: All Operation Types Covered
```pil
pol DEFAULT_OR_ENTER = DEFAULT_CTX_ROW + sel_enter_call;
#[TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_OR_ENTER * (tree_root - prev_tree_root') = 0;
// OR separate constraints for each operation type
```

## Real Example (Commit 8d30e97)

```pil
// BEFORE (VULNERABLE):
#[NOTE_HASH_TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_OR_NESTED_RETURN * (note_hash_tree_root - prev_note_hash_tree_root') = 0;
// sel_enter_call rows had NO constraint - nested context could start with arbitrary tree state!

// AFTER (FIXED):
#[NOTE_HASH_TREE_ROOT_ENTER_CALL]
NOT_LAST_EXEC * sel_enter_call * (note_hash_tree_root - prev_note_hash_tree_root') = 0;
```

**Exploit**: Execute CALL with valid tree state -> start nested context with ARBITRARY tree state -> bypass all Merkle proofs -> steal funds.

## Key Files
- `pil/vm2/context.pil` - Tree state, continuity constraints
- `pil/vm2/execution.pil` - Operation selectors
- `pil/vm2/context_stack.pil` - Stack for nested calls

## Related Skills
- **vm2-audit-missing-propagation**: Multi-row computation continuity (this skill: operation-type transitions)
- **vm2-audit-interaction-tuple-completeness**: Stack interactions must include all state columns

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-operation-transition-continuity` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Findings Format
- **ID**: `vm2-audit-operation-transition-continuity-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-operation-transition-continuity",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...", "severity": "critical", "file": "...", "line": 123,
    "description": "...", "exploitability": "high", "fix": "..."
  }]
}
```
