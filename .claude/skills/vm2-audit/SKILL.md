---
name: vm2-audit
description: Perform security audits of the VM2/AVM zkVM components for soundness and completeness issues. Use when auditing PIL constraints, simulation code, tracegen code, reviewing constraint security, finding under-constraints, writing audit tests, or preparing pre-audit reports. Covers ALU, memory, execution, tree operations, and transaction handling.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task, TodoWrite, LSP
---

# VM2/AVM Security Audit Skill

## Overview

This skill enables comprehensive security auditing of the Aztec VM2/AVM (Application Virtual Machine) codebase. The VM2 is a zero-knowledge virtual machine that executes Aztec transactions with proof generation. Audits focus on two critical security properties:

1. **Soundness** - A malicious prover cannot create valid proofs for invalid computations
2. **Completeness** - Valid computations always produce valid proofs (honest prover succeeds)

## Audit Scope

The VM2 codebase has three main layers to audit:

| Layer | Location | Purpose |
|-------|----------|---------|
| PIL Constraints | `barretenberg/cpp/pil/vm2/` | Polynomial constraint definitions |
| Simulation | `barretenberg/cpp/src/barretenberg/vm2/simulation/` | Event collection during execution |
| Tracegen | `barretenberg/cpp/src/barretenberg/vm2/tracegen/` | Trace generation from events |

## Instructions

### Step 1: Understand the Component

1. Read the PIL file for the component being audited
2. Review the documentation block at the top (PRECONDITIONS, USAGE, TRACE SHAPE, ERROR HANDLING, INTERACTIONS)
3. Identify all columns and their types (especially `@boolean` annotations)
4. Map out the constraint relationships

### Step 2: Check Common Vulnerability Patterns

**IMPORTANT**: When you find a bug, do NOT stop to write tests and fixes immediately. Continue the full audit to find all bugs first. A single bug often indicates similar issues elsewhere in the component. Complete Steps 2-3 fully, document all findings, then proceed to testing and fixing.

For each constraint, check these common bug patterns (see [VM2_AUDIT_FINDINGS.md](VM2_AUDIT_FINDINGS.md) for examples):

1. **Missing Boolean Constraints**
   - Every `@boolean` column needs: `x * (1 - x) = 0;`
   - Note: Columns may be boolean-constrained implicitly via:
     - Lookups to binary destinations (e.g., `bit` constrained via to_radix lookup)
     - Derivation from other booleans (e.g., `should_add = not_end * bit`)
   - Document which method is used for each boolean column

2. **Selector Under-constraint**
   - Selectors must be constrained on inactive rows
   - Check: `selector * (1 - sel) = 0;` or proper gating

3. **Missing Propagation**
   - Immutable values need propagation constraints with latch conditions
   - Pattern: `(1 - LATCH) * (value' - value) = 0;`

4. **Lookup vs Permutation**
   - Use permutations (not lookups) when destination has side effects
   - Memory operations, state changes require permutations

5. **Premature Termination**
   - Multi-row computations need: `sel * (1 - sel') * (1 - end) = 0;`

6. **Missing Error Gating**
   - Interaction source selectors must be gated by no-error conditions
   - Pattern: `pol SOURCE = base_sel * (1 - sel_err);`

7. **Zero-Check Violations**
   - Verify zero-check pattern: `x * (e * (1 - inv) + inv) - 1 + e = 0;`

8. **Missing Initialization**
   - Values need initialization on first row
   - Pattern: `precomputed.first_row * (value - INIT) = 0;`

9. **Commented-out Constraints (CRITICAL)**
   - Scan for `// FIXME` or `// TODO` comments that disable constraints
   - Especially dangerous: commented-out error aggregation constraints
   - Example: `// sel_err = err_a + err_b;` allows errors to not propagate
   - These often indicate incomplete implementations that break security

10. **Multi-Row Lifecycle Constraints**
    - Start/end/latch patterns for multi-row computations:
      - Start: `LATCH_CONDITION * (start' - 1) = 0;`
      - End: `end * remaining_count = 0;` (only end when done)
      - Continuity: `(1 - LATCH) * (sel' - sel) = 0;`
    - Verify derived selectors like `LATCH_CONDITION` stay boolean
    - Prove mutual exclusivity when combining conditions

### Step 3: Verify Simulation-Tracegen-PIL Alignment

**NOTE**: Many completeness issues stem from misalignment between layers. When tracegen produces values that don't satisfy PIL constraints, or when simulation emits events that tracegen doesn't handle correctly, valid executions fail to produce valid proofs. This is a common bug pattern.

1. **Simulation to Tracegen**
   - Each simulation event type should have corresponding tracegen processing
   - Event fields must map to trace columns correctly
   - Error conditions must emit appropriate events

2. **Tracegen to PIL**
   - Every PIL column must be set by tracegen
   - Column types/ranges in tracegen must match PIL expectations
   - Interaction declarations must match PIL lookup/permutation definitions

