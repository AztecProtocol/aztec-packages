---
name: vm2-audit-side-effect-gating
description: Audit VM2/AVM PIL files for ungated side effects. Critical soundness issue where tree writes, public input updates, or event emissions fire without proper (1 - discard) * (1 - error) gating, allowing reverted state to persist.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Side Effect Gating Audit

## Purpose
Detect side-effect interactions (tree writes, public inputs, logs) that aren't gated by discard and error flags, allowing reverted/failed context state to persist.

**Complements**: `vm2-audit-discard-revert-handling` (focuses on flag propagation). This skill focuses on interaction selectors.

## When to Use
- Auditing emit/append/write operations
- Reviewing new side-effect interactions
- Checking public input writes

## Severity Assessment
- **Critical**: Tree write ungated (nullifier, note_hash, storage)
- **High**: Public input write ungated
- **Medium**: Log/message ungated

## Core Pattern

```pil
// VULNERABLE: Side effect fires when discarded
pol commit should_emit;
should_emit { data } is destination.write { destination.data };

// SECURE: Proper gating
pol SHOULD_EMIT = raw_should_emit * (1 - error) * (1 - discard);
SHOULD_EMIT { data } is destination.write { destination.data };
```

## Side Effects to Check

| Category | Destinations |
|----------|-------------|
| **Trees** | `note_hash_tree_check.write`, `nullifier_check.write`, `public_data_check.write` |
| **Public Inputs** | `public_inputs.sel` |
| **Messages** | `l2_to_l1_msg`, `unencrypted_log` |
| **Storage** | `written_public_data_slots` |

## Workflow

### Step 1: Find Side-Effect Interactions
```bash
# Permutations (writes use 'is' or 'permute')
grep -rn "} is \|} permute " pil/vm2/ --include="*.pil" | grep -E "write|emit|append|store|log|msg"
```

### Step 2: Identify Source Selector
For each interaction `sel { ... } is dest { ... }`, extract `sel`.

### Step 3: Check Discard Gating
```bash
# Direct gating
grep -n "selector.*(1 - discard)" pil/vm2/<file>.pil

# Derived selector with gating
grep -n "pol SELECTOR = .*(1 - discard)" pil/vm2/<file>.pil
```

### Step 4: Check Error Gating
```bash
grep -n "selector.*(1 - error)\|selector.*(1 - sel_opcode_error)" pil/vm2/<file>.pil
```

### Step 5: Trace Selector Derivation
If selector is derived (`pol SEL = expr`), check if `(1 - discard)` appears anywhere in the chain.

## False Positive Avoidance

| Pattern | Why Safe |
|---------|----------|
| **Read-only lookup** | `sel { X } in table { Y }` - reads don't need gating |
| **TX-level operation** | Protocol fees, finalization - no context discard |
| **Discard in tuple** | `sel { data, discard } is dest { ... }` - destination handles |
| **Cleanup path** | `sel * discard` - intentional discard-path operation |

### Distinguishing Reads from Writes
- **Reads**: Use LOOKUP (`in`), don't modify state
- **Writes**: Use PERMUTATION (`is`), destination has `write`/`append`/`emit` in name

## Vulnerable vs Secure Patterns

### VULNERABLE: Ungated message write
```pil
pol commit sel_write_l2_to_l1_msg;
sel_write_l2_to_l1_msg { msg_data } is public_inputs.sel { ... };
// Missing: * (1 - discard)
```

### SECURE: Properly gated
```pil
pol SEL_WRITE = sel_execute * (1 - sel_opcode_error) * (1 - discard);
SEL_WRITE { msg_data } is public_inputs.sel { ... };
```

### FALSE POSITIVE: Discard passed through
```pil
sel { context_id, data, discard } is dest.sel { dest.ctx, dest.data, dest.discard };
// Destination uses discard for its own gating - verify destination handles it
```

## Real Bug: L2-L1 Message (PR #18606)

```pil
// tx.pil
tx_should_l2_l1_msg_append { ... } is public_inputs.sel { ... };
// MISSING: * (1 - discard) in selector derivation
```

**Impact**: Messages from reverted contexts persist in public outputs.

## Checklist

For each side-effect permutation:
- [ ] Source selector includes `* (1 - discard)`?
- [ ] Source selector includes `* (1 - error)` or `* (1 - sel_opcode_error)`?
- [ ] If gating in derived selector, trace the chain?
- [ ] If discard in tuple, verify destination uses it?

## Counter Updates

Also check counter increments:
```bash
grep -rn "num_.*'\s*-\s*num_.*-\|count.*'\s*-\s*count" pil/vm2/ --include="*.pil"
```

Counter updates should be gated: `sel * (count' - count - increment * (1 - discard)) = 0`

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-side-effect-gating` |
| Target | `{path}` |
| Side Effects Analyzed | `{N}` |
| Findings | `{e.g., "1 Critical, 1 High"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-side-effect-gating-{file}-{line}-{selector}`
- **Severity**: Critical / High / Medium
- **Selector**: Source selector name
- **Destination**: Target trace
- **Missing**: `discard` / `error` / both
- **Fix**: Add gating to selector

### JSON Output (required)
```json
{
  "skill": "vm2-audit-side-effect-gating",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-side-effect-gating-tx-347-sel_l2_msg",
    "severity": "critical",
    "file": "pil/vm2/tx.pil",
    "line": 347,
    "selector": "tx_should_l2_l1_msg_append",
    "destination": "public_inputs",
    "missing": "discard",
    "description": "L2-L1 message write not gated by discard",
    "exploitability": "high",
    "fix": "Change to: raw_selector * (1 - error) * (1 - discard)"
  }]
}
```
