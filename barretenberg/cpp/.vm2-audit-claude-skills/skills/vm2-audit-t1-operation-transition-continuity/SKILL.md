---
name: vm2-audit-t1-operation-transition-continuity
description: Audit VM2/AVM execution trace for state continuity gaps during operation transitions, both in context/execution-level selectors and in multi-row gadget internal state machines. Covers two vulnerability classes - (1) context-level state variables left unconstrained when operation-type selectors disable default continuity, and (2) multi-row gadget lifecycle selectors (start/end) that allow premature termination, truncation, or skipping of internal state machine steps.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 2.0.0
---

# VM2 Operation Transition Continuity Audit

## Purpose
Detect state continuity gaps at two levels:
1. **Context/Execution transitions**: Operation-type selectors (`sel_enter_call`, `sel_exit_call`, `sel_error`) disable default continuity constraints, leaving state variables unconstrained during transitions.
2. **Multi-row gadget internal state machines**: Components with row-by-row lifecycle selectors (`start`/`end`, `sel_start`/`sel_end`) where the internal state machine can be prematurely terminated, truncated, or have rows skipped or injected.

## When to Use
- Auditing context.pil or execution.pil for soundness issues
- Reviewing call/return handling for state corruption vulnerabilities
- Checking tree root/size propagation across nested calls
- Auditing any multi-row gadget (data copy, hashing, scalar multiplication, merkle checks, bitwise ops, log emission, etc.) for lifecycle integrity
- Reviewing any PIL component that uses `start`/`end` or `sel_start`/`sel_end` selectors to gate a multi-row computation

## Part A: Context/Execution Operation Transition Gaps

### The Vulnerability Pattern

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

### Severity Assessment
- **Soundness** (malicious prover exploits): Critical - allows arbitrary state manipulation
- **Completeness** (honest prover fails): Low to Critical based on reachability
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

### Part A Workflow

#### Step 1: Find Operation-Type Selectors
```bash
grep -rn "sel_enter_call\|sel_exit_call\|sel_error\|DEFAULT_CTX_ROW" \
    barretenberg/cpp/pil/vm2/context.pil barretenberg/cpp/pil/vm2/execution.pil
```

#### Step 2: Identify State Variables Requiring Continuity

| Category | Variables |
|----------|-----------|
| Tree roots | `note_hash_tree_root`, `nullifier_tree_root`, `public_data_tree_root`, `written_public_data_slots_tree_root` |
| Tree sizes | `note_hash_tree_size`, `nullifier_tree_size`, `public_data_tree_size`, `written_public_data_slots_tree_size` |
| Side effects | `num_note_hashes_emitted`, `num_nullifiers_emitted`, `num_unencrypted_log_fields`, `num_l2_to_l1_messages` |
| Gas state | `l2_gas_used`, `da_gas_used`, `l2_gas_limit`, `da_gas_limit` |

#### Step 3: For Each State Variable, Check All Operation Types

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

#### Step 4: Verify Stack Interactions
Exit calls may rely on stack lookups. Verify ALL state variables are in stack interaction tuples.

### Part A: Vulnerable vs Secure Patterns

#### VULNERABLE: Only Default Row Constrained
```pil
pol DEFAULT_CTX_ROW = 1 - (sel_enter_call + sel_exit_call);
#[TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_CTX_ROW * (tree_root - prev_tree_root') = 0;
// NO constraint when sel_enter_call = 1!
```

#### SECURE: All Operation Types Covered
```pil
pol DEFAULT_OR_ENTER = DEFAULT_CTX_ROW + sel_enter_call;
#[TREE_ROOT_CONTINUITY]
NOT_LAST_EXEC * DEFAULT_OR_ENTER * (tree_root - prev_tree_root') = 0;
// OR separate constraints for each operation type
```

### Real Example (Commit 8d30e97)

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

---

## Part B: Multi-Row Gadget Internal State Machine Continuity

### The Vulnerability Class

Many VM2 components implement multi-row computations gated by lifecycle selectors (`start`/`end` or `sel_start`/`sel_end`). These gadgets have internal state machines where:
- A `start` row initializes the computation (counters, addresses, sizes)
- Intermediate rows decrement counters, advance addresses, and propagate invariants
- An `end` row marks completion, often determined by a counter reaching zero

**The risk**: If the `end` condition can be activated prematurely (before the internal state machine has fully completed), the gadget may truncate, skip rows, or produce partial results while appearing valid to the constraint system.

### Vulnerability Patterns in Multi-Row Gadgets

#### Pattern B1: Premature End Activation
```pil
// End is derived from a counter reaching zero
pol COUNTER_MINUS_ONE = counter - 1;
#[END_CONDITION]
SEL_ACTIVE * (COUNTER_MINUS_ONE * (end * (1 - inv) + inv) - 1 + end) = 0;

// QUESTION: Can SEL_ACTIVE be manipulated to disable the constraint on certain rows?
// QUESTION: Is the counter correctly initialized and does it always decrement by exactly 1?
// If SEL_ACTIVE = 0 on some intermediate row, end is unconstrained there.
```

#### Pattern B2: Gating Selector Disables Row Propagation
```pil
// Row propagation gated by (1 - end)
#[DECREMENT_COUNTER]
sel * (1 - end) * (counter' - counter + 1) = 0;

// If end = 1 prematurely, this constraint vanishes for subsequent rows.
// The computation appears "complete" to the constraint system with fewer rows than expected.
```

#### Pattern B3: Lifecycle Selector Composition Gap
```pil
// SEL_ACTIVE composed from start/end selectors
pol SEL_ACTIVE = start_no_err * (1 - some_flag) + sel * (1 - start);

// Check: does this composition cover ALL intermediate rows?
// If an intermediate row has start = 0 and sel = 1 but some other condition
// causes SEL_ACTIVE = 0, the end-condition constraint is disabled on that row.
```

