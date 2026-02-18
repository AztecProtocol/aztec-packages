---
name: vm2-audit-t0-opcode-side-effects
description: Audit VM2/AVM opcode side effects for cross-layer consistency. Verifies that state-changing operations (tree writes, event emissions, L2-to-L1 messages) are properly tracked in simulation, recorded in tracegen with correct discard gating, and constrained in PIL.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Side Effects Audit

Audit for missing or incorrectly gated side effects across documentation, simulation, tracegen, and PIL layers. Side effects that fire without proper gating can persist state from reverted transactions.

## When to Use
- Auditing state-modifying opcodes
- Checking discard/revert flag handling
- Reviewing new side-effect opcodes
- Investigating state persistence bugs

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **Critical**: Side effect not gated by discard/error → reverted state persists
- **High**: Side effect tracked but wrong tree/counter affected
- **Medium**: Side effect in PIL but not documented
- **Low**: Documentation incomplete but implementation correct

## Background: Side Effects and Discard

Side effects are state changes that must be:
1. **Tracked** - recorded in simulation and trace
2. **Gated** - only persist if context succeeds
3. **Ordered** - sequenced correctly for tree operations

The `discard` flag indicates a failing context - side effects with `discard=1` must be ignored.

## Side Effect Operations

| Opcode | Side Effect | Tree/Target | Counter |
|--------|-------------|-------------|---------|
| EMITNOTEHASH | Insert note hash | Note Hash Tree | note_hash_counter |
| EMITNULLIFIER | Insert nullifier | Nullifier Tree | nullifier_counter |
| SSTORE | Write public data | Public Data Tree | public_data_writes |
| SENDL2TOL1MSG | Emit L2→L1 message | L2 to L1 Messages | l2_to_l1_counter |
| EMITUNENCRYPTEDLOG | Emit log | Unencrypted Logs | log_counter |

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/emitnotehash.md
yarn-project/simulator/docs/avm/opcodes/emitnullifier.md
yarn-project/simulator/docs/avm/opcodes/sstore.md
yarn-project/simulator/docs/avm/opcodes/sendl2tol1msg.md
yarn-project/simulator/docs/avm/opcodes/emitunencryptedlog.md
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/interfaces/merkle_db.hpp
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/merkle.cpp
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp
barretenberg/cpp/src/barretenberg/vm2/tracegen/note_hash_tree_trace.cpp
barretenberg/cpp/src/barretenberg/vm2/tracegen/nullifier_tree_trace.cpp
barretenberg/cpp/src/barretenberg/vm2/tracegen/public_data_tree_trace.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/opcodes/emit_notehash.pil
barretenberg/cpp/pil/vm2/opcodes/emit_nullifier.pil
barretenberg/cpp/pil/vm2/opcodes/sstore.pil
barretenberg/cpp/pil/vm2/opcodes/send_l2_to_l1_msg.pil
barretenberg/cpp/pil/vm2/merkle/note_hash_check.pil
barretenberg/cpp/pil/vm2/merkle/nullifier_check.pil
barretenberg/cpp/pil/vm2/merkle/public_data_check.pil
```

## Gating Pattern

Side effects MUST be gated by both `discard` and `sel_opcode_error`:

**Correct PIL pattern**:
```pil
// Side effect only fires when NOT discarding AND NOT error
pol commit sel_actual_side_effect;
sel_actual_side_effect = sel_execute_opcode * (1 - discard) * (1 - sel_opcode_error);

// Use gated selector for tree interaction
sel_actual_side_effect { value, address, ... } in tree_check.sel { ... };
```

**Incorrect (VULNERABLE)**:
```pil
// WRONG: Missing discard gating
sel_execute_opcode { value, address, ... } in tree_check.sel { ... };
```

## Workflow

### Step 1: Select Target Side-Effect Opcode
```bash
# List side-effect opcodes
ls yarn-project/simulator/docs/avm/opcodes/emit*.md
cat yarn-project/simulator/docs/avm/opcodes/sstore.md
```

### Step 2: Verify Documentation

Check documented behavior:
- What state is modified?
- What error conditions prevent the side effect?
- Is static call violation mentioned?

### Step 3: Verify Simulation Layer

Find opcode handler:
```bash
grep -A 50 "void Execution::emit_note_hash" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check:
1. Static call check BEFORE side effect
2. Counter limit check BEFORE side effect
3. Side effect method called (e.g., `merkle_db.note_hash_write()`)
4. Error thrown on failure

Example correct pattern:
```cpp
void Execution::emit_note_hash(ContextInterface& context, MemoryAddress addr) {
    // Tag validation and gas consumption first...

    // Static call check
    if (context.get_is_static()) {
        throw OpcodeExecutionException("Cannot emit in static call");
    }

    // Counter check
    if (counter >= MAX_NOTE_HASHES_PER_TX) {
        throw OpcodeExecutionException("Limit reached");
    }

    // Only then perform side effect
    merkle_db.note_hash_write(context.get_address(), value);
}
```

