---
name: vm2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Lookup vs Permutation Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for lookup vs permutation misuse. Using lookups when permutations are required for operations with side effects enables critical exploits.

## Why This is Important

The key difference:
- **Lookups**: Source rows can "share" destination rows (many-to-one)
- **Permutations**: Each source row maps to exactly one destination row (bijection)

With lookups on side-effectful operations, a malicious prover can:
- **Duplicate operations**: Read same memory twice with different "results"
- **Insert extra operations**: Add operations not in the source trace
- **Skip operations**: Omit operations that should occur

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Interactions

```bash
# Find all lookups and permutations
grep -n "} in \|} permute " barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: For Each Lookup (`in`), Analyze the Destination

For each lookup found, determine if the destination has side effects:

```bash
# Check what the destination trace does
grep -rn "dest_trace_name" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Questions to answer:
- Is the destination a pure computation (no side effects)?
- Is the destination precomputed/constant (e.g., range check table)?
- Could duplicating this operation cause problems?

### Step 3: Identify Side-Effectful Operations

Side-effectful operations that MUST use permutations:
- **Memory operations**: Read/write to memory
- **State tree operations**: Storage reads/writes
- **Emission operations**: Nullifiers, note hashes, logs, L2-to-L1 messages
- **Call dispatch/return**: Function calls, returns
- **Any operation affecting external state**

```bash
# Find memory-related interactions
grep -rn "memory\." barretenberg/cpp/pil/vm2/<component>.pil | grep "} in \|} permute "

# Find emission-related interactions
grep -rn "emit\|append\|nullifier\|note_hash" barretenberg/cpp/pil/vm2/<component>.pil | grep "} in \|} permute "

# Find call-related interactions
grep -rn "call\|dispatch\|execution" barretenberg/cpp/pil/vm2/<component>.pil | grep "} in \|} permute "
```

### Step 4: Verify Correct Interaction Type

For each side-effectful destination, verify it uses `permute` not `in`:

```pil
// WRONG - lookup for memory
sel_mem { ... } in memory.sel { ... };

// CORRECT - permutation for memory
sel_mem { ... } permute memory.sel { ... };
```

### Step 5: Check Interaction Counts

For permutations, source count must equal destination count:

```bash
# Check tracegen for count verification
grep -rn "count\|num_" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

## When to Use Each

### Use Lookups (`in`) When:
- Destination is a precomputed table (range checks, constants)
- Destination has no side effects
- Multiple sources legitimately share same destination
- Order doesn't matter

Examples of valid lookup destinations:
- Range check tables (U8, U16, U32, etc.)
- Constant tables
- Precomputed values
- Pure function results

### Use Permutations (`permute`) When:
- Destination has side effects
- Each operation must happen exactly once
- Order matters
- Clock/sequence must be preserved

Examples requiring permutations:
- Memory read/write operations
- State tree operations
- Emission operations
- Call dispatch/return
- Any external state changes

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Lookup for Memory Operations

```pil
// VULNERABLE: Using lookup for memory with side effects
sel_mem_read { addr, value } in memory.sel { memory.addr, memory.value };
```

### Vulnerable Pattern: Lookup for Operation Dispatch

```pil
// VULNERABLE: Using lookup for side-effectful dispatch
pol SOURCE = sel_operation;
#[OPERATION_DISPATCH]
SOURCE { op_id, input } in dest_sel { dest_op_id, dest_input };
```

### Vulnerable Pattern: Lookup for Emissions

```pil
// VULNERABLE: Using lookup for nullifier emission
sel_emit { nullifier } in nullifier_trace.sel { nullifier_trace.value };
```

### Secure Pattern: Permutation for Memory

```pil
// SECURE: Use permutation for memory operations
sel_mem_read { clk, addr, value } permute memory.sel { memory.clk, memory.addr, memory.value };
```

### Secure Pattern: Permutation for Dispatch

```pil
// SECURE: Use permutation for operation dispatch
#[OPERATION_DISPATCH]
SOURCE { op_id, input } permute dest_sel { dest_op_id, dest_input };
```

### Secure Pattern: Lookup for Range Checks

```pil
// SECURE: Lookup for precomputed range check table
sel { value } in range_check.sel { range_check.value };
```

## Historical Examples

### Example 1: TX Public Call Dispatch (PR #18336)

```pil
// BEFORE (vulnerable): Using lookups
#[DISPATCH_PUBLIC_CALL]
sel_dispatch { call_id, args... } in execution.sel { execution.call_id, execution.args... };

// AFTER (secure): Using permutations
#[DISPATCH_PUBLIC_CALL]
sel_dispatch { call_id, args... } permute execution.sel { execution.call_id, execution.args... };
```
**Impact**: Could insert extra public call requests.

### Example 2: Memory Operations

```pil
// Must always use permutation for memory
sel_mem_op { clk, addr, value, rw } permute memory.sel { memory.clk, memory.addr, memory.value, memory.rw };
```

---

## REQUIRED OUTPUT FORMAT

**IMPORTANT**: Your response MUST end with this machine-readable section.

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

For each finding, include:
- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

You MUST include this exact format at the end of your response:

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

For no findings, use:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