#### Pattern B4: Missing Completion Enforcement
```pil
// Start-after-latch ensures new computation starts after end
#[START_AFTER_LATCH]
sel' * (start' - LATCH_CONDITION) = 0;

// BUT: Does this guarantee the PREVIOUS computation actually completed?
// Check: Is there a constraint like COMPUTATION_FINISH_AT_END that forces
// sel * (1 - sel') * (1 - end) = 0 ?
// Without it, the trace can simply stop being active (sel -> 0) mid-computation.
```

### Part B Workflow

#### Step 1: Discover All Multi-Row Gadgets
```bash
# Find all components with start/end lifecycle selectors
grep -rn "pol commit start\|pol commit end\|pol commit sel_start\|pol commit sel_end" \
    barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find LATCH_CONDITION patterns (strong indicator of multi-row gadget)
grep -rn "LATCH_CONDITION" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find computation-finish guards
grep -rn "COMPUTATION_FINISH\|finish\|TRACE_CONTINUITY" \
    barretenberg/cpp/pil/vm2/ --include="*.pil"
```

#### Step 2: For Each Gadget, Map the Internal State Machine

For every file found in Step 1, answer these questions:

| Question | What to check |
|----------|--------------|
| How is `end` determined? | Find the constraint that sets `end = 1`. Is it a zero-check on a counter? A comparison? |
| What gates the end-condition constraint? | What selector multiplies the end-condition? Can that selector be 0 on an intermediate row? |
| How are intermediate rows propagated? | Are counters, addresses, and invariants propagated with `(1 - end)` gating? |
| Is there a completion guard? | Does `sel * (1 - sel') * (1 - end) = 0` or equivalent exist? (Prevents trace from going inactive mid-computation) |
| Is there a start-after-latch guard? | Does `sel' * (start' - LATCH_CONDITION) = 0` exist? (Prevents extra rows between computations) |
| Are error paths handled? | If `err = 1`, is `end` forced to 1? Can error bypass intermediate constraints? |

#### Step 3: Trace Counter Initialization Through Dispatch

The counter that determines `end` (e.g., `copy_size`, `num_perm_rounds_rem`) is typically initialized via a permutation/lookup from the execution trace.

```bash
# Find dispatch permutations that initialize gadget state
grep -rn "DISPATCH_TO\|sel_start\|sel_cd_copy_start\|sel_rd_copy_start" \
    barretenberg/cpp/pil/vm2/execution.pil
```

**Check**: Is the initial counter value trustworthy? If it comes from a user-controlled register, can it be set to trigger premature end (e.g., counter = 1 when more rows are needed)?

#### Step 4: Verify Row-Count Consistency

For a multi-row gadget, the number of active rows should match the expected computation length. Check:

1. **Counter initialization**: Is `counter` set to the correct value at `start`?
2. **Counter decrement**: Does `counter` decrease by exactly 1 each non-end row?
3. **End condition**: Is `end = 1` if and only if `counter - 1 = 0`?
4. **No premature end**: Can `end` be set to 1 when `counter > 1`?

The critical invariant: **once a multi-row operation begins (start = 1), its internal state machine must fully execute through all expected rows before end can activate**.

#### Step 5: Check Interaction Between Error Handling and Lifecycle

Error handling can create shortcuts through the state machine:

```bash
# Find error-related end conditions
grep -rn "err.*end\|end.*err\|END_ON_ERR" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify that when errors force `end = 1`, all side effects (memory writes, lookups) are correctly suppressed for the skipped rows.

### Part B: Vulnerable vs Secure Patterns

#### VULNERABLE: End Condition Gated by Composite Selector
```pil
pol SEL_ACTIVE = start_no_err * (1 - flag) + sel * (1 - start);
// If flag = 1 on start row AND sel = 1, start = 1 on next row:
// SEL_ACTIVE = 0 on start row, so end is unconstrained
SEL_ACTIVE * (counter_minus_one * (end * (1 - inv) + inv) - 1 + end) = 0;
```

#### SECURE: End Condition Cannot Be Bypassed
```pil
// End is determined solely by the counter, gated by the base selector
sel * (counter_minus_one * (end * (1 - inv) + inv) - 1 + end) = 0;
// Plus completion guard:
sel * (1 - sel') * (1 - end) = 0;
// Plus start-after-latch:
sel' * (start' - LATCH_CONDITION) = 0;
```

---

## Key Files
- `pil/vm2/context.pil` - Tree state, continuity constraints (Part A)
- `pil/vm2/execution.pil` - Operation selectors, dispatch permutations (Parts A & B)
- `pil/vm2/context_stack.pil` - Stack for nested calls (Part A)
- All files under `pil/vm2/` containing `start`/`end` lifecycle selectors (Part B), including but not limited to gadgets for data copying, hashing, scalar multiplication, merkle checks, bitwise operations, log emission, and radix decomposition

## Related Skills
- **vm2-audit-missing-propagation**: Multi-row computation continuity (this skill: operation-type transitions and lifecycle integrity)
- **vm2-audit-interaction-tuple-completeness**: Stack interactions must include all state columns

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-operation-transition-continuity` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical (1 Part A, 1 Part B)"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Findings Format
- **ID**: `vm2-audit-t1-operation-transition-continuity-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **Category**: `context-transition-gap` (Part A) / `gadget-lifecycle-gap` (Part B)
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t1-operation-transition-continuity",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...", "severity": "critical", "category": "...",
    "file": "...", "line": 123,
    "description": "...", "exploitability": "high", "fix": "..."
  }]
}
```