### Step 4: Verify Tracegen Layer

Find trace generation:
```bash
grep -n "emit_notehash\|EMITNOTEHASH" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check:
1. `discard` flag set correctly for failing contexts
2. Side effect event generated with discard info
3. Tree trace receives discard flag

Find tree trace:
```bash
grep -n "discard" src/barretenberg/vm2/tracegen/*tree_trace.cpp
```

### Step 5: Verify PIL Layer

Find opcode PIL:
```bash
cat pil/vm2/opcodes/emit_notehash.pil
```

Check for correct gating:
```pil
// MUST gate by both discard AND error
pol commit sel_write_note_hash;
sel_write_note_hash = sel_execute_emit_notehash * (1 - discard) * (1 - sel_opcode_error);
```

Verify tree interaction is gated:
```bash
grep -n "in.*note_hash_check\|permute.*note_hash" pil/vm2/opcodes/emit_notehash.pil
```

### Step 6: Verify Tree Constraint

Check tree PIL handles discard:
```bash
grep -n "discard" pil/vm2/merkle/note_hash_check.pil
```

Tree constraint should:
1. Include discard in tuple OR
2. Only fire when discard=0

### Step 7: Cross-Reference Findings

| Opcode | Static Check | Limit Check | Discard Gating | PIL Constraint | Match? |
|--------|--------------|-------------|----------------|----------------|--------|
| EMITNOTEHASH | Sim: Y | Sim: Y | Tracegen: ? | PIL: ? | ? |

## Common Mismatch Patterns

### 1. Missing Discard Gating (CRITICAL)
```pil
// WRONG: Side effect fires even on reverted context
sel_execute_emit_notehash { value, ... } in note_hash_check.sel { ... };

// CORRECT: Gated by discard
sel_write_note_hash = sel_execute_emit_notehash * (1 - discard) * (1 - sel_opcode_error);
sel_write_note_hash { value, ... } in note_hash_check.sel { ... };
```
**Severity**: Critical - allows reverted state to persist

### 2. Missing Error Gating
```pil
// WRONG: Side effect fires even on opcode error
sel_write = sel_execute_sstore * (1 - discard);  // Missing (1 - sel_opcode_error)!
```
**Severity**: Critical - side effect fires on error

### 3. Static Call Check Missing in Simulation
```cpp
void Execution::emit_nullifier(...) {
    // Missing: if (context.get_is_static()) throw ...
    merkle_db.nullifier_write(...);  // Writes in static context!
}
```
**Severity**: Critical - breaks static call guarantee

### 4. Counter Check Missing
```cpp
void Execution::emit_note_hash(...) {
    // Missing: if (counter >= MAX) throw ...
    merkle_db.note_hash_write(...);  // Can exceed limit!
}
```
**Severity**: High - can exceed protocol limits

### 5. Wrong Tree Targeted
```cpp
// Doc says write to Nullifier Tree
// Sim writes to Note Hash Tree
merkle_db.note_hash_write(...);  // Should be nullifier_write!
```
**Severity**: Critical - wrong state modified

### 6. Tracegen Missing Discard Flag
```cpp
// Tracegen generates event without discard info
NoteHashEvent event { .value = value };  // Missing .discard = context.is_failing()
```
**Severity**: High - trace won't have discard info for PIL

## FALSE POSITIVE FILTERING

### 1. Discard Handled by Interaction Destination
If the tree check PIL includes `discard` in its lookup tuple and ignores discard=1 rows, the gating is at the destination. Still verify this is correct.

### 2. Error Implies Discard
In some architectures, `sel_opcode_error` may automatically set `discard`. Verify this relationship before reporting double-gating as needed.

### 3. Read Operations Don't Need Gating
SLOAD, NOTEHASHEXISTS, etc. are read-only and don't need discard gating - they don't modify state.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-side-effects` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-side-effects-{opcode}-{issue}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Side Effect**: `{what state change}`
- **Issue**: `{missing gating / wrong tree / etc.}`
- **Layer**: `Simulation / Tracegen / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-side-effects.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-side-effects",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["EMITNOTEHASH", "EMITNULLIFIER", "SSTORE"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-side-effects-emitnotehash-discard-pil",
    "severity": "critical",
    "opcode": "EMITNOTEHASH",
    "side_effect": "Note hash tree insertion",
    "issue": "Missing discard gating on tree interaction",
    "layer": "PIL",
    "file": "pil/vm2/opcodes/emit_notehash.pil",
    "line": 28,
    "description": "Tree lookup fires without (1 - discard) gating",
    "fix": "Add sel_write = sel_execute * (1 - discard) * (1 - sel_opcode_error)"
  }]
}
```
