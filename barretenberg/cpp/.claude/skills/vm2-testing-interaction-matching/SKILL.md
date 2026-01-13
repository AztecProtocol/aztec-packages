---
name: vm2-testing-interaction-matching
description: Write tests for lookup and permutation interaction correctness. Tests verify source/destination row counts match, tuple values align, and interactions fail appropriately when mismatched.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Interaction Matching Testing

## Purpose

Write tests that verify **lookup and permutation interactions** work correctly. These tests check that source rows match destination rows in count and tuple values.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Key Concepts

### Lookups vs Permutations

```pil
// LOOKUP: Many sources can map to one destination (like a table lookup)
source_sel { a, b } in dest.sel { dest.x, dest.y };

// PERMUTATION: Exact 1:1 mapping required (bijection)
source_sel { a, b } is dest.sel { dest.x, dest.y };
```

| Type | Source Count | Dest Count | Use Case |
|------|--------------|------------|----------|
| Lookup (`in`) | Any | >= sources | Range checks, table lookups |
| Permutation (`is`) | N | Exactly N | Memory ops, state changes |

## Core Functions

```cpp
// Check ALL interactions for a trace builder (lookups + permutations)
check_all_interactions<ComponentTraceBuilder>(trace);

// Check a SPECIFIC permutation
check_permutation<ComponentTraceBuilder, specific_perm_settings>(trace);

// Check a SPECIFIC lookup
check_lookup<ComponentTraceBuilder, specific_lookup_settings>(trace);
```

## Test Categories

### 1. Row Count Mismatch (Permutation)

Permutations require equal source and destination row counts.

```cpp
TEST_F(ComponentConstrainingTest, NegativePermutationCountMismatch)
{
    auto trace = TestTraceContainer({
        // Source: 2 rows with selector = 1
        {
            { C::source_sel, 1 },
            { C::source_value, 10 },
        },
        {
            { C::source_sel, 1 },
            { C::source_value, 20 },
        },
        // Destination: Only 1 row with selector = 1
        {
            { C::dest_sel, 1 },
            { C::dest_value, 10 },
        },
    });

    // Permutation should fail: 2 sources != 1 destination
    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::runtime_error
    );
}
```

### 2. Injected Row Detection

Test that extra rows in destination (without source) are caught.

```cpp
TEST_F(MemoryConstrainingTest, NegativeInjectedMemoryRow)
{
    auto trace = TestTraceContainer({
        // Execution: NO memory operation
        {
            { C::execution_sel, 1 },
            { C::sel_mem_op, 0 },  // No memory access
        },
        // Memory: Claims to be valid (INJECTED!)
        {
            { C::memory_sel, 1 },
            { C::memory_addr, 42 },
            { C::memory_value, 999 },
        },
    });

    // Permutation fails: 0 sources != 1 destination
    EXPECT_THROW(
        check_all_interactions<MemoryTraceBuilder>(trace),
        std::runtime_error
    );
}
```

### 3. Tuple Value Mismatch

Test that tuple columns must match between source and destination.

```cpp
TEST_F(ComponentConstrainingTest, NegativeTupleMismatch)
{
    auto trace = TestTraceContainer({
        // Source row
        {
            { C::source_sel, 1 },
            { C::source_addr, 100 },
            { C::source_value, 42 },
        },
        // Destination row with WRONG values
        {
            { C::dest_sel, 1 },
            { C::dest_addr, 100 },
            { C::dest_value, 999 },  // Doesn't match source!
        },
    });

    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::runtime_error
    );
}
```

### 4. Missing Error Gating

Test that lookups don't fire when errors occur.

```cpp
TEST_F(AluConstrainingTest, NegativeLookupFiresOnError)
{
    // When sel_err = 1, lookups should NOT fire
    // (destination event not emitted on error path)

    auto trace = TestTraceContainer({
        {
            { C::sel_div, 1 },
            { C::sel_err, 1 },        // Error occurred!
            { C::a, 10 },
            { C::b, 0 },              // Division by zero
            // Lookup tries to fire but destination doesn't exist
        },
    });

    // If lookup source is properly gated by (1 - sel_err),
    // this should PASS (lookup doesn't fire)
    // If NOT gated, this FAILS (lookup fires, no destination)

    // Expected: This test documents whether error gating exists
    try {
        check_all_interactions<AluTraceBuilder>(trace);
        // Passed = properly gated
    } catch (...) {
        // Failed = missing error gating (BUG)
        FAIL() << "Lookup fired on error path - missing error gating";
    }
}
```