3. **Cross-Layer Analysis**
   - Some constraints may be enforced by other components (e.g., range checks at memory layer)
   - When a constraint seems missing, check if another component provides it
   - Document whether redundancy is intentional (defense-in-depth) or if constraint is truly missing
   - **Defense-in-depth principle**: Redundant constraints are not harmful; missing constraints are dangerous. When reviewing a TODO suggesting removal of a "redundant" constraint, verify protection exists elsewhere first.

### Step 4: Write Tests

#### Positive Test (Completeness)
```cpp
TEST_F(ComponentTest, PositiveValidOperation)
{
    // Setup trace builders
    PrecomputedTraceBuilder precomputed_builder;
    ComponentTraceBuilder builder;

    // Create valid event
    auto event = create_valid_event();

    // Build trace
    TestTraceContainer trace;
    precomputed_builder.process(trace);
    builder.process(event, trace);

    // Verify all constraints pass
    check_relation<ComponentRelation>(trace);
    check_all_interactions<ComponentTraceBuilder>(trace);
}
```

#### Negative Test (Soundness)

**IMPORTANT**: Always test against ALL relations first, not just the specific constraint you suspect is buggy. Other constraints may prevent the exploit, meaning it's not actually a bug.

```cpp
TEST_F(ComponentTest, NegativeMaliciousValue)
{
    auto trace = TestTraceContainer({
        {{ C::column, malicious_value }},
    });

    // FIRST: Test against ALL relations to confirm the bug exists
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "some_constraint"  // Will show which constraint catches it
    );
}
```

**If the test passes (no exception)**: The suspected bug is not exploitable - some other constraint prevents it. In this case:
1. Investigate which constraint provides the protection
2. Add comments to the PIL explaining why this is secure
3. Document the finding as "investigated but not a bug" in your notes

**If the test fails as expected**: You can optionally add a more specific test targeting the exact constraint by name:

```cpp
// Optional: Test specific constraint after confirming bug with full check
EXPECT_THROW_WITH_MESSAGE(
    check_relation<ComponentRelation>(trace, "CONSTRAINT_NAME"),
    "CONSTRAINT_NAME"
);
```

To reference constraints by name, use the PIL annotation:
```pil
#[CONSTRAINT_NAME]
col1 * col2 = col3;
```

After `vmp`, the generated C++ will support testing by this name.

### Step 5: Write Edge Case Tests

**IMPORTANT**: Always add tests for important edge cases discovered during the audit. These tests improve coverage and serve as regression tests. Common edge cases to test:

1. **Zero/Identity values**: e.g., `0 * P = infinity` for scalar mul, `x + 0 = x` for ALU
2. **Maximum values**: Near field modulus, maximum memory address, etc.
3. **Boundary conditions**: First/last row behavior, wrap-around cases
4. **Special inputs**: Infinity points, negative values, edge of valid ranges

Add these tests to the existing test file for the component (e.g., `ecc.test.cpp` for scalar_mul).

### Step 6: Document Findings and Write Report

**IMPORTANT**: Always write the audit report to a markdown file in the audit reports directory:
- Location: `barretenberg/cpp/pil/vm2/claude-audits/<component>_audit_report.md`
- **Start the report with**: `> Generated by Claude` on the first line
- Include: Executive summary, architecture overview, constraint analysis, alignment checks, vulnerability patterns, edge cases, test coverage, and findings summary

Create a findings section with:
- **Issue Type**: Soundness/Completeness
- **Severity**: Critical/High/Medium/Low
- **Location**: File and constraint name
- **Description**: What the bug is
- **Impact**: What a malicious prover could do
- **Fix**: Proposed solution

## Per-Component Audit Checklist

### Simulation Tasks
- [ ] **DOCU_FUNCTIONS** - Document all functions with doxygen
- [ ] **EVENT_INIT** - Events have no uninitialized members
- [ ] **EMIT_EXPLICIT_EVENT** - Events built explicitly, not incrementally
- [ ] **INTERACTION_EVENTS** - Source and destination events both emitted
- [ ] **SANITY_SOURCE** - Code clarity, `override` keywords, specific exceptions
- [ ] **CPP_HEADERS** - Correct includes
- [ ] **OPTIONAL_SAFETY** - Check `.has_value()` before `.value()` on optionals; use `.value_or()` for safe defaults
- [ ] **CROSS_LAYER_EDGE_CASES** - Verify simulation handles all edge cases that PIL/tracegen handle

### Tracegen Tasks
- [ ] **DOCU_FUNCTIONS** - Document event flavors
- [ ] **TYPE/RANGE** - Column values within correct ranges
- [ ] **INTERACTION_SRC** - Source selector toggles match event emission
- [ ] **SANITY_SOURCE** - No column override, uniform naming
- [ ] **INTERACTIONS_DECL** - Correct interaction types (LookupSequential, etc.)

