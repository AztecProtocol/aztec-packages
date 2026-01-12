---
name: vm2-audit-missing-propagation
description: Audit VM2/AVM PIL files for missing propagation constraints. High severity soundness issue where values that should remain constant across multiple rows of a multi-row computation lack propagation constraints, allowing malicious provers to change context_id, clock, or operation parameters mid-computation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Missing Propagation Audit

Audits for missing propagation constraints - values constant across multi-row computations can be changed mid-operation (context_id, clock, operation parameters).

## The Propagation Pattern

The standard pattern for immutable values in multi-row computations:

```pil
pol LATCH_CONDITION = end + start' + precomputed.first_row;
// LATCH fires when:
//   - Current row is end of computation
//   - Next row starts new computation
//   - First row of trace

#[PROPAGATE_VALUE]
(1 - LATCH_CONDITION) * (value' - value) = 0;
// When LATCH = 0: value' must equal value (propagate)
// When LATCH = 1: value' can be anything (new computation)
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify Multi-Row Computations

```bash
# Look for start/end patterns
grep -rn "pol commit start\|pol commit end\|start.*end\|latch" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for row counters or indices
grep -rn "row_idx\|counter\|cnt\|idx\|phase" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for multi-row indicators
grep -rn "is_first\|is_last\|NOT_END\|NOT_LAST" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: List Values That Should Be Constant

For each multi-row computation, identify values that should remain constant:

| Category | Examples |
|----------|----------|
| Context identifiers | `context_id`, `call_id`, `space_id` |
| Clock/sequence | `clk`, `timestamp`, `sequence_number` |
| Operation parameters | `opcode`, `dst_offset`, `src_offset` |
| Size/length values | `size`, `length`, `num_bytes` |
| Addresses | `base_addr`, `target_addr` |

```bash
# Find potential constant values
grep -rn "pol commit context\|pol commit clk\|pol commit.*_id\|pol commit.*size\|pol commit.*addr" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Verify Initialization Constraints

For each constant value, verify there's an initialization on start:

```bash
# Look for initialization patterns
grep -rn "start.*value\|start.*(.*-" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[VALUE_INIT]
start * (value - expected_value) = 0;
```

### Step 4: Verify Propagation Constraints

For each constant value, verify there's a propagation constraint:

```bash
# Look for propagation patterns
grep -rn "value'.*-.*value\|value.*-.*value'" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Look for latch-gated propagation
grep -rn "LATCH\|NOT_END\|1 - end" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Expected pattern:
```pil
#[VALUE_PROPAGATE]
(1 - LATCH) * (value' - value) = 0;
```

### Step 5: Check Latch Condition Completeness

Verify the latch condition handles all boundary cases:

```pil
// Common latch conditions (from simplest to most complete)
pol LATCH = end;                                    // Simple
pol LATCH = end + precomputed.first_row;            // Handles row 0
pol LATCH = end + start';                           // Handles consecutive ops
pol LATCH = end + start' + precomputed.first_row;   // Most complete
```

Check for:
- Does it handle the first row of the trace?
- Does it handle consecutive operations (end followed by start)?
- Does it handle the last row of the trace?

### Step 6: Watch for Propagation Gaps (Check for False Positives)

Special conditions can create gaps where propagation breaks:

```bash
# Look for conditional propagation that might have gaps
grep -rn "is_.*\*.*propagate\|phase.*\*.*propagate" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Example gap:
```pil
// POTENTIALLY VULNERABLE: Gap before special phase
(1 - is_special_phase') * (value' - value) = 0;
```

**BEFORE flagging as a vulnerability**, check for the "propagate-until-reset" pattern:

1. **Check if the value is re-constrained when the selector fires**:
   - Look for lookups/permutations gated by the selector that constrain the value
   - Look for initialization constraints that fire when the selector is active

2. **Verify complete constraint coverage**:
   - If `selector' = 0`: value' must equal value (propagation)
   - If `selector' = 1`: value' must be constrained by another source (e.g., public inputs)

3. **If both paths constrain the value**: This is NOT a vulnerability - mark as false positive

### Step 7: Cross-Reference with Tracegen

Verify tracegen sets values correctly:

```bash
# Find tracegen for the component
grep -rn "context_id\|propagat" barretenberg/cpp/src/barretenberg/vm2/tracegen/<component>*.cpp
```

## Patterns

### Vulnerable Pattern: Value Set Once, Not Propagated

```pil
// VULNERABLE: Value set once, not propagated
pol commit context_id;
start * (context_id - expected_context_id) = 0;
```

### Vulnerable Pattern: Incomplete Latch

```pil
// VULNERABLE: Latch doesn't handle first row
pol LATCH = end;  // Missing: + precomputed.first_row
(1 - LATCH) * (value' - value) = 0;
```

### Vulnerable Pattern: Conditional Gap (Requires Analysis)

```pil
// POTENTIALLY VULNERABLE: Gap in propagation
(1 - is_teardown') * (gas_limit' - gas_limit) = 0;
```

**IMPORTANT**: This pattern is NOT always a vulnerability. Before flagging, check for the "propagate-until-reset" pattern (see below).

### Safe Pattern: Propagate-Until-Reset

When propagation is intentionally disabled at a state boundary because the value is freshly constrained from another source, this is safe:

```pil
// SAFE: Propagation disabled before teardown, but value is re-read from public inputs
#[PROPAGATE_L2_GAS_LIMIT]
NOT_LAST_ROW * (1 - is_teardown') * (l2_gas_limit - l2_gas_limit') = 0;

// On teardown row, gas_limit is constrained by public inputs lookup
#[PUBLIC_INPUTS_READ_GAS_LIMIT]
should_read_gas_limit {  // should_read_gas_limit = start_tx + is_teardown
    gas_limit_pi_offset,
    da_gas_limit,
    l2_gas_limit
} in public_inputs.sel { ... };
```

**How to verify this is safe**:
1. The pre-gap value IS constrained - propagated from initialization (e.g., `start_tx`)
2. The post-gap value IS constrained - by a counterpart constraint when the selector fires
3. Both paths constrain the value, so there is no exploitable gap

### Secure Pattern: Complete Propagation

```pil
// SECURE: Propagation with complete latch condition
pol commit context_id;
pol LATCH_CONDITION = end + start' + precomputed.first_row;
#[CONTEXT_ID_INIT]
start * (context_id - expected_context_id) = 0;
#[CONTEXT_ID_PROPAGATE]
(1 - LATCH_CONDITION) * (context_id' - context_id) = 0;
```

## Examples

### Example 1: TX Phase Attributes (PR #18336)

```pil
// BEFORE: Phase static attributes not propagated
pol commit phase_gas_limit;
// Set on phase start, but could change mid-phase!

// AFTER: Proper propagation
pol PHASE_LATCH = end_phase + precomputed.first_row;
#[PHASE_GAS_LIMIT_PROPAGATE]
(1 - PHASE_LATCH) * (phase_gas_limit' - phase_gas_limit) = 0;
```
**Impact**: Could change gas limits mid-phase.

### Example 2: Data Copy (PR #17877)

```pil
// Missing propagation of context_id
pol commit context_id;
// Only set on start row, not propagated

// Missing propagation of clk
pol commit clk;
// Only set on start row, not propagated
```
**Impact**: Could change context or timing mid-copy.

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `{skill-name}.json` file to the output directory with:

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

For no findings:
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.