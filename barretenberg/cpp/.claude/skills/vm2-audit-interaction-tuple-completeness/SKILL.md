---
name: vm2-audit-interaction-tuple-completeness
description: Audit VM2/AVM PIL files for interaction tuple completeness. High severity soundness issue where lookup or permutation tuples are missing columns that should be included, allowing malicious provers to manipulate missing values like clock ordering, context isolation, or operation flags.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Interaction Tuple Completeness Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for interaction tuple completeness. Lookup or permutation tuples are missing columns that should be included, allowing a malicious prover to manipulate the missing values.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Low

## Why This is Critical

If a column is not in the tuple, it's not verified:
- **Source and destination can have different values**: Column mismatch goes undetected
- **Allows forging operations with wrong parameters**: Fake memory reads, wrong contexts
- **Can reorder operations**: Missing clock allows arbitrary sequencing
- **Can cross context boundaries**: Missing context_id allows cross-context access

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Missing Column

```pil
// VULNERABLE: Missing rw column in tuple
#[MEMORY_READ]
sel_read { addr, value } in memory.sel { memory.addr, memory.value };
// Missing: rw flag! Can claim read when actually write
```

### Vulnerable Pattern: Missing Clock

```pil
// VULNERABLE: Forgot clock/sequence
#[OPERATION_DISPATCH]
sel { op_id, args } in dest.sel { dest.op_id, dest.args };
// Missing: clk! Can reorder operations
```

### Vulnerable Pattern: Missing Context

```pil
// VULNERABLE: Missing context isolation
#[MEMORY_ACCESS]
sel { addr, value } in memory.sel { memory.addr, memory.value };
// Missing: context_id! Can access other context's memory
```

### Vulnerable Pattern: Missing Discard Flag

```pil
// VULNERABLE: Missing discard in call result
#[END_CALL]
sel { context_id, success } in tx.sel { tx.context_id, tx.success };
// Missing: discard! Can manipulate revert behavior
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

## Historical Examples

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

### Example 2: Missing Clock

```pil
// Missing clock - allows reordering operations arbitrarily
```

### Example 3: Missing Context

```pil
// Missing context - allows cross-context memory access
```

### Example 4: Missing Tag

```pil
// Missing tag - allows type confusion in memory
```

## Audit Checklist

1. **List all interactions in the component**:
   - [ ] `grep -n "} in \|} is " component.pil`
   - [ ] Document each interaction and its tuple

2. **For each interaction, verify tuple completeness**:
   - [ ] **Clock/sequence**: Is `clk` or ordering column present?
   - [ ] **Context/identifier**: Is `context_id` or similar present?
   - [ ] **Flags**: `rw`, `success`, `discard`, `error`, `tag` as needed?
   - [ ] **Values**: All operands and results included?

3. **Compare source and destination tuples**:
   - [ ] Same number of columns?
   - [ ] Same column meanings?
   - [ ] Same ordering?

4. **Check destination documentation**:
   - [ ] What columns should be in the tuple?
   - [ ] Are there documented usage patterns?

5. **Review similar interactions**:
   - [ ] Other memory lookups have which columns?
   - [ ] Other call permutations have which columns?

## Fix Pattern

```pil
// Add missing column to both source and destination
// BEFORE:
sel { a, b } in dest.sel { dest.a, dest.b };

// AFTER:
sel { clk, context_id, a, b, flag } in dest.sel { dest.clk, dest.context_id, dest.a, dest.b, dest.flag };
```

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

## Common Locations to Audit

Interaction tuples are critical in:
- **Memory**: `memory.pil` - all memory lookups
- **Execution**: `execution.pil` - operation dispatch
- **Call handling**: `external_call.pil`, `internal_call.pil`
- **State access**: Storage read/write operations
- **Bytecode**: `bc_retrieval.pil`, `instr_fetching.pil`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/15-interaction-tuple-completeness.md)
- [Lookup vs Permutation](../../../pil/vm2/claude-skills/03-lookup-vs-permutation.md)
- [Discard Revert Handling](../../../pil/vm2/claude-skills/11-discard-revert-handling.md)

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
| Skill | vm2-audit-interaction-tuple-completeness |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-interaction-tuple-completeness-[file]-[line]-[subtype] [SEVERITY]
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
  "skill": "vm2-audit-interaction-tuple-completeness",
  "finding_prefix": "vm2-audit-interaction-tuple-completeness",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-interaction-tuple-completeness-filename-line-subtype",
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

- Format: `vm2-audit-interaction-tuple-completeness-[filename]-[line]-[subtype]`
- Example: `vm2-audit-interaction-tuple-completeness-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
