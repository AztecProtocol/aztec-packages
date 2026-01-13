---
name: vm2-audit-discard-revert-handling
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

### Step 5: Check Interaction Tuples

```bash
grep -n "} in \|} is " pil/vm2/<component>.pil
```

Verify discard field included where relevant.

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

## Real Bug Examples

**PR #18606 - L2-to-L1 Count**: Count updated without checking discard. Fix: `pol SHOULD_APPEND = raw * (1 - discard);`

**PR #18606 - Tracegen**: `tx_should_l2_l1_msg_append` ignored discard. Fix: check `&& !discard`.

**PR #19149 - Lookup Tuple**: End enqueued call missing discard field. Fix: include discard in tuple.

## Severity Assessment

- **Soundness** (malicious prover): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability
- Completeness bugs reachable via canonical simulation on valid inputs = **Critical**

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-discard-revert-handling` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical, 1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Findings

- **ID**: `vm2-audit-discard-revert-handling-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path:line`
- **Description**: Brief
- **Fix**: One-line

### JSON Output (Required)

Write `vm2-audit-discard-revert-handling.json` to specified output directory:

```json
{
  "skill": "vm2-audit-discard-revert-handling",
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
