---
name: vm2-audit-interaction-tuple-completeness
description: Audit VM2/AVM PIL files for interaction tuple completeness. High severity soundness issue where lookup or permutation tuples are missing columns that should be included, allowing malicious provers to manipulate missing values like clock ordering, context isolation, or operation flags.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Interaction Tuple Completeness Audit

Audits for incomplete interaction tuples. Missing columns allow: undetected mismatches, forged operations, arbitrary reordering (missing clock), cross-context access (missing context_id).

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: List All Interactions in the Component

```bash
# Find all lookups and permutations
grep -n "} in \|} is \|permute" barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: For Each Interaction, Verify Tuple Completeness

For each interaction found, check for these critical columns:

**Check for clock/sequence**:
- Is there a `clk` or similar ordering column?
- If missing, can operations be reordered?

**Check for context/identifier**:
- Is there a `context_id`, `call_id`, or similar?
- If missing, can operations cross boundaries?

**Check for flags**:
- `rw` for memory (read vs write)
- `success` for calls
- `discard` for reverts
- `error` for error states
- `tag` for type tags

**Check for values**:
- All operands included?
- All results included?

### Step 3: Compare Source and Destination Tuples

```bash
# Find the destination definition
grep -n "DOCU_INTERACTIONS\|USAGE:\|TUPLE:" barretenberg/cpp/pil/vm2/<destination>.pil
```

Verify:
- Same number of columns in source and destination?
- Same column meanings?
- Same ordering?

### Step 4: Check Against Expected Tuple Columns

#### Memory Operations Should Include:
```pil
{ clk, context_id, addr, value, rw, tag }
```
- `clk`: Ordering/sequence
- `context_id`: Which context owns the memory
- `addr`: Memory address
- `value`: The value read/written
- `rw`: Read (0) or Write (1)
- `tag`: Type tag of value

#### Call Operations Should Include:
```pil
{ clk, caller_context, callee_context, args..., success, discard }
```
- `clk`: When the call happens
- `caller_context`: Who's calling
- `callee_context`: Who's being called
- `args`: Call arguments
- `success`: Did call succeed
- `discard`: Are side effects discarded

#### State Operations Should Include:
```pil
{ slot, value, exists, root_before, root_after }
```
- `slot`: Storage slot
- `value`: The value
- `exists`: Does the slot exist
- `root_before`: State root before
- `root_after`: State root after

### Step 5: Review Similar Interactions

Compare with other interactions of the same type:
```bash
# Find other memory lookups
grep -rn "memory\.sel\|memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find other call permutations
grep -rn "call\|context" barretenberg/cpp/pil/vm2/ --include="*.pil" | grep "} in \|} is "
```

## Patterns

### Vulnerable Pattern: Missing Column

```pil
// VULNERABLE: Missing rw column in tuple
#[MEMORY_READ]
sel_read { addr, value } in memory.sel { memory.addr, memory.value };
```

### Vulnerable Pattern: Missing Clock

```pil
// VULNERABLE: Forgot clock/sequence
#[OPERATION_DISPATCH]
sel { op_id, args } in dest.sel { dest.op_id, dest.args };
```

### Vulnerable Pattern: Missing Context

```pil
// VULNERABLE: Missing context isolation
#[MEMORY_ACCESS]
sel { addr, value } in memory.sel { memory.addr, memory.value };
```

### Vulnerable Pattern: Missing Discard Flag

```pil
// VULNERABLE: Missing discard in call result
#[END_CALL]
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
```

### Secure Pattern: Complete Memory Tuple

```pil
// SECURE: Complete tuple for memory
#[MEMORY_READ]
sel_read { clk, context_id, addr, value, rw, tag }
in memory.sel { memory.clk, memory.context_id, memory.addr, memory.value, memory.rw, memory.tag };
```

### Secure Pattern: Complete Call Tuple

```pil
// SECURE: All relevant columns included
#[OPERATION_DISPATCH]
sel { clk, context_id, op_id, args, success, discard }
is dest.sel { dest.clk, dest.context_id, dest.op_id, dest.args, dest.success, dest.discard };
```

## Examples

### Example 1: Discard Field Missing (PR #19149)

```pil
// BEFORE: Missing discard in end call
#[END_ENQUEUED_CALL]
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
// Missing: discard!

// AFTER: Include discard
#[END_ENQUEUED_CALL]
sel { context_id, success, discard } in tx.sel { tx.context_id, tx.success, tx.discard };
```
**Impact**: Could manipulate discard flag independently.

## Interaction Documentation Pattern

Every destination should document expected tuple:

```pil
// USAGE: This trace is used as destination for memory lookups
// TUPLE: { clk, context_id, addr, value, rw, tag }
// - clk: Clock value for ordering
// - context_id: Context performing the access
// - addr: Memory address (0 to AVM_MEMORY_SIZE - 1)
// - value: Value read or written
// - rw: 0 for read, 1 for write
// - tag: Type tag of the value
```

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
