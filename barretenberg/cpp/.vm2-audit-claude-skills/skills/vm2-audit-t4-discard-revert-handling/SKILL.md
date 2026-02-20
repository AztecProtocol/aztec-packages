---
name: vm2-audit-t4-discard-revert-handling
description: Audit VM2/AVM PIL files for discard/revert flag handling. High severity soundness issue where the discard flag indicating failed contexts is not properly handled, allowing side effects from reverted transactions to persist including nullifiers, note hashes, L2-to-L1 messages, and state changes.
version: 1.0.0
---

# VM2 Discard/Revert Flag Handling Audit

## Purpose
Detect missing discard flag gating that allows reverted state to persist (nullifiers, note hashes, L2-to-L1 messages, storage writes).

## When to Use
- Auditing PIL files for discard/revert handling
- Reviewing side-effect operations (emit, append, write, store)
- Checking count/accumulator updates for proper gating

## Key Concepts

```pil
// discard = 1: context or ancestor failed, side effects must be discarded
// dying_context_id: oldest failed ancestor (discard = 1 iff dying_context_id != 0)
```

## Workflow

### Step 1: Identify Side-Effect Operations

```bash
grep -n "emit\|append\|write\|store\|nullifier\|note_hash\|l2_to_l1\|log" pil/vm2/*.pil
grep -n "should_\|sel_emit\|sel_append\|sel_write" pil/vm2/*.pil
```

Side effects: note hashes, nullifiers, L2-to-L1 messages, SSTORE, logs, state mods.

### Step 2: Verify Discard Gating

Each side effect MUST be gated by `(1 - discard)`:

```bash
grep -n "discard\|1 - discard" pil/vm2/<component>.pil
```

Required pattern:
```pil
pol GATED_SELECTOR = raw_selector * (1 - discard);
```

### Step 3: Check Count/Accumulator Updates

```bash
grep -n "num_\|count\|_cnt\|total_" pil/vm2/<component>.pil
```

Verify: increments gated by `(1 - discard)`, no counting discarded ops.

### Step 4: Verify Discard Propagation

```bash
grep -n "discard'\|dying_context\|DISCARD\|DYING" pil/vm2/<component>.pil
```

Check: propagates to children, clears on resolution, failure implies discard.

### Step 5: Check Interaction Tuples for Discard Field

```bash
grep -n "} in \|} is " pil/vm2/<component>.pil
```

For each cross-context interaction tuple (lookups/permutations between components that involve context state):
1. **Extract the tuple columns**: List all fields in `{ field1, field2, ... }`
2. **Check if `discard` is included**: If the interaction crosses context boundaries (e.g., execution ↔ tx, context_stack ↔ execution), the `discard` field MUST appear in both source and destination tuples
3. **Verify both sides match**: The source tuple must include `discard` AND the destination tuple must include a corresponding `discard` column

**Missing discard in cross-context tuples is Critical**: A malicious prover can set different discard values on source vs destination, bypassing revert semantics entirely.

```bash
# Specifically hunt for cross-context interactions missing discard
grep -rn "} in \|} is " pil/vm2/ --include="*.pil" | grep -i "context\|call\|enqueue\|return\|stack"
```

### Step 6: Review Tracegen

```bash
grep -rn "discard" --include="*.cpp" src/barretenberg/vm2/tracegen/<component>*.cpp
```

Verify columns and events gated by discard check.

## Vulnerable vs Secure Patterns

### Side Effect Not Gated (VULNERABLE)
```pil
pol commit should_emit;
should_emit { data } permute emit_trace.sel { emit_trace.data };
```

### Side Effect Gated (SECURE)
```pil
pol SHOULD_EMIT = should_emit_raw * (1 - discard);
SHOULD_EMIT { data } permute emit_trace.sel { emit_trace.data };
```

### Count Without Discard (VULNERABLE)
```pil
sel * (num_emissions' - num_emissions - should_emit) = 0;
```

### Count With Discard (SECURE)
```pil
sel * (num_emissions' - num_emissions - should_emit_raw * (1 - discard)) = 0;
```

### Tuple Missing Discard (VULNERABLE)
```pil
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
```

### Tuple With Discard (SECURE)
```pil
sel { context_id, success, discard } in tx.sel { tx.context_id, tx.success, tx.discard };
```

## Example Patterns: Reverted Side-Effect Not Discarded

**Pattern A - Ungated counter increment**: A side-effect counter (e.g., `num_appended`) is incremented using a raw selector without checking `(1 - discard)`. Reverted operations are counted, inflating the final tally.
Fix: `pol SHOULD_APPEND = raw_append_sel * (1 - discard);` then use `SHOULD_APPEND` in the counter update.

**Pattern B - Tracegen missing discard check**: The trace generator populates a side-effect flag without checking the discard status. The C++ code sets the flag based on the opcode alone, ignoring whether the context was reverted.
Fix: Add `&& !discard` to the condition that sets the flag in tracegen.

**Pattern C - Lookup tuple missing discard**: An interaction tuple for a cross-context operation omits the discard field, allowing the prover to set different discard values on each side.
Fix: Include the discard column in both source and destination tuples.

## Severity Assessment

- **Soundness** (malicious prover): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability
- Completeness bugs reachable via canonical simulation on valid inputs = **Critical**

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t4-discard-revert-handling` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Findings

- **ID**: `vm2-audit-t4-discard-revert-handling-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path:line`
- **Description**: Brief
- **Fix**: One-line

### JSON Output (Required)

Write `vm2-audit-t4-discard-revert-handling.json` to specified output directory:

```json
{
  "skill": "vm2-audit-t4-discard-revert-handling",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-discard-revert-handling-file-123-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "...",
    "exploitability": "high",
    "fix": "..."
  }]
}
```
