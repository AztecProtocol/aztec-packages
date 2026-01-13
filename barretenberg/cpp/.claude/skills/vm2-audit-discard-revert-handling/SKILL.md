---
name: vm2-audit-discard-revert-handling
description: Audit VM2/AVM PIL files for discard/revert flag handling. High severity soundness issue where the discard flag indicating failed contexts is not properly handled, allowing side effects from reverted transactions to persist including nullifiers, note hashes, L2-to-L1 messages, and state changes.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Discard/Revert Flag Handling Audit

Audits for discard/revert flag handling. The `discard` flag indicates a failed context; side effects should not be committed. Missing gating allows reverted state to persist: nullifiers (double-spend), note hashes, L2-to-L1 messages, storage writes.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Key Concepts

```pil
// discard = 1 means:
// - Current context or an ancestor has failed
// - All side effects should be discarded
// - State should not be modified

// dying_context_id:
// - The oldest ancestor context that failed
// - Used to track which contexts are affected
// - discard = 1 iff dying_context_id != 0
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Side-Effect Operations

```bash
# Find emission operations
grep -n "emit\|append\|write\|store\|nullifier\|note_hash\|l2_to_l1\|log" barretenberg/cpp/pil/vm2/<component>.pil

# Find side-effect selectors
grep -n "should_\|sel_emit\|sel_append\|sel_write" barretenberg/cpp/pil/vm2/<component>.pil
```

Side effects to check:
- Note hash emissions
- Nullifier emissions
- L2-to-L1 messages
- Storage writes (SSTORE)
- Log emissions
- Any state modifications

### Step 2: Verify Discard Gating on Side Effects

For each side effect, verify it's gated by `(1 - discard)`:

```bash
# Find discard usage
grep -n "discard\|1 - discard" barretenberg/cpp/pil/vm2/<component>.pil
```

Expected pattern:
```pil
pol GATED_SELECTOR = raw_selector * (1 - discard);
```

### Step 3: Check Count/Accumulator Updates

```bash
# Find count updates
grep -n "num_\|count\|_cnt\|total_" barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- All increments gated by `(1 - discard)`
- Final counts match actual committed operations
- No counting of discarded operations

### Step 4: Verify Discard Propagation

```bash
# Find discard propagation constraints
grep -n "discard'\|dying_context\|DISCARD\|DYING" barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- Discard propagates to child contexts
- Discard clears correctly on resolution
- `dying_context_id` tracked correctly
- Failure implies discard

### Step 5: Check Interaction Tuples Include Discard

```bash
# Find interactions that might need discard
grep -n "} in \|} is " barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- Discard field included in relevant tuples
- Interactions distinguish discarded vs non-discarded

### Step 6: Review Tracegen for Discard Handling

```bash
# Find discard handling in tracegen
grep -rn "discard" --include="*.cpp" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

Verify:
- Columns set correctly when `discard = 1`
- Events properly gated by discard check

## Discard Logic Constraints

```pil
// Core discard/dying_context relationship
#[DISCARD_IFF_DYING_CONTEXT]
discard = (dying_context_id != 0 indicator);

// Failure implies discard
#[DISCARD_IF_FAILURE]
sel_failure * (1 - discard') = 0;

// Dying context propagation
#[DYING_CONTEXT_PROPAGATION]
// Complex logic for when dying_context changes

// Cannot exit dying context without failure
#[DYING_CONTEXT_MUST_FAIL]
// If exiting dying context, must have failure

// Discard must set dying context
#[ENTER_CALL_DISCARD_MUST_BE_DYING_CONTEXT]
// When discard raised, dying_context must be set

// Clear discard on resolution
#[DYING_CONTEXT_WITH_PARENT_MUST_CLEAR_DISCARD]
// When exiting to parent of dying context, clear discard
```

## Patterns

### Vulnerable Pattern: Side Effect Not Gated

```pil
// VULNERABLE: Side effect not gated by discard
pol commit should_emit;
#[EMIT_OPERATION]
should_emit { data } permute emit_trace.sel { emit_trace.data };
```

### Vulnerable Pattern: Count Updated Without Discard Check

```pil
// VULNERABLE: Count updated without checking discard
pol commit num_emissions;
#[UPDATE_COUNT]
sel * (num_emissions' - num_emissions - should_emit) = 0;
```

### Vulnerable Pattern: Missing Discard in Tuple

```pil
// VULNERABLE: Interaction missing discard field
#[END_CALL]
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
```

### Secure Pattern: Gate Side Effects

```pil
// SECURE: Gate side effects by (1 - discard)
pol SHOULD_EMIT = should_emit_raw * (1 - discard);
#[EMIT_OPERATION]
SHOULD_EMIT { data } permute emit_trace.sel { emit_trace.data };
```

### Secure Pattern: Gate Count Updates

```pil
// SECURE: Gate count updates by (1 - discard)
#[UPDATE_COUNT]
sel * (num_emissions' - num_emissions - should_emit_raw * (1 - discard)) = 0;
```

### Secure Pattern: Include Discard in Tuple

```pil
// SECURE: Include discard in interaction tuple
#[END_CALL]
sel { context_id, success, discard } in tx.sel { tx.context_id, tx.success, tx.discard };
```

## Examples

### Example 1: TX L2-to-L1 Message (PR #18606)

```pil
// BEFORE: Count updated without checking discard
pol should_l2_l1_msg_append;  // Based on operation type
#[UPDATE_NUM_L2_TO_L1_MSGS]
... (num_l2_to_l1_msgs' - num_l2_to_l1_msgs - should_l2_l1_msg_append) = 0;
// Count increments even when discard = 1!

// AFTER: Properly gated
pol SHOULD_APPEND = should_l2_l1_msg_append_raw * (1 - discard);
```
**Impact**: L2-to-L1 message count mismatch on revert.

### Example 2: TX Tracegen (PR #18606)

```cpp
// BEFORE: tx_should_l2_l1_msg_append not considering discard in tracegen
row.tx_should_l2_l1_msg_append = should_append;  // Ignores discard!

// AFTER: Check discard flag
row.tx_should_l2_l1_msg_append = should_append && !discard;
```
**Impact**: Completeness - trace violates constraints on revert.

### Example 3: Discard Field in Lookup (PR #19149)

```pil
// BEFORE: "End enqueued call" lookup not passing discard field
#[END_ENQUEUED_CALL]
... { context_id, success } in tx.sel { ... };  // Missing discard!

// AFTER: Include discard in tuple
#[END_ENQUEUED_CALL]
... { context_id, success, discard } in tx.sel { ..., discard };
```
**Impact**: Could discard rows before failing nested call.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-discard-revert-handling` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-discard-revert-handling-filename-123-issue-type` (MUST use full skill name: `vm2-audit-discard-revert-handling`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-discard-revert-handling.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-discard-revert-handling",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-discard-revert-handling-filename-123-issue-type",
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

For no findings:
```json
{
  "skill": "vm2-audit-discard-revert-handling",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.