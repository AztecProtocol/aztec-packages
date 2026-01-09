---
name: vm2-audit-missing-initialization
description: Audit VM2/AVM PIL files for missing initialization constraints. High severity soundness issue where values that should have specific initial states at the start of a computation or trace lack initialization constraints, allowing malicious provers to start execution with arbitrary PC, corrupted state, or bypassed setup phases.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Initialization Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for missing initialization constraints. Values that should have specific initial states at the start of a computation or trace lack initialization constraints, allowing a malicious prover to set arbitrary starting values.

## Why This is Important

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
#[PC_INCREMENT]
sel * (1 - sel_jump) * (pc' - pc - instr_length) = 0;
```

### Vulnerable Pattern: Initialization via Shifted Column Only

```pil
// VULNERABLE: Only constrained via next row
pol commit start_tx; // @boolean
(1 - end) * (start_tx' - ...) = 0;
```

### Secure Pattern: Explicit Initialization

```pil
// SECURE: Explicit initialization
pol commit pc;
#[PC_INIT]
precomputed.first_row * pc = 0;  // PC starts at 0
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

---

## REQUIRED OUTPUT FORMAT

**IMPORTANT**: Your response MUST end with this machine-readable section.

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

For each finding, include:
- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

You MUST include this exact format at the end of your response:

<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
      "severity": "critical",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "high",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->

For no findings, use:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