### Circuit Tasks
- [ ] **DOCU_MAIN** - Document trace shape, errors, preconditions
- [ ] **DOCU_INTERACTIONS** - Document lookup/permutation usages
- [ ] **DOCU_INSIDE** - Comment non-trivial logic
- [ ] **HEADERS_SANITY** - Check PIL imports
- [ ] **TYPE/RANGE** - Range checks for columns
- [ ] **COMMON_PATTERNS** - Boolean, zero-check, latch patterns
- [ ] **INTERACTIONS_USE** - Correct selectors and tuples
- [ ] **COMPLETENESS** - Relations are invariants of tracegen
- [ ] **SKIPPABLE** - Skippable condition is correct
- [ ] **SOUNDNESS** - Relations enforce expected behavior
- [ ] **FIXME_SCAN** - Check for FIXME/TODO comments that disable security constraints
- [ ] **ERROR_AGGREGATION** - Verify error flags are aggregated (e.g., `sel_err = err_a + err_b`)
- [ ] **IMPLICIT_BOOL** - Document columns constrained via lookups vs explicit constraints
- [ ] **CROSS_LAYER** - Verify constraints not duplicated/missing across component boundaries

## Key References

- [VM2 Audit Findings](VM2_AUDIT_FINDINGS.md) - Detailed bug patterns and examples
- [VM2 Codebase Guide](VM2_CODEBASE_GUIDE.md) - Codebase structure and navigation
- [VM Circuit Recipes](VM_CIRCUIT_RECIPES.md) - PIL constraint patterns
- [Commit Workflow](COMMIT_WORKFLOW.md) - How to commit fixes and create PRs
- [Previous Audit Reports](../../../../barretenberg/cpp/pil/vm2/claude-audits/) - Past audit reports for reference

## Build and Test Commands

```bash
# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run specific test pattern
vmtg "AluConstraining*"  # or: ./build/bin/vm2_tests --gtest_filter="*ALU*"

# Regenerate C++ from PIL
vmp  # or: run bb-pilcom on PIL files
```

## Examples

### Example 1: Audit ALU Component

```
1. Read barretenberg/cpp/pil/vm2/alu.pil
2. Check all @boolean columns have constraints
3. Verify sel_op_* selectors are mutually exclusive
4. Check error handling (sel_err, sel_tag_err, sel_div_0_err)
5. Verify range check lookups are properly gated
6. Check GT/FF_GT lookups have correct selectors
7. Write tests for each operation type
8. Document findings
```

### Example 2: Finding Missing Constraint

```pil
// Found: @boolean annotation without constraint
pol commit my_selector; // @boolean
// Missing: my_selector * (1 - my_selector) = 0;

// Impact: Malicious prover can set my_selector to any value
// Fix: Add boolean constraint
```

### Example 3: Finding Under-constrained Interaction

```pil
// Found: Lookup without error gating
sel_op { input } in dest_sel { output };

// Should be:
pol SOURCE = sel_op * (1 - sel_err);
SOURCE { input } in dest_sel { output };

// Impact: Completeness issue - lookup fails when error occurs
```

### Example 4: Finding Commented-out Constraint (CRITICAL)

```pil
// Found in instr_fetching.pil:
// FIXME: constrain this again once all execution opcodes are supported.
// sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range;
sel_parsing_err * (1 - sel_parsing_err) = 0;  // Only boolean constraint!

// Impact: CRITICAL SOUNDNESS - Prover can set sel_parsing_err = 0 even when
// individual error flags are 1, bypassing error propagation to execution layer.
// Attacker could claim valid instruction at invalid PC.

// Fix: Uncomment the aggregation constraint or add equivalent
```

### Example 5: Simulation Completeness Bug (Optional Misuse)

```cpp
// Found in contract_instance_manager.cpp:
// Protocol contracts have 11 reserved slots, but only 6 are used.
// Querying addresses 7-11 returns nullopt.

// BEFORE (crashes on empty protocol slot):
const ContractInstance& instance = maybe_instance.value();  // CRASH!
return instance;

// AFTER (safely handles empty optional):
.contract_instance = maybe_instance.value_or(ContractInstance{}),
return maybe_instance;  // Returns nullopt for empty slots

// Impact: COMPLETENESS - Honest prover crashes when generating valid trace
// for query to unused but valid protocol contract address.
// PIL handles this correctly (exists=0), but simulation crashes first.

// Pattern to check: Search for `.value()` calls on optionals without
// `.has_value()` guard. Also test "reserved but unused" edge cases.
```

## Component Priority List

| Component | Priority | Files |
|-----------|----------|-------|
| Execution | HIGH | execution.pil, addressing.pil, registers.pil, gas.pil, discard.pil |
| TX | HIGH | tx.pil, tx_context.pil, tx_discard.pil |
| ALU | HIGH | alu.pil |
| Data Copy | HIGH | data_copy.pil |
| Merkle | HIGH | trees/merkle_check.pil |
| Poseidon2 | HIGH | poseidon2_*.pil |
| Context | HIGH | context.pil, context_stack.pil |
| Internal Call | HIGH | internal_call_stack.pil |
| Bytecode | MEDIUM | bytecode/*.pil |
| Trees | MEDIUM | trees/*.pil |
| ECC | MEDIUM | ecc.pil, scalar_mul.pil |
| Memory | LOW | memory.pil |
| Bitwise | LOW | bitwise.pil |
| Keccak/SHA | LOW | keccakf1600.pil, sha256.pil |
