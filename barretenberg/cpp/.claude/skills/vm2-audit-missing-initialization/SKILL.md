---
name: vm2-audit-missing-initialization
description: Audit VM2/AVM PIL files for missing initialization constraints. High severity soundness issue where values that should have specific initial states at the start of a computation or trace lack initialization constraints, allowing malicious provers to start execution with arbitrary PC, corrupted state, or bypassed setup phases.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Initialization Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing initialization constraints. Values that should have specific initial states at the start of a computation or trace lack initialization constraints, allowing a malicious prover to set arbitrary starting values.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Medium

## Why This is Critical

Missing initialization enables catastrophic attacks:
- **Start execution with arbitrary PC**: Skip code, jump to arbitrary addresses
- **Begin with corrupted state**: Fake initial balances, permissions, etc.
- **Bypass setup/validation phases**: Skip security checks performed at start

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Values That Need Initialization

Look for values that have meaningful initial states:

| Category | Examples | Expected Init |
|----------|----------|---------------|
| Program counters | `pc` | 0 for new calls |
| State accumulators | `gas_used`, `total_count` | 0 at start |
| Phase/stage indicators | `phase_value`, `state` | First phase |
| Counters and indices | `row_idx`, `counter` | 0 at start |
| Context identifiers | `context_id`, `call_depth` | Defined at entry |

```bash
# Find potential values needing initialization
grep -rn "pol commit pc\|pol commit.*counter\|pol commit.*phase\|pol commit.*idx\|pol commit.*accum" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Check for Initialization Constraints

For each value identified, search for initialization:

```bash
# Look for first_row initialization
grep -rn "first_row.*value\|precomputed.first_row" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for start-of-computation initialization
grep -rn "start.*value\|sel_start\|sel_enter\|sel_new" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Initialization Happens Before Use

Check that:
1. First row constraints fire before propagation/update constraints
2. Start-of-computation constraints gate value use
3. No path exists where value is used before initialization

