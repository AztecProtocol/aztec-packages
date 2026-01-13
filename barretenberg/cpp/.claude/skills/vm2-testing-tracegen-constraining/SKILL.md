---
name: vm2-testing-tracegen-constraining
description: Write constraining tests that use the full simulation-to-tracegen pipeline. These tests verify that trace generation code produces outputs that satisfy all PIL constraints, catching tracegen-PIL alignment issues.
version: 1.0.0
---

# VM2 Tracegen Constraining Testing

## Purpose
Write integration tests verifying that tracegen produces constraint-satisfying traces, catching tracegen-PIL alignment issues.

## When to Use
- Testing normal execution paths produce valid traces
- Testing error paths produce valid traces (with error flags)
- Testing edge cases (zero, max values, empty inputs)
- Verifying tracegen fix resolves constraint failure
- Integration testing after PIL or tracegen changes

## When NOT to Use
- Testing that constraints reject invalid values (use vm2-testing-relation-violation)
- Testing lookup/permutation matching (use vm2-testing-interaction-matching)
- Auditing PIL for bugs (use vm2-audit-* skills)

## Severity Assessment
- **Completeness bugs reachable via canonical simulation on valid inputs are Critical** - system doesn't work
- Soundness bugs: Critical/High based on exploitability
- Unreachable completeness bugs: Low

## Core Pattern

```cpp
#include "barretenberg/vm2/simulation/events.hpp"
#include "barretenberg/vm2/tracegen/component_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

TEST_F(ComponentConstrainingTest, PositiveDescriptiveName)
{
    // 1. Create events (simulation output)
    std::vector<ComponentEvent> events = {
        ComponentEvent{ .input_a = 10, .output = 30 },
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

| Category | What to Test | Key Assertions |
|----------|--------------|----------------|
| Normal execution | Standard operations | `check_relation`, `check_all_interactions` |
| Error paths | Division by zero, overflow | Same checks + verify error flag set |
| Edge cases | Zero, UINT_MAX, empty input | Same checks pass |
| Multi-component | Cross-builder interactions | Check all relations and interactions |

**Error path example** - verify error flag is set:
```cpp
EXPECT_EQ(trace.get(C::alu_sel_div_0_err, 0), 1);
```

**Using gadgets** for complex events (cryptographic ops):
```cpp
NiceMock<MockPoseidon2> poseidon2;
EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](auto& in) { return RawPoseidon2::hash(in); });
EventEmitter<MemoryEvent> emitter;
MemoryGadget gadget(poseidon2, emitter);
gadget.write(100, 42, 1);
// ... builder.process(emitter.dump_events(), trace);
```

## Common Failure Patterns

| Failure | Cause | Fix |
|---------|-------|-----|
| Missing column | Tracegen doesn't set column | `*_trace.cpp` |
| Wrong value | Computation mismatch | `*_trace.cpp` |
| Interaction fails | Source/dest count mismatch | Check error gating |
| Edge case fails | Unhandled case | Add case to tracegen |

## Debugging

When `check_relation` fails, exception includes constraint name. Print failing row:
```cpp
for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
    if (trace.get(C::component_sel, row) == 1) {
        std::cout << "Row " << row << ": a=" << trace.get(C::component_a, row) << std::endl;
    }
}
```

## Build and Run

```bash
vmp              # Regenerate C++ from PIL (if PIL changed)
vmb              # Build tests
vmtg "ComponentConstraining*"           # Run component tests
vmtg "ComponentConstraining*Positive*"  # Run specific test
```

## Discovery Commands

```bash
# Find event definitions
grep -rn "struct.*Event" src/barretenberg/vm2/simulation/

# Find trace builders
ls src/barretenberg/vm2/tracegen/*_trace.cpp
```
