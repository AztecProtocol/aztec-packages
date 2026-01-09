---
name: vm2-audit-discard-revert-handling
description: Audit VM2/AVM PIL files for discard/revert flag handling. High severity soundness issue where the discard flag indicating failed contexts is not properly handled, allowing side effects from reverted transactions to persist including nullifiers, note hashes, L2-to-L1 messages, and state changes.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Discard/Revert Flag Handling Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for discard/revert flag handling. The `discard` flag indicates that a context or its ancestor has failed, and side effects should not be committed. Missing or incorrect handling allows side effects from reverted transactions to persist.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Medium

## Why This is Critical

Missing discard gating allows reverted state to persist:
- **Nullifiers from reverted calls persist**: Double-spend protection broken
- **Note hashes from failed transactions committed**: Invalid state
- **L2-to-L1 messages from reverted operations sent**: Cross-chain corruption
- **State corrupted by failed operations**: Storage writes persist

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

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Side Effect Not Gated

```pil
// VULNERABLE: Side effect not gated by discard
pol commit should_emit;
#[EMIT_OPERATION]
should_emit { data } permute emit_trace.sel { emit_trace.data };
// Emission happens even when discard = 1!
```

### Vulnerable Pattern: Count Updated Without Discard Check

```pil
// VULNERABLE: Count updated without checking discard
pol commit num_emissions;
#[UPDATE_COUNT]
sel * (num_emissions' - num_emissions - should_emit) = 0;
// Count increments even on discarded operations!
```

### Vulnerable Pattern: Missing Discard in Tuple

```pil
// VULNERABLE: Interaction missing discard field
#[END_CALL]
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
// Missing: discard! Can manipulate discard independently
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

## Historical Examples

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

## Audit Checklist

1. **Identify all side-effect operations**:
   - [ ] Note hash emissions
   - [ ] Nullifier emissions
   - [ ] L2-to-L1 messages
   - [ ] Storage writes
   - [ ] Log emissions

2. **For each side effect, verify discard gating**:
   - [ ] `pol GATED = raw_selector * (1 - discard);`
   - [ ] Interaction uses gated selector

3. **Check count/accumulator updates**:
   - [ ] All increments gated by `(1 - discard)`
   - [ ] Final counts match committed operations

4. **Verify discard propagation**:
   - [ ] Discard propagates to child contexts
   - [ ] Discard clears on resolution
   - [ ] `dying_context_id` tracked correctly

5. **Check interaction tuples**:
   - [ ] Discard field included where relevant
   - [ ] Interactions distinguish discarded vs non-discarded

6. **Review tracegen for discard handling**:
   - [ ] Columns set correctly when `discard = 1`
   - [ ] Events gated by discard check

## Fix Pattern

```pil
// Gate selector by (1 - discard)
pol RAW_SHOULD_EMIT = operation_selector * condition;
pol SHOULD_EMIT = RAW_SHOULD_EMIT * (1 - discard);

#[EMIT_OPERATION]
SHOULD_EMIT { ... } permute dest.sel { ... };

// Gate count update
#[UPDATE_COUNT]
sel * (count' - count - RAW_SHOULD_EMIT * (1 - discard)) = 0;
```

## Common Locations to Audit

Discard handling is critical in:
- **Transaction**: `tx.pil` - all side effect counters
- **Execution**: `execution.pil` - operation dispatch
- **Opcodes**: `emit_notehash.pil`, `emit_nullifier.pil`, `send_l2_to_l1_msg.pil`, `sstore.pil`
- **Logs**: `emit_unencrypted_log.pil`
- **Call handling**: `external_call.pil`, `internal_call.pil`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/11-discard-revert-handling.md)
- [Missing Error Gating Skill](../vm2-audit-missing-error-gating/SKILL.md)
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
| Skill | vm2-audit-discard-revert-handling |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-discard-revert-handling-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-discard-revert-handling",
  "finding_prefix": "vm2-audit-discard-revert-handling",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-discard-revert-handling-filename-line-subtype",
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

- Format: `vm2-audit-discard-revert-handling-[filename]-[line]-[subtype]`
- Example: `vm2-audit-discard-revert-handling-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