```bash
# Look for update/propagation constraints (should come AFTER init)
grep -rn "value'.*-.*value\|value.*increment\|value.*update" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 4: Check Edge Cases

Consider:
- What if trace has only one row?
- What if computation starts on row 0?
- What about nested contexts (call within call)?
- What about the first row of a new phase/context?

### Step 5: Trace Value Through Lifecycle

For each critical value, verify the complete lifecycle:
1. **Initialization**: Constrained at start
2. **Propagation/update**: Properly constrained during computation
3. **Termination/reset**: Properly handled at end

## Common Initialization Patterns

### Pattern 1: First Row of Trace

```pil
#[VALUE_INIT]
precomputed.first_row * (value - INITIAL_VALUE) = 0;
```

### Pattern 2: Start of New Computation

```pil
#[VALUE_INIT_ON_START]
start * (value - INITIAL_VALUE) = 0;
```

### Pattern 3: First Row of New Context

```pil
#[VALUE_INIT_ON_CONTEXT]
sel_new_context * (value - INITIAL_VALUE) = 0;
```

### Pattern 4: Zero Initialization (Most Common)

```pil
#[VALUE_INIT_ZERO]
precomputed.first_row * value = 0;
```

### Pattern 5: Enqueued Call Initialization

```pil
#[PC_INIT_ENQUEUED]
sel_enter_enqueued_call * pc = 0;  // PC = 0 for top-level calls
```

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Value Used But Not Initialized

```pil
// VULNERABLE: Value used but not initialized
pol commit pc;
// Assumed to start at 0 for new calls
#[PC_INCREMENT]
sel * (1 - sel_jump) * (pc' - pc - instr_length) = 0;
// But what is pc on the first row? Unconstrained!
```

### Vulnerable Pattern: Initialization via Shifted Column Only

```pil
// VULNERABLE: Only constrained via next row
pol commit start_tx; // @boolean
// Constraint only on start_tx' means row 0 is unconstrained!
(1 - end) * (start_tx' - ...) = 0;
```

### Secure Pattern: Explicit Initialization

```pil
// SECURE: Explicit initialization
pol commit pc;

#[PC_INIT]
precomputed.first_row * pc = 0;  // PC starts at 0

// Or for context-specific initialization:
#[PC_INIT_ON_CALL]
sel_start_call * (pc - expected_pc) = 0;

#[PC_INCREMENT]
sel * (1 - sel_jump) * (pc' - pc - instr_length) = 0;
```

## Historical Examples

### Example 1: TX Phase Value (PR #18336)

```pil
// BEFORE: Phase value not initialized
pol commit phase_value;
// Could start at any phase, skipping earlier phases!

// AFTER: Explicit initialization
#[PHASE_VALUE_INIT]
precomputed.first_row * (phase_value - SETUP_PHASE) = 0;
```
**Impact**: Skip arbitrary transaction phases.

### Example 2: Execution PC (PR #18864)

```pil
// BEFORE: PC not constrained at start of enqueued call
pol commit pc;
// Could start execution at any address!

// AFTER: PC = 0 for enqueued calls
#[PC_INIT_ENQUEUED]
sel_enter_enqueued_call * pc = 0;
```
**Impact**: Complete control flow corruption.

### Example 3: start_tx Boolean (TX Pre-Audit)

```pil
// start_tx declared boolean but only constrained via shifted column
pol commit start_tx; // @boolean
// Row 0 has unconstrained start_tx!
// Mitigated because row 0 is inactive, but still a gap
```
**Impact**: Theoretical - row 0 behavior undefined.

## Test Patterns

### Test 1: Uninitialized PC

```cpp
TEST_F(ComponentTest, NegativeUninitializedPC)
{
    auto trace = TestTraceContainer({
        // Start call with non-zero PC (should be 0)
        {{ C::execution_sel, 1 },
         { C::sel_enter_enqueued_call, 1 },
         { C::pc, 100 }},  // INVALID: should be 0
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ExecutionRelation>(trace),
        "PC_INIT_ENQUEUED"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Initialization enforced - secure
- **Test fails (no throw)**: Arbitrary initial value allowed - vulnerable

### Test 2: Uninitialized Counter

```cpp
TEST_F(ComponentTest, NegativeUninitializedCounter)
{
    auto trace = TestTraceContainer({
        // First row with non-zero counter (should be 0)
        {{ C::sel, 1 },
         { C::precomputed_first_row, 1 },
         { C::counter, 999 }},  // INVALID: should be 0
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "COUNTER_INIT"
    );
}
```

### Test 3: Uninitialized Phase

```cpp
TEST_F(TxTest, NegativeSkippedPhase)
{
    auto trace = TestTraceContainer({
        // Start with phase 3 instead of phase 0
        {{ C::sel, 1 },
         { C::precomputed_first_row, 1 },
         { C::phase_value, 3 }},  // INVALID: should be SETUP_PHASE
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<TxRelation>(trace),
        "PHASE_VALUE_INIT"
    );
}
```

## Audit Checklist

1. **Identify values that need initialization**:
   - [ ] Program counters (`pc`)
   - [ ] State accumulators (`gas_used`, `total_*`)
   - [ ] Phase/stage indicators (`phase_value`, `state`)
   - [ ] Counters and indices (`row_idx`, `counter`, `cnt`)
   - [ ] Context identifiers (`context_id`, `call_depth`)

2. **For each value, check for initialization constraint**:
   - [ ] `precomputed.first_row * (value - INIT) = 0` for trace-level
   - [ ] `start * (value - INIT) = 0` for computation-level
   - [ ] `sel_new_context * (value - INIT) = 0` for context-level

3. **Verify initialization happens before use**:
   - [ ] First row constraints fire before propagation
   - [ ] Start-of-computation constraints gate value use

4. **Check edge cases**:
   - [ ] What if trace has only one row?
   - [ ] What if computation starts on row 0?
   - [ ] What about nested contexts?

5. **Trace value through lifecycle**:
   - [ ] Initialization
   - [ ] Propagation/update
   - [ ] Termination/reset

## Fix Pattern

```pil
// Add initialization constraint
pol commit value;

// Option 1: Initialize on first row
#[VALUE_INIT]
precomputed.first_row * (value - INITIAL_VALUE) = 0;

// Option 2: Initialize on computation start
#[VALUE_INIT_ON_START]
start_computation * (value - INITIAL_VALUE) = 0;
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

Values requiring initialization typically appear in:
- **Execution**: `execution.pil` - PC, call depth, gas
- **Transaction**: `tx.pil` - phase values, accumulators
- **Memory**: `memory.pil` - address counters
- **Hashing**: `poseidon2.pil`, `keccak*.pil` - state accumulators
- **Data operations**: `data_copy.pil` - indices, counters

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/06-missing-initialization.md)
- [Missing Propagation Skill](../vm2-audit-missing-propagation/SKILL.md)
- [Premature Termination](../../../pil/vm2/claude-skills/07-premature-termination.md)

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | vm2-audit-missing-initialization |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-missing-initialization-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "vm2-audit-missing-initialization",
  "finding_prefix": "vm2-audit-missing-initialization",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-missing-initialization-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `vm2-audit-missing-initialization-[filename]-[line]-[subtype]`
- Example: `vm2-audit-missing-initialization-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