### 5. Lookup Allows Duplicates (Positive)

Lookups CAN have multiple sources pointing to same destination.

```cpp
TEST_F(RangeCheckConstrainingTest, PositiveLookupAllowsDuplicates)
{
    auto trace = TestTraceContainer({
        // Two sources looking up same range check value
        {
            { C::source_sel_a, 1 },
            { C::value_a, 42 },
        },
        {
            { C::source_sel_b, 1 },
            { C::value_b, 42 },  // Same value - OK for lookup
        },
        // One destination row
        {
            { C::range_check_sel, 1 },
            { C::range_check_value, 42 },
        },
    });

    // Lookups allow many-to-one
    check_all_interactions<RangeCheckTraceBuilder>(trace);
}
```

### 6. Permutation Rejects Duplicates (Negative)

Permutations require exact 1:1 mapping.

```cpp
TEST_F(MemoryConstrainingTest, NegativePermutationRejectsDuplicates)
{
    auto trace = TestTraceContainer({
        // Two source rows with same tuple
        {
            { C::exec_sel, 1 },
            { C::mem_addr, 100 },
            { C::mem_value, 42 },
        },
        {
            { C::exec_sel, 1 },
            { C::mem_addr, 100 },
            { C::mem_value, 42 },  // Duplicate!
        },
        // Only one destination
        {
            { C::memory_sel, 1 },
            { C::memory_addr, 100 },
            { C::memory_value, 42 },
        },
    });

    // Permutation fails: 2 sources can't both match 1 destination
    EXPECT_THROW(
        check_all_interactions<MemoryTraceBuilder>(trace),
        std::runtime_error
    );
}
```

## Setting Up Cross-Trace Tests

Interactions span multiple traces. Set columns for both source and destination:

```cpp
auto trace = TestTraceContainer({
    // === Source trace rows ===
    {
        { C::execution_sel, 1 },
        { C::sel_mem_read, 1 },
        { C::execution_addr, 100 },
        { C::execution_value, 42 },
        { C::execution_clk, 5 },
    },
    // === Destination trace rows ===
    {
        { C::memory_sel, 1 },
        { C::memory_addr, 100 },
        { C::memory_value, 42 },
        { C::memory_clk, 5 },
    },
});
```

## Finding Interaction Definitions

Interactions are defined in PIL with `in` (lookup) or `is` (permutation):

```bash
# Find all interactions in a component
grep -nE "}\s*(in|is)\s+" pil/vm2/component.pil

# Find the interaction name
grep -B1 "} is " pil/vm2/component.pil
```

Example PIL:
```pil
#[MEM_READ]
sel_mem_read { clk, addr, value } is memory.sel { memory.clk, memory.addr, memory.value };
```

## Precomputed Trace Setup

Many interactions reference precomputed columns (clk, constants):

```cpp
TEST_F(ComponentConstrainingTest, InteractionWithPrecomputed)
{
    TestTraceContainer trace;

    // First, populate precomputed columns
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    // Then set component-specific columns
    trace.set(C::component_sel, 0, 1);
    trace.set(C::component_value, 0, 42);
    // precomputed.clk is already set by PrecomputedTraceBuilder

    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

## Debugging Interaction Failures

When interactions fail:

1. **Check selector counts**: Print how many rows have each selector = 1
2. **Check tuple values**: Ensure source tuple columns match destination
3. **Check clk alignment**: Many interactions include clock columns
4. **Check error gating**: Is source selector gated by `(1 - sel_err)`?

```cpp
// Debug: Count active rows
uint32_t source_count = 0, dest_count = 0;
for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
    if (trace.get(C::source_sel, row) == 1) source_count++;
    if (trace.get(C::dest_sel, row) == 1) dest_count++;
}
std::cout << "Sources: " << source_count << ", Destinations: " << dest_count << std::endl;
```

## Build and Run

```bash
# Regenerate C++ from PIL
vmp

# Build tests
vmb

# Run interaction tests
vmtg "ComponentConstraining*Interaction*"
vmtg "ComponentConstraining*Permutation*"
vmtg "ComponentConstraining*Lookup*"
```

## Quick Reference

| Test Type | Source Count | Dest Count | Expected |
|-----------|--------------|------------|----------|
| Permutation match | N | N | PASS |
| Permutation mismatch | N | M (N != M) | THROW |
| Lookup match | N | >= N | PASS |
| Lookup missing dest | N | < N | THROW |
| Tuple mismatch | Any | Any | THROW |
| Injected dest row | 0 | 1 | THROW (permutation) |
