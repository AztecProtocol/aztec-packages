---
name: vm2-testing-tracegen-constraining
description: Write constraining tests that use the full simulation-to-tracegen pipeline. These tests verify that trace generation code produces outputs that satisfy all PIL constraints, catching tracegen-PIL alignment issues.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Tracegen Constraining Testing

## Purpose

Write **integration tests** that verify the tracegen model produces constraint-satisfying traces. These tests:
1. Create simulation events (via gadgets or direct construction)
2. Process events through trace builders
3. Verify the generated trace passes all relations and interactions

This catches **tracegen-PIL alignment issues** where the C++ tracegen code doesn't match PIL constraints.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## When to Use

- Testing that normal execution paths produce valid traces
- Testing that error paths produce valid traces (with error flags set)
- Testing edge cases (zero values, max values, empty inputs)
- Verifying a tracegen fix actually resolves a constraint failure
- Integration testing after PIL or tracegen changes

## Core Pattern

```cpp
#include "barretenberg/vm2/simulation/events.hpp"
#include "barretenberg/vm2/tracegen/component_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

TEST_F(ComponentConstrainingTest, PositiveNormalExecution)
{
    // 1. Create events (simulation output)
    std::vector<ComponentEvent> events = {
        ComponentEvent{
            .input_a = 10,
            .input_b = 20,
            .output = 30,
            .error = std::nullopt,
        },
    };

    // 2. Build trace using real tracegen
    TestTraceContainer trace;

    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    ComponentTraceBuilder builder;
    builder.process(events, trace);

    // 3. Verify ALL constraints pass
    check_relation<ComponentRelation>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

## Test Categories

### 1. Normal Execution Path

Test that standard operations produce valid traces.

```cpp
TEST_F(AluConstrainingTest, PositiveAddition)
{
    std::vector<AluEvent> events = {
        AluEvent{
            .opcode = AluOpcode::ADD,
            .a = 100,
            .b = 50,
            .c = 150,
            .tag = MemoryTag::U32,
        },
    };

    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    AluTraceBuilder builder;
    builder.process(events, trace);

    check_relation<AluRelation>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}
```

### 2. Error Path Execution

Test that error cases produce valid traces with error flags.

```cpp
TEST_F(AluConstrainingTest, PositiveDivisionByZero)
{
    std::vector<AluEvent> events = {
        AluEvent{
            .opcode = AluOpcode::DIV,
            .a = 100,
            .b = 0,  // Division by zero!
            .c = 0,  // Result undefined
            .error = AluError::DivisionByZero,
        },
    };

    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    AluTraceBuilder builder;
    builder.process(events, trace);

    // Trace should still be valid - error properly handled
    check_relation<AluRelation>(trace);
    check_all_interactions<AluTraceBuilder>(trace);

    // Verify error flag is set
    EXPECT_EQ(trace.get(C::alu_sel_div_0_err, 0), 1);
}
```

### 3. Edge Cases

Test boundary conditions and special values.

```cpp
TEST_F(AluConstrainingTest, PositiveMaxValues)
{
    std::vector<AluEvent> events = {
        AluEvent{
            .opcode = AluOpcode::ADD,
            .a = UINT32_MAX,
            .b = 1,
            .c = 0,  // Overflow wraps
            .overflow = true,
        },
    };

    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    AluTraceBuilder builder;
    builder.process(events, trace);

    check_relation<AluRelation>(trace);
    check_all_interactions<AluTraceBuilder>(trace);
}

