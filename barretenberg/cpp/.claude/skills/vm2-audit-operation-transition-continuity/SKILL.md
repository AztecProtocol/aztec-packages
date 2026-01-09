---
name: vm2-audit-operation-transition-continuity
description: Audit VM2/AVM execution trace for state continuity gaps during operation transitions. Critical soundness issue where default continuity constraints are gated by operation-type selectors (DEFAULT_CTX_ROW), leaving state variables unconstrained when sel_enter_call, sel_exit_call, or sel_error are active. Allows malicious provers to set arbitrary tree roots, sizes, or context state during transitions.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Operation Transition Continuity Audit Skill

## Overview

This skill audits VM2/AVM execution trace PIL for state continuity gaps during operation transitions. The execution trace uses operation-specific selectors (`sel_enter_call`, `sel_exit_call`, `sel_error`) that disable default continuity constraints, potentially leaving state variables unconstrained during critical transitions.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Medium

## Why This is Critical

State continuity gaps during operation transitions enable catastrophic attacks:
- **Arbitrary tree state in nested calls**: Start child context with fake tree roots/sizes
- **Bypass Merkle proofs**: Skip validation by claiming arbitrary state
- **State corruption across contexts**: Leak/corrupt state between execution contexts
- **Silent state manipulation**: No error signal when state is manipulated

## The Problematic Pattern

The execution trace uses conditional selectors to handle different operation types:

```pil
// DEFAULT_CTX_ROW = 1 for "normal" rows, 0 for special operations
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);

// Continuity constraint ONLY fires when DEFAULT_CTX_ROW = 1
#[STATE_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (state - prev_state') = 0;

// PROBLEM: When sel_enter_call = 1:
//   DEFAULT_CTX_ROW = 1 - 1 - 0 = 0
//   Constraint becomes: NOT_LAST_EXEC * 0 * (state - prev_state') = 0
//   This is ALWAYS satisfied regardless of state values!
```

**Impact**: A malicious prover can set `prev_state'` (the state on the next row, i.e., the first row of the nested context) to ANY value when `sel_enter_call = 1`.

## Required Constraint Pattern

For COMPLETE coverage, state variables need constraints for EACH operation type:

```pil
// Pattern 1: Default rows - state propagates unchanged
#[STATE_CONTINUITY_DEFAULT]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (state - prev_state') = 0;

// Pattern 2: Enter call - state MUST propagate to nested context
#[STATE_CONTINUITY_ENTER_CALL]
NOT_LAST_EXEC * sel_enter_call * (state - prev_state') = 0;

// Pattern 3: Exit call - state handled via stack restore (may differ)
// (Often constrained via CTX_STACK_ROLLBACK/RETURN lookups instead)

// Pattern 4: Error rows - may need explicit handling
#[STATE_CONTINUITY_ERROR]
NOT_LAST_EXEC * sel_error * (state - prev_state') = 0;
```

## Audit Instructions

> **Note**: This skill focuses on `context.pil` and `execution.pil` which manage the execution trace state transitions.

### Step 1: Identify Operation Type Selectors

```bash
# Find operation-type selectors in execution trace
grep -rn "sel_enter_call\|sel_exit_call\|sel_error\|sel_execute_\|enqueued_call" \
    barretenberg/cpp/pil/vm2/context.pil barretenberg/cpp/pil/vm2/execution.pil

# Find composite selectors that gate constraints
grep -rn "DEFAULT_CTX_ROW\|DEFAULT_OR_\|NOT_LAST_EXEC" \
    barretenberg/cpp/pil/vm2/context.pil
```

### Step 2: Identify State Variables Needing Continuity

State variables that should be continuous across operation transitions:

| Category | Variables | Expected Behavior |
|----------|-----------|-------------------|
| Tree roots | `note_hash_tree_root`, `nullifier_tree_root`, `public_data_tree_root`, `written_public_data_slots_tree_root` | Continue unchanged into nested call |
| Tree sizes | `note_hash_tree_size`, `nullifier_tree_size`, `public_data_tree_size`, `written_public_data_slots_tree_size` | Continue unchanged into nested call |
| Side effect counts | `num_note_hashes_emitted`, `num_nullifiers_emitted`, `num_unencrypted_log_fields`, `num_l2_to_l1_messages` | Continue unchanged into nested call |
| Gas state | `l2_gas_used`, `da_gas_used`, `l2_gas_limit`, `da_gas_limit` | May change based on call allocation |

```bash
# Find state variables in context.pil
grep -rn "pol commit.*tree_root\|pol commit.*tree_size\|pol commit.*_emitted\|pol commit.*gas" \
    barretenberg/cpp/pil/vm2/context.pil
```

