---
name: vm2-testing-interaction-matching
description: Write tests for lookup and permutation interaction correctness. Tests verify source/destination row counts match, tuple values align, and interactions fail appropriately when mismatched.
version: 1.0.0
---

# VM2 Interaction Matching Testing

## Purpose
Write tests verifying lookup and permutation interactions have correct source/destination row counts and tuple values.

## When to Use
- Writing negative tests for interaction count mismatches
- Testing tuple value alignment between source and destination
- Verifying error gating prevents lookups from firing on error paths
- Testing injected row detection in permutations

## When NOT to Use
- Testing constraint relations (use vm2-testing-relation-violation)
- Full simulation-based tests (use vm2-testing-tracegen-constraining)

## Interaction Types

```pil
// LOOKUP (in): Many sources can map to one destination
source_sel { a, b } in dest.sel { dest.x, dest.y };

// PERMUTATION (is): Exact 1:1 mapping required
source_sel { a, b } is dest.sel { dest.x, dest.y };
```

| Type | Source:Dest Ratio | Fails When |
|------|-------------------|------------|
| Lookup | N:>=N | dest count < source count |
| Permutation | N:N exactly | counts differ OR tuples don't pair |

## Core Test Functions

```cpp
check_all_interactions<ComponentTraceBuilder>(trace);  // All interactions
check_permutation<ComponentTraceBuilder, PermSettings>(trace);  // Specific permutation
check_lookup<ComponentTraceBuilder, LookupSettings>(trace);  // Specific lookup
```

## Test Patterns

### Row Count Mismatch (Permutation)
```cpp
TEST_F(ComponentConstrainingTest, NegativePermutationCountMismatch)
{
    auto trace = TestTraceContainer({
        { { C::source_sel, 1 }, { C::source_value, 10 } },
        { { C::source_sel, 1 }, { C::source_value, 20 } },
        // Only 1 destination for 2 sources
        { { C::dest_sel, 1 }, { C::dest_value, 10 } },
    });
    EXPECT_THROW(check_all_interactions<ComponentTraceBuilder>(trace), std::runtime_error);
}
```

### Injected Row Detection
```cpp
TEST_F(MemoryConstrainingTest, NegativeInjectedMemoryRow)
{
    auto trace = TestTraceContainer({
        { { C::execution_sel, 1 }, { C::sel_mem_op, 0 } },  // No memory op
        // Injected memory row with no source
        { { C::memory_sel, 1 }, { C::memory_addr, 42 }, { C::memory_value, 999 } },
    });
    EXPECT_THROW(check_all_interactions<MemoryTraceBuilder>(trace), std::runtime_error);
}
```

### Tuple Value Mismatch
```cpp
TEST_F(ComponentConstrainingTest, NegativeTupleMismatch)
{
    auto trace = TestTraceContainer({
        { { C::source_sel, 1 }, { C::source_addr, 100 }, { C::source_value, 42 } },
        { { C::dest_sel, 1 }, { C::dest_addr, 100 }, { C::dest_value, 999 } },  // Wrong!
    });
    EXPECT_THROW(check_all_interactions<ComponentTraceBuilder>(trace), std::runtime_error);
}
```

### Missing Error Gating
```cpp
TEST_F(AluConstrainingTest, NegativeLookupFiresOnError)
{
    // When sel_err = 1, lookups should NOT fire (no destination on error path)
    auto trace = TestTraceContainer({
        { { C::sel_div, 1 }, { C::sel_err, 1 }, { C::a, 10 }, { C::b, 0 } },
    });
    // If lookup source is gated by (1 - sel_err): PASS
    // If NOT gated: FAIL (lookup fires, no destination)
    try {
        check_all_interactions<AluTraceBuilder>(trace);
    } catch (...) {
        FAIL() << "Lookup fired on error path - missing error gating";
    }
}
```

### Lookup Allows Duplicates (Positive)
```cpp
TEST_F(RangeCheckConstrainingTest, PositiveLookupAllowsDuplicates)
{
    auto trace = TestTraceContainer({
        { { C::source_sel_a, 1 }, { C::value_a, 42 } },
        { { C::source_sel_b, 1 }, { C::value_b, 42 } },  // Same value OK
        { { C::range_check_sel, 1 }, { C::range_check_value, 42 } },
    });
    check_all_interactions<RangeCheckTraceBuilder>(trace);  // Should pass
}
```

### Permutation Rejects Duplicates (Negative)
```cpp
TEST_F(MemoryConstrainingTest, NegativePermutationRejectsDuplicates)
{
    auto trace = TestTraceContainer({
        { { C::exec_sel, 1 }, { C::mem_addr, 100 }, { C::mem_value, 42 } },
        { { C::exec_sel, 1 }, { C::mem_addr, 100 }, { C::mem_value, 42 } },  // Duplicate
        { { C::memory_sel, 1 }, { C::memory_addr, 100 }, { C::memory_value, 42 } },
    });
    EXPECT_THROW(check_all_interactions<MemoryTraceBuilder>(trace), std::runtime_error);
}
```

## Cross-Trace Setup

Interactions span traces. Set columns for both source and destination:

```cpp
auto trace = TestTraceContainer({
    // Source trace
    { { C::execution_sel, 1 }, { C::sel_mem_read, 1 },
      { C::execution_addr, 100 }, { C::execution_value, 42 }, { C::execution_clk, 5 } },
    // Destination trace
    { { C::memory_sel, 1 }, { C::memory_addr, 100 },
      { C::memory_value, 42 }, { C::memory_clk, 5 } },
});
```

## Finding Interactions in PIL

```bash
grep -nE "}\s*(in|is)\s+" pil/vm2/component.pil
```

Example:
```pil
#[MEM_READ]
sel_mem_read { clk, addr, value } is memory.sel { memory.clk, memory.addr, memory.value };
```

## Precomputed Columns

```cpp
TEST_F(ComponentConstrainingTest, InteractionWithPrecomputed)
{
    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);  // Sets clk, constants
    trace.set(C::component_sel, 0, 1);
    trace.set(C::component_value, 0, 42);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

## Debugging Failures

1. **Count selectors**: How many rows have each selector = 1?
2. **Check tuples**: Do source columns match destination columns?
3. **Check clk**: Many interactions include clock columns
4. **Check error gating**: Is source selector gated by `(1 - sel_err)`?

```cpp
uint32_t src = 0, dst = 0;
for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
    if (trace.get(C::source_sel, row) == 1) src++;
    if (trace.get(C::dest_sel, row) == 1) dst++;
}
std::cout << "Sources: " << src << ", Destinations: " << dst << std::endl;
```

## Build and Run

```bash
vmp   # Regenerate C++ from PIL
vmb   # Build tests
vmtg "ComponentConstraining*Interaction*"
vmtg "ComponentConstraining*Permutation*"
```