TEST_F(ComponentConstrainingTest, PositiveEmptyInput)
{
    // Empty events should produce valid (empty) trace
    std::vector<ComponentEvent> events = {};

    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    ComponentTraceBuilder builder;
    builder.process(events, trace);

    check_relation<ComponentRelation>(trace);
}
```

### 4. Using Simulation Gadgets

For complex events, use simulation gadgets that handle cryptographic operations.

```cpp
TEST_F(MemoryConstrainingTest, PositiveWithGadget)
{
    // Set up mocks for cryptographic operations
    NiceMock<MockPoseidon2> poseidon2;
    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const auto& inputs) {
        return RawPoseidon2::hash(inputs);
    });

    // Create gadget and emit events
    EventEmitter<MemoryEvent> emitter;
    MemoryGadget gadget(poseidon2, emitter);

    gadget.write(/*addr=*/100, /*value=*/42, /*context=*/1);
    gadget.read(/*addr=*/100, /*context=*/1);

    // Build trace from events
    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    MemoryTraceBuilder builder;
    builder.process(emitter.dump_events(), trace);

    check_relation<MemoryRelation>(trace);
    check_all_interactions<MemoryTraceBuilder>(trace);
}
```

### 5. Multi-Component Integration

Test interactions between multiple trace builders.

```cpp
TEST_F(IntegrationConstrainingTest, PositiveExecutionWithMemory)
{
    TestTraceContainer trace;

    // Build precomputed first
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);

    // Build execution trace
    std::vector<ExecutionEvent> exec_events = { /* ... */ };
    ExecutionTraceBuilder exec_builder;
    exec_builder.process(exec_events, trace);

    // Build memory trace (execution events may emit memory events)
    std::vector<MemoryEvent> mem_events = { /* ... */ };
    MemoryTraceBuilder mem_builder;
    mem_builder.process(mem_events, trace);

    // Check all components
    check_relation<ExecutionRelation>(trace);
    check_relation<MemoryRelation>(trace);

    // Check cross-component interactions
    check_all_interactions<ExecutionTraceBuilder>(trace);
    check_all_interactions<MemoryTraceBuilder>(trace);
}
```

## Event Structure

Events are defined in `simulation/events.hpp` or component-specific headers:

```cpp
struct AluEvent {
    AluOpcode opcode;
    FF a;
    FF b;
    FF c;
    MemoryTag tag;
    std::optional<AluError> error;
    // ... other fields
};
```

Find event definitions:
```bash
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/
```

## Trace Builder Interface

Trace builders convert events to trace rows:

```cpp
class ComponentTraceBuilder {
public:
    void process(std::span<const ComponentEvent> events, TraceContainer& trace);
    // Or for some builders:
    void process(const ComponentEvent& event, TraceContainer& trace);
};
```

Find trace builders:
```bash
ls src/barretenberg/vm2/tracegen/*_trace.cpp
```

## Debugging Constraint Failures

When `check_relation` fails:

1. **Identify the failing constraint**: Exception message includes constraint name
2. **Print the trace row**: See what values tracegen produced
3. **Compare with PIL**: Check what the constraint expects
4. **Fix tracegen**: Update the trace builder to produce correct values

```cpp
// Debug: Print row that fails
for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
    if (trace.get(C::component_sel, row) == 1) {
        std::cout << "Row " << row << ":"
                  << " a=" << trace.get(C::component_a, row)
                  << " b=" << trace.get(C::component_b, row)
                  << " c=" << trace.get(C::component_c, row)
                  << std::endl;
    }
}
```

## Common Failure Patterns

| Failure | Likely Cause | Fix Location |
|---------|--------------|--------------|
| Missing column | Tracegen doesn't set column | `*_trace.cpp` |
| Wrong value | Computation mismatch | `*_trace.cpp` |
| Interaction fails | Source/dest count mismatch | Check error gating |
| Edge case fails | Tracegen doesn't handle case | Add case to tracegen |

## Build and Run

```bash
# Regenerate C++ from PIL (if PIL changed)
vmp

# Build tests
vmb

# Run all constraining tests for component
vmtg "ComponentConstraining*"

# Run specific positive test
vmtg "ComponentConstraining*Positive*"

# Run with verbose output
vmtg "ComponentConstraining*" --gtest_print_time=1
```

## Positive vs Negative Tests

| Test Type | Events | Expected Result |
|-----------|--------|-----------------|
| **Positive** (this skill) | Valid simulation events | All checks PASS |
| Negative (relation-violation) | Hand-crafted invalid trace | Specific check THROWS |

Positive tests prove tracegen works. Negative tests prove constraints catch violations.

## Quick Reference

```cpp
// Standard positive test structure
TEST_F(ComponentConstrainingTest, PositiveDescriptiveName)
{
    // 1. Create events
    std::vector<ComponentEvent> events = { /* ... */ };

    // 2. Build trace
    TestTraceContainer trace;
    PrecomputedTraceBuilder precomputed;
    precomputed.process(trace);
    ComponentTraceBuilder builder;
    builder.process(events, trace);

    // 3. Verify
    check_relation<ComponentRelation>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```