### Step 3: Analyze Continuity Constraints

For each state variable, check if continuity is enforced for ALL operation types:

```bash
# Find continuity constraints
grep -rn "CONTINUITY\|prev_.*'" barretenberg/cpp/pil/vm2/context.pil

# Check what gates each constraint
grep -B2 -A1 "tree_root.*-.*prev\|prev.*tree_root" barretenberg/cpp/pil/vm2/context.pil
```

For each continuity constraint found:
1. What selector(s) gate the constraint?
2. When is the gate selector 0 (constraint disabled)?
3. Are there sister constraints for those cases?

### Step 4: Check Each Operation Type

For each state variable, verify constraints exist for:

| Operation Type | Selector | What Should Happen |
|----------------|----------|-------------------|
| Default row | `DEFAULT_CTX_ROW = 1` | State propagates unchanged |
| Enter call | `sel_enter_call = 1` | State propagates to nested context |
| Exit call (return) | `nested_return = 1` | State restored from stack |
| Exit call (rollback) | `nested_failure = 1` | State restored from stack |
| Error | `sel_error = 1` | Depends on error type |
| Enqueued call start | `enqueued_call_start = 1` | May have special init |

```bash
# Check enter_call constraints
grep -rn "sel_enter_call.*tree\|sel_enter_call.*size\|sel_enter_call.*emitted" \
    barretenberg/cpp/pil/vm2/context.pil

# Check exit_call/return constraints
grep -rn "nested_return\|nested_failure\|sel_exit_call" \
    barretenberg/cpp/pil/vm2/context.pil
```

### Step 5: Check Stack Interactions

Exit calls may rely on stack lookups/permutations for state restoration:

```bash
# Find context stack interactions
grep -rn "CTX_STACK\|context_stack" barretenberg/cpp/pil/vm2/context.pil

# Check what columns are included in stack interactions
grep -A30 "CTX_STACK_CALL\|CTX_STACK_ROLLBACK\|CTX_STACK_RETURN" \
    barretenberg/cpp/pil/vm2/context.pil
```

Verify that ALL state variables needing restoration are included in stack interaction tuples.

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Only Default Row Constrained

```pil
// VULNERABLE: Only fires when DEFAULT_CTX_ROW = 1
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);

#[NOTE_HASH_TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (note_hash_tree_root - prev_note_hash_tree_root') = 0;

// When sel_enter_call = 1: DEFAULT_CTX_ROW = 0, constraint is 0 = 0 (always true!)
// Malicious prover sets arbitrary prev_note_hash_tree_root' for nested context
```

### Vulnerable Pattern: Missing Operation Type

```pil
// VULNERABLE: Missing constraint for enter_call
#[STATE_CONTINUITY_DEFAULT]
DEFAULT_CTX_ROW * (state - prev_state') = 0;

#[STATE_CONTINUITY_RETURN]
nested_return * (state - stack_state) = 0;

// Missing: sel_enter_call case!
```

### Secure Pattern: All Operation Types Covered

```pil
// SECURE: Explicit constraints for each operation type
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);
pol DEFAULT_OR_NESTED_RETURN = DEFAULT_CTX_ROW + nested_return;

// Default rows and returns: state propagates
#[NOTE_HASH_TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_OR_NESTED_RETURN * (note_hash_tree_root - prev_note_hash_tree_root') = 0;

// Enter call: state ALSO propagates (explicit constraint)
#[NOTE_HASH_TREE_ROOT_ENTER_CALL]
NOT_LAST_EXEC * sel_enter_call * (note_hash_tree_root - prev_note_hash_tree_root') = 0;

// Rollback: state restored from stack (via CTX_STACK_ROLLBACK lookup)
```

### Secure Pattern: Combined Selector

```pil
// SECURE: Use combined selector that covers all propagation cases
pol PROPAGATE_STATE = DEFAULT_CTX_ROW + sel_enter_call + nested_return;

#[STATE_CONTINUITY]
NOT_LAST_EXEC * PROPAGATE_STATE * (state - prev_state') = 0;
```

## Historical Examples

### Example 1: Context Tree Roots/Sizes (Commit 8d30e97)

```pil
// BEFORE (VULNERABLE):
// Only DEFAULT_OR_NESTED_RETURN gated continuity
#[NOTE_HASH_TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_OR_NESTED_RETURN * (note_hash_tree_root - prev_note_hash_tree_root') = 0;

// sel_enter_call rows had NO constraint on tree state!
// Nested context could start with arbitrary tree roots/sizes

// AFTER (FIXED - expected):
// Add explicit enter_call constraint
#[NOTE_HASH_TREE_ROOT_ENTER_CALL]
NOT_LAST_EXEC * sel_enter_call * (note_hash_tree_root - prev_note_hash_tree_root') = 0;
```

