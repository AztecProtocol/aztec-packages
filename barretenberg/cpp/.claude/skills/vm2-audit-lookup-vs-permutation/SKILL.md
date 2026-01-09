---
name: vm2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Lookup vs Permutation Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for lookup vs permutation misuse. Using lookups when permutations are required for operations with side effects enables critical exploits.

**Bug Type**: Soundness
**Severity**: Critical
**Frequency**: Medium

## Why This is Critical

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
// Can read same address with different values!
// Can skip memory operations!
```

### Vulnerable Pattern: Lookup for Operation Dispatch

```pil
// VULNERABLE: Using lookup for side-effectful dispatch
pol SOURCE = sel_operation;
#[OPERATION_DISPATCH]
SOURCE { op_id, input } in dest_sel { dest_op_id, dest_input };
// Prover can make multiple source rows point to same destination!
```

### Vulnerable Pattern: Lookup for Emissions

```pil
// VULNERABLE: Using lookup for nullifier emission
sel_emit { nullifier } in nullifier_trace.sel { nullifier_trace.value };
// Could emit same nullifier multiple times or skip emissions!
```

### Secure Pattern: Permutation for Memory

```pil
// SECURE: Use permutation for memory operations
sel_mem_read { clk, addr, value } permute memory.sel { memory.clk, memory.addr, memory.value };
// Every source row has exactly one destination row
```

### Secure Pattern: Permutation for Dispatch

```pil
// SECURE: Use permutation for operation dispatch
#[OPERATION_DISPATCH]
SOURCE { op_id, input } permute dest_sel { dest_op_id, dest_input };
// 1:1 mapping enforced
```

### Secure Pattern: Lookup for Range Checks

```pil
// SECURE: Lookup for precomputed range check table
sel { value } in range_check.sel { range_check.value };
// Range check table has no side effects, lookup is appropriate
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

### Example 3: Poseidon2 Memory Interface

```pil
// If using lookup instead of permutation for hash inputs,
// could reuse same hash result for different inputs
```

## Test Patterns

### Test 1: Duplicate Operation Detection

```cpp
TEST_F(ComponentTest, NegativeDuplicateOperation)
{
    // Create trace with two source rows pointing to same destination
    auto trace = TestTraceContainer({
        // Source row 1 with op_id = 1
        {{ C::sel_source, 1 }, { C::op_id, 1 }},
        // Source row 2 with same op_id = 1
        {{ C::sel_source, 1 }, { C::op_id, 1 }},
        // Only one destination row with op_id = 1
        {{ C::sel_dest, 1 }, { C::dest_op_id, 1 }},
    });

    // With permutation, this should fail (2 sources, 1 dest)
    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::exception
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Permutation correctly enforces 1:1 - secure
- **Test fails (no throw)**: Lookup allows duplication - vulnerable

### Test 2: Missing Destination Detection

```cpp
TEST_F(ComponentTest, NegativeMissingDestination)
{
    auto trace = TestTraceContainer({
        // Two source rows
        {{ C::sel_source, 1 }, { C::op_id, 1 }},
        {{ C::sel_source, 1 }, { C::op_id, 2 }},
        // Only one destination row (op_id = 1 missing)
        {{ C::sel_dest, 1 }, { C::dest_op_id, 2 }},
    });

    // With permutation, this should fail
    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::exception
    );
}
```

### Test 3: Extra Destination Detection

```cpp
TEST_F(ComponentTest, NegativeExtraDestination)
{
    auto trace = TestTraceContainer({
        // One source row
        {{ C::sel_source, 1 }, { C::op_id, 1 }},
        // Two destination rows (one extra!)
        {{ C::sel_dest, 1 }, { C::dest_op_id, 1 }},
        {{ C::sel_dest, 1 }, { C::dest_op_id, 2 }},
    });

    // With permutation, this should fail (1 source, 2 dests)
    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::exception
    );
}
```

## Audit Checklist

1. **Identify all interactions in the component**:
   - [ ] `grep -n "} in \|} permute " component.pil`
   - [ ] Document each interaction type (lookup vs permutation)

2. **For each lookup (`in`), verify**:
   - [ ] Is the destination a pure computation (no side effects)?
   - [ ] Is the destination precomputed/constant?
   - [ ] Could duplicating this operation cause problems?
   - [ ] If any answer is "no" or "yes" (last), should be permutation

3. **Verify permutations for side-effectful operations**:
   - [ ] Memory read/write operations
   - [ ] State tree operations
   - [ ] Emission operations (nullifiers, notes, logs)
   - [ ] Call dispatch/return
   - [ ] Any operation affecting external state

4. **Check interaction counts**:
   - [ ] Source count equals destination count for permutations
   - [ ] Tracegen emits events 1:1

5. **Review destination traces**:
   - [ ] Does destination trace have side effects?
   - [ ] Is destination used by multiple sources legitimately?

## Fix Pattern

```pil
// Change lookup to permutation for side-effectful operations

// BEFORE (vulnerable):
sel_op { ... } in dest.sel { ... };

// AFTER (secure):
sel_op { ... } permute dest.sel { ... };
```

## Build and Test Commands

```bash
# Regenerate C++ from PIL
vmp  # or: ../../bb-pilcom/target/release/bb_pil pil/vm2

# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run specific component test
vmtg "ComponentConstraining*"
```

## Common Locations to Audit

Lookup vs permutation is critical in:
- **Memory**: `memory.pil` - all memory operations MUST use permutation
- **Execution**: `execution.pil` - operation dispatch
- **Transaction**: `tx.pil` - call dispatch/return
- **Opcodes**: Any opcode interacting with memory or external state
- **Emissions**: `emit_notehash.pil`, `emit_nullifier.pil`, etc.

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/03-lookup-vs-permutation.md)
- [Memory Row Injection Skill](../vm2-audit-memory-row-injection/SKILL.md)
- [Interaction Tuple Completeness Skill](../vm2-audit-interaction-tuple-completeness/SKILL.md)
