---
name: vm2-audit-memory-row-injection
description: Audit VM2/AVM PIL files for memory row injection vulnerabilities. Critical soundness issue where malicious provers can inject fake memory rows into the memory trace, allowing arbitrary memory reads/writes that bypass the legitimate execution trace and corrupt program state.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Memory Row Injection Audit

Audits for memory row injection - fake memory rows in the memory trace allowing arbitrary reads/writes. Complete control over VM state: read any address, write any value, bypass access control.

## Attack Vectors

### Vector 1: Non-Boolean Memory Selector

```pil
// VULNERABLE: Memory selector not boolean constrained
pol commit memory_sel;
// Missing: memory_sel * (1 - memory_sel) = 0;

// Prover sets memory_sel = 2 on a row
// This row participates in memory interactions twice!
```

**Impact**: A single memory row counts as multiple operations, breaking permutation balance.

### Vector 2: Lookup Instead of Permutation

```pil
// VULNERABLE: Using lookup for memory operations
sel_mem { addr, value } in memory.sel { memory.addr, memory.value };

// Problems:
// 1. Prover can have multiple sources point to same destination
// 2. Can add extra rows to memory trace not in source
// 3. No 1:1 correspondence between execution and memory
```

**Impact**: Memory trace can contain rows not corresponding to any execution.

### Vector 3: Missing Selector Implication

```pil
// VULNERABLE: Memory selector doesn't require trace active
pol commit sel_mem_access;
sel_mem_access * (1 - sel_mem_access) = 0;  // Boolean, but...
// Missing: sel_mem_access * (1 - sel) = 0;

// Prover activates memory access on "inactive" row (sel = 0)
```

**Impact**: Memory operations on rows that shouldn't be active.

### Vector 4: Unconstrained Memory Row

```pil
// VULNERABLE: Can add row to memory trace without source
// If memory trace rows aren't all accounted for by permutations,
// extra rows can be injected with arbitrary data
```

**Impact**: Inject arbitrary memory state.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Memory-Related Components

```bash
# Find memory PIL files
ls barretenberg/cpp/pil/vm2/*mem*.pil

# Find memory-related selectors
grep -n "pol commit.*mem\|pol commit sel" barretenberg/cpp/pil/vm2/memory*.pil

# Find memory interactions
grep -rn "memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Verify Boolean Constraints on Memory Selectors

For every memory selector, verify it has a boolean constraint:

```bash
# Check for boolean constraints
grep -n "sel.*1 - sel\|sel.*(1 - sel)" barretenberg/cpp/pil/vm2/memory*.pil
```

Each `pol commit sel*` in memory components needs `sel * (1 - sel) = 0`.

### Step 3: Check Interaction Types

Memory operations MUST use permutations (`is`), not lookups (`in`):

```bash
# Find all memory interactions
grep -nP "memory\.[a-z_]+\s*\{" barretenberg/cpp/pil/vm2/*.pil

# Verify they use 'is' not 'in'
grep -rn "} in memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"  # BAD - should be empty
grep -rn "} is memory\." barretenberg/cpp/pil/vm2/ --include="*.pil"  # GOOD
```

### Step 4: Verify All Memory Rows Are Accounted For

Every row in the memory trace must correspond to exactly one source operation:

1. Count source selectors across all components that write to memory
2. Verify permutation ensures 1:1 mapping
3. Check no "orphan" memory rows are possible

### Step 5: Check Selector Implication

Sub-selectors should require main selector active:

```bash
# Look for patterns like sel_mem_read, sel_mem_write
grep -n "sel_mem\|sel.*read\|sel.*write" barretenberg/cpp/pil/vm2/memory*.pil

# Verify implications exist
grep -n "sel_.*\* (1 - sel)" barretenberg/cpp/pil/vm2/memory*.pil
```

### Step 6: Verify Memory Ordering Constraints

Check that memory maintains proper read-after-write semantics:

```bash
# Look for ordering/continuity constraints
grep -n "addr'\|same_addr\|ordering" barretenberg/cpp/pil/vm2/memory*.pil
```

### Step 7: Check Context Isolation

Memory operations should include context_id to prevent cross-context access:

```bash
# Verify context_id is part of memory tuples
grep -n "context\|space_id\|call_id" barretenberg/cpp/pil/vm2/memory*.pil
```

## Patterns

### Vulnerable Pattern: Using Lookup for Memory

```pil
// VULNERABLE: Lookup allows many-to-one
sel { addr, value } in memory.sel { memory.addr, memory.value };
```

### Secure Pattern: Complete Memory Constraints

```pil
// SECURE: Memory trace with proper constraints
pol commit sel;
#[SEL_BOOL]
sel * (1 - sel) = 0;
#[MEM_ACCESS]
sel_mem_op { clk, addr, value, rw } is memory.sel { memory.clk, memory.addr, memory.value, memory.rw };
#[MEM_ORDERING]
sel * (1 - sel') * (addr' - addr) * is_same_addr_indicator = 0;
```

## Memory Trace Security Properties

1. **Every memory row comes from execution**: Use permutations, not lookups
2. **Memory selector is boolean**: Explicit constraint
3. **No duplicate rows**: Permutation enforces 1:1
4. **Proper ordering**: Reads see most recent writes
5. **Context isolation**: Memory operations bound to their context

## Examples

### Example 1: Missing Boolean on Memory Selector

```pil
// ecc_mem.pil - selector not constrained boolean
pol commit sel;
// Missing constraint! Can inject fake ECC memory rows

// Fix:
#[SEL_BOOL]
sel * (1 - sel) = 0;
```

### Example 2: Poseidon2 Memory Lookup

```pil
// If using lookup instead of permutation for Poseidon2 memory:
sel { input } in poseidon2_mem.sel { poseidon2_mem.input };
// Could reuse same hash result for different inputs!

// Fix: Use permutation
sel { input } is poseidon2_mem.sel { poseidon2_mem.input };
```

### Example 3: to_radix_mem.pil

```pil
// to_radix_mem.pil - selector missing boolean
pol commit sel;
// Was missing boolean constraint
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `{skill-name}.json` file to the output directory with:

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

For no findings:
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.