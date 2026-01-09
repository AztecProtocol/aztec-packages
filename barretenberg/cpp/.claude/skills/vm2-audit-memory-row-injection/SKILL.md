---
name: vm2-audit-memory-row-injection
description: Audit VM2/AVM PIL files for memory row injection vulnerabilities. Critical soundness issue where malicious provers can inject fake memory rows into the memory trace, allowing arbitrary memory reads/writes that bypass the legitimate execution trace and corrupt program state.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Memory Row Injection Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for memory row injection vulnerabilities. A malicious prover can inject fake memory rows into the memory trace, allowing arbitrary memory reads/writes that bypass the legitimate execution trace.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Low

## Why This is Critical

Memory is the foundation of VM execution. If memory can be corrupted:
- **Read any value from any address**: Fake reads return attacker-controlled values
- **Write arbitrary values to any address**: Corrupt any memory location
- **Bypass access control**: Access memory that should be protected
- **Corrupt program state entirely**: Complete control over VM execution

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

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

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

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Missing Boolean

```pil
// VULNERABLE
pol commit sel;
// No boolean constraint - can inject rows!
```

### Vulnerable Pattern: Using Lookup

```pil
// VULNERABLE: Lookup allows many-to-one
sel { addr, value } in memory.sel { memory.addr, memory.value };
```

### Secure Pattern: Complete Memory Constraints

```pil
// SECURE: Memory trace with proper constraints

// 1. Boolean selector
pol commit sel;
#[SEL_BOOL]
sel * (1 - sel) = 0;

// 2. All memory rows come from legitimate sources (permutation)
// In execution trace:
#[MEM_ACCESS]
sel_mem_op { clk, addr, value, rw } is memory.sel { memory.clk, memory.addr, memory.value, memory.rw };

// 3. Memory trace fully constrained
// Every row in memory trace must match a source row
// Permutation guarantees 1:1 mapping

// 4. Memory ordering constraints
#[MEM_ORDERING]
sel * (1 - sel') * (addr' - addr) * is_same_addr_indicator = 0;
// Proper read-after-write semantics
```

## Memory Trace Security Properties

1. **Every memory row comes from execution**: Use permutations, not lookups
2. **Memory selector is boolean**: Explicit constraint
3. **No duplicate rows**: Permutation enforces 1:1
4. **Proper ordering**: Reads see most recent writes
5. **Context isolation**: Memory operations bound to their context

## Historical Examples

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

## Test Patterns

### Test 1: Injected Row Detection

```cpp
TEST_F(MemoryTest, NegativeInjectedRow)
{
    // Try to add a memory row without corresponding source
    auto trace = TestTraceContainer({
        // Execution row: no memory operation
        {{ C::execution_sel, 1 }, { C::sel_mem_op, 0 }},
        // Memory row: claims to be valid (INJECTED)
        {{ C::memory_sel, 1 }, { C::memory_addr, 42 }, { C::memory_value, 999 }},
    });

    // Permutation should fail - source count != dest count
    EXPECT_THROW(
        check_all_interactions<MemoryTraceBuilder>(trace),
        std::exception
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Permutation catches injected row - secure
- **Test fails (no throw)**: Injection possible - vulnerable

### Test 2: Non-Boolean Selector

```cpp
TEST_F(MemoryTest, NegativeNonBooleanSelector)
{
    auto trace = TestTraceContainer({
        {{ C::memory_sel, 2 }},  // Non-boolean!
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<MemoryRelation>(trace),
        "SEL_BOOL"
    );
}
```

### Test 3: Context Isolation

```cpp
TEST_F(MemoryTest, NegativeCrossContextAccess)
{
    // Try to read memory from different context
    auto trace = TestTraceContainer({
        // Write in context 1
        {{ C::sel, 1 }, { C::context_id, 1 }, { C::addr, 100 }, { C::value, 42 }, { C::rw, 1 }},
        // Read in context 2 - should NOT see context 1's value
        {{ C::sel, 1 }, { C::context_id, 2 }, { C::addr, 100 }, { C::value, 42 }, { C::rw, 0 }},
    });

    // Should fail - contexts are isolated
    EXPECT_THROW(
        check_relation<MemoryRelation>(trace),
        std::exception
    );
}
```

## Audit Checklist

1. **Check all memory-related selectors**:
   - [ ] Every `pol commit sel*` has `sel * (1 - sel) = 0`

2. **Verify boolean constraints**:
   - [ ] Main memory selector is boolean
   - [ ] All sub-selectors (read/write/etc) are boolean

3. **Check interaction types**:
   - [ ] Memory operations use permutations (`is`), not lookups (`in`)
   - [ ] All memory rows accounted for by permutations

4. **Verify memory ordering**:
   - [ ] Reads see correct write values
   - [ ] No out-of-order operations possible
   - [ ] Proper timestamp/clock constraints

5. **Check context isolation**:
   - [ ] Memory operations include context_id in tuple
   - [ ] Cannot access other context's memory

6. **Look for selector implication gaps**:
   - [ ] Sub-selectors require main selector active
   - [ ] No memory operations on inactive rows

## Fix Patterns

### Fix 1: Add Boolean Constraint

```pil
pol commit sel;
#[SEL_BOOL]
sel * (1 - sel) = 0;
```

### Fix 2: Change Lookup to Permutation

```pil
// BEFORE (vulnerable):
sel { ... } in memory.sel { ... };

// AFTER (secure):
sel { ... } is memory.sel { ... };
```

### Fix 3: Add Selector Implication

```pil
pol commit sel_mem_access;
#[MEM_ACCESS_REQUIRES_SEL]
sel_mem_access * (1 - sel) = 0;
```

### Fix 4: Add Context Isolation

```pil
// Include context_id in all memory tuples
#[MEM_ACCESS]
sel_mem_op { context_id, clk, addr, value, rw }
is memory.sel { memory.context_id, memory.clk, memory.addr, memory.value, memory.rw };
```

## Build and Test Commands

```bash
# Regenerate C++ from PIL
vmp  # or: ../../bb-pilcom/target/release/bb_pil pil/vm2

# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run memory-specific tests
vmtg "Memory*"
```

## Common Locations to Audit

Memory-related PILs typically include:
- `memory.pil` - Main memory trace
- `*_mem.pil` - Component-specific memory (ecc_mem, poseidon2_mem, etc.)
- Any PIL with memory interactions

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/16-memory-row-injection.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
- [Lookup vs Permutation](../../../pil/vm2/claude-skills/03-lookup-vs-permutation.md)
- [Selector Outside Active Rows](../../../pil/vm2/claude-skills/02-selector-outside-active-rows.md)