**Impact**: A malicious prover could:
1. Execute a CALL instruction with valid tree state
2. Start nested context with ARBITRARY tree state
3. Bypass all Merkle proofs (SLOAD, SSTORE, NOTEHASH_EXISTS, etc.)
4. Read/write arbitrary values, steal funds, corrupt global state

## Audit Checklist

1. **Identify all operation-type selectors**:
   - [ ] `sel_enter_call` (entering nested call)
   - [ ] `sel_exit_call` (exiting call)
   - [ ] `nested_return` (successful return from nested call)
   - [ ] `nested_failure` (error/revert in nested call)
   - [ ] `sel_error` (execution error)
   - [ ] `enqueued_call_start` (start of enqueued call)
   - [ ] `enqueued_call_end` (end of enqueued call)

2. **Identify state variables needing continuity**:
   - [ ] Tree roots (`note_hash_tree_root`, `nullifier_tree_root`, etc.)
   - [ ] Tree sizes (`note_hash_tree_size`, `nullifier_tree_size`, etc.)
   - [ ] Side effect counts (`num_note_hashes_emitted`, etc.)
   - [ ] Gas state (may have special handling)
   - [ ] Other context state

3. **For each state variable, verify ALL operation types have constraints**:
   - [ ] Default rows (DEFAULT_CTX_ROW = 1)
   - [ ] Enter call (sel_enter_call = 1)
   - [ ] Exit call return (nested_return = 1)
   - [ ] Exit call rollback (nested_failure = 1)
   - [ ] Error rows (if applicable)
   - [ ] Enqueued call boundaries (if applicable)

4. **Check composite selectors for gaps**:
   - [ ] Does `DEFAULT_CTX_ROW` exclude any operation types?
   - [ ] Does `DEFAULT_OR_NESTED_RETURN` cover enter_call?
   - [ ] Are there edge cases not covered by any selector?

5. **Verify stack interactions include all state**:
   - [ ] CTX_STACK_CALL includes all state pushed to stack
   - [ ] CTX_STACK_ROLLBACK restores all state from stack
   - [ ] CTX_STACK_RETURN restores necessary state from stack

6. **Write negative tests for each operation type**:
   - [ ] Test arbitrary state on enter_call
   - [ ] Test arbitrary state on exit_call
   - [ ] Test state mismatch between caller and callee

## Fix Pattern

```pil
// Option 1: Add explicit constraint for missing operation type
#[STATE_ENTER_CALL]
NOT_LAST_EXEC * sel_enter_call * (state - prev_state') = 0;

// Option 2: Expand composite selector to include missing type
pol PROPAGATE_STATE = DEFAULT_CTX_ROW + sel_enter_call + nested_return;
#[STATE_CONTINUITY]
NOT_LAST_EXEC * PROPAGATE_STATE * (state - prev_state') = 0;

// Option 3: Ensure stack interactions include state
#[CTX_STACK_CALL]
sel_enter_call {
    ...,
    note_hash_tree_root,  // Include in stack push
    note_hash_tree_size,
    ...
} is context_stack.sel { ... };
```

## Key Files to Audit

- `pil/vm2/context.pil` - Main context management, tree state, continuity
- `pil/vm2/execution.pil` - Operation dispatching, selector definitions
- `pil/vm2/context_stack.pil` - Context stack for nested calls

## Relationship to Other Skills

- **vm2-audit-missing-propagation**: Focuses on multi-row computation continuity. This skill focuses on operation-type transition continuity.
- **vm2-audit-missing-initialization**: Focuses on first-row initialization. This skill focuses on mid-trace operation transitions.
- **vm2-audit-interaction-tuple-completeness**: Related - stack interactions must include all state columns.

## References

- [Context PIL Test](../../../src/barretenberg/vm2/constraining/relations/context.test.cpp)
- [Missing Propagation Skill](../vm2-audit-missing-propagation/SKILL.md)
- [Interaction Tuple Completeness Skill](../vm2-audit-interaction-tuple-completeness/SKILL.md)

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | vm2-audit-operation-transition-continuity |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-operation-transition-continuity-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "vm2-audit-operation-transition-continuity",
  "finding_prefix": "vm2-audit-operation-transition-continuity",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-operation-transition-continuity-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `vm2-audit-operation-transition-continuity-[filename]-[line]-[subtype]`
- Example: `vm2-audit-operation-transition-continuity-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
