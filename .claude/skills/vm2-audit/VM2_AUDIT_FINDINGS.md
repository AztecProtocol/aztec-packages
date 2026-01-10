# VM2/AVM Pre-Audit Findings and Patterns

This document summarizes findings from the VM2/AVM pre-audit process, including security vulnerabilities discovered, common bug patterns, and lessons learned from the audit PRs.

## Table of Contents

1. [Overview](#overview)
2. [Security Finding Categories](#security-finding-categories)
3. [Detailed Findings by Component](#detailed-findings-by-component)
4. [Common Bug Patterns](#common-bug-patterns)
5. [Audit Methodology](#audit-methodology)
6. [PIL Constraint Recipes](#pil-constraint-recipes)
7. [References](#references)

---

## Overview

The VM2/AVM pre-audit is an internal security review process for the Aztec Protocol's virtual machine. The audit covers three main layers:

1. **Simulation** - Executes transactions and collects events
2. **Tracegen** - Converts simulation events into constraint traces
3. **Circuit (PIL)** - Polynomial constraint definitions

### Pre-Audit PRs Analyzed

| PR | Component | Status | Key Focus |
|----|-----------|--------|-----------|
| [#18192](https://github.com/AztecProtocol/aztec-packages/pull/18192) | ALU | Merged | Arithmetic operations, tag handling |
| [#17877](https://github.com/AztecProtocol/aztec-packages/pull/17877) | Data Copy | Merged | Memory bounds, calldata/returndata |
| [#17771](https://github.com/AztecProtocol/aztec-packages/pull/17771) | Merkle Check | Merged | Tree operations, path verification |
| [#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336) | TX (Part 1) | Merged | Transaction trace, phases |
| [#18606](https://github.com/AztecProtocol/aztec-packages/pull/18606) | TX (Part 2) | Merged | Constraint improvements |
| [#18864](https://github.com/AztecProtocol/aztec-packages/pull/18864) | Execution | Merged | Control flow, gas, errors |
| [#19001](https://github.com/AztecProtocol/aztec-packages/pull/19001) | Addressing | Merged | Address resolution |
| [#19027](https://github.com/AztecProtocol/aztec-packages/pull/19027) | Registers | Merged | Register constraints |
| [#19077](https://github.com/AztecProtocol/aztec-packages/pull/19077) | Gas | Merged | Gas tracking |
| [#19149](https://github.com/AztecProtocol/aztec-packages/pull/19149) | Discard | Merged | Error handling, revert logic |
| [#19155](https://github.com/AztecProtocol/aztec-packages/pull/19155) | External Call | Merged | Cross-context calls |

---

## Security Finding Categories

### 1. Soundness Issues

**Definition**: A malicious prover can create a valid proof for an invalid computation.

**Examples Found**:

1. **ALU Multiplication Under-constraint** ([#18192](https://github.com/AztecProtocol/aztec-packages/pull/18192))
   - Missing range check on `c_hi` for tags < U128
   - Allowed arbitrary output values: `c_hi := (a*b - c)/(max_value + 1)`

2. **ALU Shift Overflow Under-constraint** ([#18192](https://github.com/AztecProtocol/aztec-packages/pull/18192))
   - `two_pow_shift_lo_bits` not constrained when overflow is toggled
   - Allowed fake output of 0 even without overflow

3. **Execution PC Under-constraint** ([#18864](https://github.com/AztecProtocol/aztec-packages/pull/18864))
   - `next_pc` not constrained at all for standard increment
   - Complete control flow corruption possible
   - Missing `pc == 0` initialization for enqueued calls

4. **Merkle Check Start Under-constraint** ([#17771](https://github.com/AztecProtocol/aztec-packages/pull/17771))
   - `start` boolean not enforcing `sel == 1`
   - Allowed bypassing most Merkle constraints

5. **Merkle Check Index Parity** ([#17771](https://github.com/AztecProtocol/aztec-packages/pull/17771))
   - `index_is_even` unconstrained on `end == 1` rows
   - Allowed swapping sibling and node positions

6. **TX Phase Value Not Initialized** ([#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336))
   - Missing initialization constraint
   - Could skip arbitrary phases

7. **TX Dispatch Lookups vs Permutations** ([#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336))
   - Used lookups instead of permutations for call request dispatch
   - Allowed inserting extra malicious call requests

8. **Selector Under-constraints** ([#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336))
   - `is_public_call_request` togglable without `sel == 1`
   - Same for `is_collect_fee` and `is_cleanup` selectors

### 2. Completeness Issues

**Definition**: Valid computations cannot produce valid proofs (honest prover fails).

**Examples Found**:

1. **Addressing Relative Overflow** ([#19001](https://github.com/AztecProtocol/aztec-packages/pull/19001))
   - `after_relative` not propagated to resolved operand on overflow

2. **Addressing Batched Tag Selector** ([#19001](https://github.com/AztecProtocol/aztec-packages/pull/19001))
   - Wrong selector used for accumulating batched diff tag sum

3. **Data Copy Bounds Off-by-One** ([#17877](https://github.com/AztecProtocol/aztec-packages/pull/17877))
   - Incorrect comparison with `AVM_HIGHEST_ADDRESS`

4. **Data Copy Zero Size Edge Case** ([#17877](https://github.com/AztecProtocol/aztec-packages/pull/17877))
   - `copy_size == 0 && data_offset > data_size` not handled

5. **ALU Lookup Gating** ([#18192](https://github.com/AztecProtocol/aztec-packages/pull/18192))
   - Source selectors for GT/range_check lookups not gated by `sel_err/sel_tag_err`
   - Destination events not emitted on errors

6. **TX L2-to-L1 Message Discard** ([#18606](https://github.com/AztecProtocol/aztec-packages/pull/18606))
   - `tx_should_l2_l1_msg_append` not considering `discard` flag

7. **TX First Padded Row** ([#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336))
   - `should_read_gas_limit` overwritten incorrectly in padded row handling

8. **Execution Tracegen Missing Column** ([#18864](https://github.com/AztecProtocol/aztec-packages/pull/18864))
   - `execution_batched_tags_diff_inv` column not set

9. **Sha256Compression Exception Type** ([#18864](https://github.com/AztecProtocol/aztec-packages/pull/18864))
   - Throwing wrong exception type (std::runtime_error vs Sha256CompressionException)

### 3. Control Flow Issues

1. **Data Copy Premature Truncation** ([#17877](https://github.com/AztecProtocol/aztec-packages/pull/17877))
   - Missing constraint to ensure padding continues until end
   - Missing propagation of context_id and clk

2. **Merkle Computation Truncation** ([#17771](https://github.com/AztecProtocol/aztec-packages/pull/17771))
   - Added `#[COMPUTATION_FINISH_AT_END]` to prevent early termination

3. **TX is_padded Not Implying end_phase** ([#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336))
   - Could extend tx trace indefinitely via underflow

---

## Detailed Findings by Component

### ALU Component

**Files**: `alu.pil`, `alu.hpp/cpp`, `alu_trace.hpp/cpp`

**Vulnerabilities Found**:

1. Missing boolean constraints for `sel_op_shl`, `sel_op_shr`, `sel_shift_ops_no_overflow`
2. Simultaneous `div_by_0` and `sel_tag_err` not supported
3. Output tag for NOT with non-field type unconstrained (toggled tag error instead)
4. SET/CAST dispatch used `sel_op_truncate` which didn't enforce `sel == 1`
5. Undefined behavior for bitwise shifts like `>> 128` over uint128_t

**Fixes Applied**:
- Added range check for MUL operations
- Gated source selectors by "no error" condition
- Fixed shift constraint underconstraints

### Data Copy Component

**Files**: `data_copy.pil`, `data_copy.hpp/cpp`, `data_copy_trace.hpp/cpp`

**Vulnerabilities Found**:

1. Bounds checking discrepancies between TS and C++ simulation
2. Missing padding continuation constraint
3. Missing context_id and clk propagation
4. Several missing boolean constraints
5. `sel_cd_copy/sel_rd_copy` unconstrained beyond first row
6. `sel_end` could be toggled prematurely

**Fixes Applied**:
- Added proper boundary validation
- Enhanced documentation
- Improved edge case handling

### Merkle Check Component

**Files**: `merkle_check.pil`, `merkle_check.hpp/cpp`, `merkle_check_trace.hpp/cpp`

**Vulnerabilities Found**:

1. `start` boolean not enforcing active row
2. `index_is_even` unconstrained on terminal rows
3. Missing trace continuity in `poseidon2_hash.pil`

**Fixes Applied**:
- Added `#[SELECTOR_ON_START_OR_END]` constraint
- Added `#[COMPUTATION_FINISH_AT_END]` constraint
- Improved constraint organization

### TX Component

**Files**: `tx.pil`, `tx_discard.pil`, `tx_context.pil`, `tx_events.hpp`, `tx_trace.hpp/cpp`

**Vulnerabilities Found**:

1. Phase value not initialized
2. Static attributes missing propagation constraints
3. Lookups used instead of permutations for call requests
4. Various selector underconstraints
5. `parent_calldata_addr` not constrained to zero for enqueued calls

**Fixes Applied**:
- Added initialization constraints
- Changed lookups to permutations
- Stricter selector enforcement
- L1-L2 tree size immutability enforcement

### Execution Component

**Files**: `execution.pil`, `addressing.pil`, `registers.pil`, `gas.pil`, `discard.pil`

**Vulnerabilities Found**:

1. `next_pc` completely unconstrained
2. `sel_bytecode_retrieval_failure` not constrained after first row
3. `sel_instruction_fetching_failure` unconstrained when no fetching happens
4. `sel_opcode_error` not constrained when no opcode execution
5. Dynamic gas factor not constrained for CALLDATACOPY/RETURNDATACOPY
6. `last_child_success` not constrained

**Fixes Applied**:
- Added PC initialization and increment constraints
- Gated all error selectors properly
- Constrained dynamic gas for copy operations

### Discard Component

**Files**: `discard.pil` (virtual to execution.pil)

**Key Design**:
- `discard` boolean: context or ancestor fails, side effects should be discarded
- `dying_context_id`: oldest ancestor that fails
- Constraint: `discard == 1 <=> dying_context_id != 0`

**Important Constraints**:
1. `#[DISCARD_IFF_DYING_CONTEXT]` - discard iff dying context exists
2. `#[DISCARD_IF_FAILURE]` - failure implies discard
3. `#[DYING_CONTEXT_PROPAGATION]` - propagation control
4. `#[DYING_CONTEXT_MUST_FAIL]` - cannot exit dying context without failure
5. `#[ENTER_CALL_DISCARD_MUST_BE_DYING_CONTEXT]` - discard raise must set dying context
6. `#[DYING_CONTEXT_WITH_PARENT_MUST_CLEAR_DISCARD]` - clear discard on resolution

**Regression Found**:
- "End enqueued call" lookup not passing discard field affected soundness

---

## Common Bug Patterns

### Pattern 1: Missing Boolean Constraints

**Problem**: Columns annotated as `@boolean` but missing `x * (1 - x) = 0` constraint.

**Impact**: Column can take any field value, breaking assumptions.

**Detection**: Search for `@boolean` annotations and verify corresponding constraint exists.

### Pattern 2: Selector Under-constraint Outside Active Rows

**Problem**: Selectors checked only on active rows (`sel == 1`) but can be toggled on inactive rows.

**Impact**: Malicious prover can activate features outside valid trace.

**Detection**: Check if selector constraints have proper gating.

**Fix Pattern**:
```pil
// Bad
selector_col * (1 - selector_col) = 0;

// Good
sel * selector_col * (1 - selector_col) = 0;
// Or ensure selector implies sel
selector_col * (1 - sel) = 0;
```

### Pattern 3: Missing Propagation Constraints

**Problem**: Values that should remain constant across rows aren't constrained.

**Impact**: Malicious prover can change values mid-computation.

**Detection**: Identify immutable values and verify propagation with latch conditions.

**Fix Pattern**:
```pil
pol LATCH_CONDITION = end + precomputed.first_row;
#[PROPAGATE_VALUE]
(1 - LATCH_CONDITION) * (value' - value) = 0;
```

### Pattern 4: Lookups vs Permutations

**Problem**: Using lookups where permutations are required (destinations with side effects).

**Impact**: Extra malicious operations can be inserted.

**Detection**: Check if destination trace has side effects (memory, state changes).

**Rule**: Use permutations for any interaction where destination has side effects.

### Pattern 5: Premature Computation Termination

**Problem**: Missing constraint to prevent early trace termination.

**Impact**: Malicious prover can truncate computation.

**Fix Pattern**:
```pil
#[COMPUTATION_FINISH_AT_END]
sel * (1 - sel') * (1 - end) = 0;
```

### Pattern 6: Missing Error Gating on Interactions

**Problem**: Lookup/permutation source selectors not gated by error conditions.

**Impact**: Completeness failure - destination events not emitted on error.

**Fix Pattern**:
```pil
// Gate source selector by no-error
pol SOURCE_SEL = base_sel * (1 - sel_err);
SOURCE_SEL { ... } in destination_sel { ... };
```

### Pattern 7: Zero-Check Recipe Violations

**Problem**: Incorrect implementation of the equality/non-equality check pattern.

**Correct Pattern**:
```pil
// e = 1 iff x = 0
pol commit e;
pol commit inv;
e * (1 - e) = 0;  // Boolean constraint
x * (e * (1 - inv) + inv) - 1 + e = 0;
```

### Pattern 8: Missing Initialization Constraints

**Problem**: Values not constrained at trace start.

**Impact**: Malicious prover can set arbitrary initial values.

**Fix Pattern**:
```pil
#[INIT_VALUE]
precomputed.first_row * value = 0;  // Or specific initial value
```

---

## Audit Methodology

### Per-Component Checklist

#### Simulation Tasks
| Task | Description |
|------|-------------|
| **DOCU_FUNCTIONS** | Document all functions with doxygen annotations |
| **EVENT_INIT** | Emitted events must not have uninitialized members |
| **EMIT_EXPLICIT_EVENT** | Avoid building events incrementally |
| **INTERACTION_EVENTS** | Verify source/destination events both emitted |
| **SANITY_SOURCE** | Code clarity, `override` keywords, specific exceptions |
| **CPP_HEADERS** | Check includes, remove redundant/missing |
| **UNIT_TEST** | Unit test coverage |

#### Tracegen Tasks
| Task | Description |
|------|-------------|
| **DOCU_FUNCTIONS** | Document event flavors and processing routines |
| **TYPE/RANGE** | Verify column values within correct ranges |
| **INTERACTION_SRC** | Source selector toggles correctly match event emission |
| **SANITY_SOURCE** | No column override, uniform naming |
| **CPP_HEADERS** | Check includes |
| **INTERACTIONS_DECL** | Verify interaction types (Sequential, etc.) |

#### Circuit Tasks
| Task | Description |
|------|-------------|
| **DOCU_MAIN** | Document trace shape, error handling, preconditions |
| **DOCU_INTERACTIONS** | Document lookup/permutation usages |
| **DOCU_INSIDE** | Comment non-trivial logic, underconstrained areas |
| **HEADERS_SANITY** | Check PIL imports |
| **TYPE/RANGE** | Verify range checks for each column |
| **COMMON_PATTERNS** | Boolean, zero-check, latch, continuity |
| **INTERACTIONS_USE** | Verify correct selectors and tuples |
| **COMPLETENESS** | Every relation is invariant of tracegen |
| **SKIPPABLE** | Verify skippable condition correct |
| **POSITIVE_TESTS** | Test coverage for main code paths |
| **NEGATIVE_TESTS** | Soundness tests |
| **SOUNDNESS** | Relations enforce expected behavior |

### Audit Process

1. **Read the PIL file** - Understand constraints and their purposes
2. **Check simulation code** - Verify event emission matches constraints
3. **Check tracegen code** - Verify trace generation satisfies constraints
4. **Verify interactions** - Check lookup/permutation declarations
5. **Look for common patterns** - Apply checklist items
6. **Write tests** - Both positive (completeness) and negative (soundness)
7. **Document findings** - Create security findings section

---

## PIL Constraint Recipes

See the full recipe document at: [vm-circuit-recipes.md](../../vm-circuit-recipes.md)

### Key Recipes

#### Boolean Validation
```pil
x * (1 - x) = 0;
```

#### Zero/Non-Zero Check with Error Support
```pil
// e = 1 iff x = 0
x * (e * (1 - inv) + inv) - 1 + e = 0;
```

#### Conditional Assignment
```pil
// z = x if q else y
(x - y) * q + y - z = 0;
```

#### Accumulator Pattern
```pil
// Right-to-left accumulation
acc - elem1 - elem2 - elem3 - acc' = 0;
```

#### Selector Dispatching
```pil
// Toggle relation based on selector
sel * P(x1, x2) = 0;
```

#### Range Check
```pil
// Use lookup into precomputed range table
sel { value } in precomputed.sel_range { precomputed.range_value };
```

#### Trace Continuity
```pil
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
```

---

## References

### GitHub PRs
- [ALU Pre-Audit #18192](https://github.com/AztecProtocol/aztec-packages/pull/18192)
- [Data Copy Pre-Audit #17877](https://github.com/AztecProtocol/aztec-packages/pull/17877)
- [Merkle Check Pre-Audit #17771](https://github.com/AztecProtocol/aztec-packages/pull/17771)
- [TX Pre-Audit Part 1 #18336](https://github.com/AztecProtocol/aztec-packages/pull/18336)
- [TX Pre-Audit Part 2 #18606](https://github.com/AztecProtocol/aztec-packages/pull/18606)
- [Execution Pre-Audit #18864](https://github.com/AztecProtocol/aztec-packages/pull/18864)
- [Addressing Pre-Audit #19001](https://github.com/AztecProtocol/aztec-packages/pull/19001)
- [Registers Pre-Audit #19027](https://github.com/AztecProtocol/aztec-packages/pull/19027)
- [Gas Pre-Audit #19077](https://github.com/AztecProtocol/aztec-packages/pull/19077)
- [Discard Pre-Audit #19149](https://github.com/AztecProtocol/aztec-packages/pull/19149)
- [External Call Pre-Audit #19155](https://github.com/AztecProtocol/aztec-packages/pull/19155)

### GitHub Issues
- [Permutation Selector Security #15115](https://github.com/AztecProtocol/aztec-packages/issues/15115)

### Documentation
- [Pre-Audit Scope Document](../../pre-audit-scope.md)
- [VM Circuit Recipes](../../vm-circuit-recipes.md)

### Code Locations
- PIL Files: `barretenberg/cpp/pil/vm2/`
- Simulation: `barretenberg/cpp/src/barretenberg/vm2/simulation/`
- Tracegen: `barretenberg/cpp/src/barretenberg/vm2/tracegen/`
- Constraining: `barretenberg/cpp/src/barretenberg/vm2/constraining/`
- Tests: `barretenberg/cpp/src/barretenberg/vm2/constraining/relations/*.test.cpp`
