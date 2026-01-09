---
name: vm2-audit-missing-error-gating
description: Audit VM2/AVM PIL files for missing error gating on lookup/permutation interactions. Completeness issue where source selectors fire even when errors occur, causing interaction failures because the destination event was not emitted on the error path.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Error Gating Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing error gating on lookup/permutation interactions. This is a **completeness vulnerability** that causes honest provers to fail when errors occur.

**Bug Type**: Completeness
**Severity**: Medium
**Frequency**: High

## Why This is Important

When an error occurs, simulation stops or takes an error path without emitting the destination event. If the source selector isn't gated by the error condition, the lookup fires but has nothing to match against:

```pil
// VULNERABLE: Lookup fires even on error
pol SOURCE = sel_operation;
#[OPERATION_LOOKUP]
SOURCE { input } in dest.sel { dest.input };

// When sel_operation = 1 and sel_err = 1:
// - Source selector fires (sel_operation = 1)
// - But destination event was not emitted (error path)
// - Interaction fails!
```

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Interactions

```bash
# Find all lookup/permutation interactions
grep -nP '}\s*(in|is)\b' barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: Trace Source Selectors

For each interaction found:
1. Identify the source selector (left side of `in` or `is`)
2. Check if it's raw (`sel_op`) or derived (`sel_op * condition`)
3. Determine what error conditions can occur during this operation

### Step 3: List All Error Flags

```bash
# Find error-related columns
grep -rn "sel_err\|sel_.*_err\|err\|fail" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Common error flags to check:
| Flag | Meaning |
|------|---------|
| `sel_err` | General error |
| `sel_tag_err` | Type tag mismatch |
| `sel_div_0_err` | Division by zero |
| `sel_overflow_err` | Arithmetic overflow |
| `sel_bytecode_retrieval_failure` | Bytecode fetch failed |
| `sel_instruction_fetching_failure` | Instruction parse failed |

### Step 4: Verify Error Gating

For each interaction, verify the source selector is gated by relevant error flags:

```bash
# Check if selector is gated by error
grep -rn "sel_op.*1 - sel_err\|sel_op.*(1 - sel" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 5: Check Simulation Code

Review the corresponding simulation code to understand:
- Does the error path emit the destination event?
- If not, the source selector MUST be gated

## Vulnerable vs Secure Patterns

### Vulnerable Pattern

```pil
// VULNERABLE: Lookup fires even on error
#[MY_LOOKUP]
sel_op { input } in dest.sel { output };

// When sel_op = 1 and sel_err = 1:
// - Lookup fires, but destination not emitted
// - Interaction FAILS
```

### Secure Pattern

```pil
// SECURE: Gate source by no-error condition
pol SEL_OP_NO_ERR = sel_op * (1 - sel_err);
#[MY_LOOKUP]
SEL_OP_NO_ERR { input } in dest.sel { output };

// When sel_err = 1:
// - SEL_OP_NO_ERR = 0, no lookup attempted
// - Interaction succeeds
```

## Historical Examples

### Example 1: ALU Lookups (PR #18192)
```pil
// BEFORE: Lookups not gated by error
#[GT_DIV_REMAINDER]
sel_div { ... } in gt.sel { ... };  // Fires on tag mismatch!

// AFTER: Properly gated
pol SEL_DIV_NO_ERR = sel_div * (1 - sel_err) * (1 - sel_tag_err);
#[GT_DIV_REMAINDER]
SEL_DIV_NO_ERR { ... } in gt.sel { ... };
```
**Impact**: MUL, DIV, SHL, SHR operations failed on tag mismatch.

### Example 2: Execution Dispatch
```pil
// Gate bytecode/instruction lookups by error
pol SEL_FETCH = sel * (1 - sel_bytecode_retrieval_failure);
SEL_FETCH { ... } in bc_retrieval.sel { ... };
```

## Test Pattern

```cpp
TEST_F(ComponentTest, PositiveOperationWithError)
{
    // Create trace where operation has error
    PrecomputedTraceBuilder precomputed;
    ComponentTraceBuilder builder;

    auto event = create_event_with_tag_error();

    TestTraceContainer trace;
    precomputed.process(trace);
    builder.process(event, trace);

    // Should pass - error gating prevents lookup failure
    check_relation<ComponentRelation>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

**Interpretation**:
- **Test passes**: Error gating works correctly
- **Test fails on interaction**: Source selector not properly gated by error

## Fix Pattern

```pil
// BEFORE: Ungated source
#[MY_LOOKUP]
sel_op { input } in dest.sel { output };

// AFTER: Gated by error
pol SEL_OP_NO_ERR = sel_op * (1 - sel_err);
#[MY_LOOKUP]
SEL_OP_NO_ERR { input } in dest.sel { output };
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

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/04-missing-error-gating.md)
- [VM2 Audit Findings](/.claude/skills/vm2-audit/VM2_AUDIT_FINDINGS.md)
- [PR #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) - ALU Pre-Audit
