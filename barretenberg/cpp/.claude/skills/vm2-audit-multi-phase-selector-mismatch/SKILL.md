---
name: vm2-audit-multi-phase-selector-mismatch
description: Audit VM2/AVM PIL files for multi-phase selector mismatches. Soundness/completeness issue where lookups or constraints use a selector from the wrong execution phase (e.g., perform_round vs last), causing checks to fire on wrong rows or miss required rows entirely.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Multi-Phase Selector Mismatch Audit

Audits for selector mismatches in multi-row computations. When a computation has distinct phases (start, rounds, last), using the wrong phase selector causes lookups/constraints to fire on wrong rows.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## The Problem

Multi-row gadgets (SHA256, Poseidon2, bytecode hashing) have phases:
- **Start**: First row, initialization
- **Rounds/Middle**: Repeated computation rows
- **Last/Latch**: Final row, output finalization

Using the wrong selector causes:
- **Soundness**: Required checks never fire (selector never active on needed row)
- **Completeness**: Multiplicity imbalance (source/dest row counts differ)

```pil
// BUG: Range checks for FINAL outputs use perform_round (64 rows)
//      instead of last (1 row)
#[RANGE_COMP_A_LHS]
perform_round { two_pow_32, output_a_lhs, perform_round }  // WRONG
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };

// FIX: Use last for final output checks
#[RANGE_COMP_A_LHS]
last { two_pow_32, output_a_lhs, last }  // CORRECT
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };
```

## Instructions

### Step 1: Identify Multi-Phase Components

```bash
# Find components with phase selectors
grep -rln "perform_round\|latch\|start\|first\|last\|NUM_ROUNDS" \
    barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Common patterns:
- `start` / `last` / `latch` (bytecode hashing, SHA256)
- `perform_round` / `LATCH_CONDITION` (SHA256)
- `first_row` / `last_row` (general multi-row)

### Step 2: Map Selectors to Phases

For each multi-phase component, identify:

| Selector | Phase | Active Rows |
|----------|-------|-------------|
| `start` | Initialization | Row 0 of operation |
| `perform_round` | Computation | Rows 0 to N-1 |
| `last` / `latch` | Finalization | Row N (final row) |

```bash
# Find selector definitions
grep -n "pol.*start\|pol.*last\|pol.*latch\|pol.*perform" \
    barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 3: Check Each Lookup/Permutation

For each interaction, verify the source selector matches the semantic phase:

```bash
# Find all interactions
grep -nP '}\s*(in|is)\b' barretenberg/cpp/pil/vm2/<component>.pil
```

For each interaction ask:
1. What data is being validated? (input, intermediate, output)
2. Which phase produces this data?
3. Does the selector match that phase?

### Step 4: Verify Constraint Phases

```bash
# Find phase-gated constraints
grep -n "perform_round\|last\|latch\|start" barretenberg/cpp/pil/vm2/<component>.pil | grep -v "pol"
```

Check each constraint:
- Output finalization constraints should use `last`/`latch`
- Round computation constraints should use `perform_round`
- Initialization should use `start`

## Patterns

### Vulnerable: Wrong Phase for Output Validation

```pil
// VULNERABLE: Output range check uses round selector (fires 64 times)
// But output is only valid on last row!
#[OUTPUT_RANGE_CHECK]
perform_round { output_value } in range_check.sel { ... };
```

### Vulnerable: Round Selector for Finalization

```pil
// VULNERABLE: Uses round phase for final addition
// Final output = round_output + initial_input (only valid at latch)
perform_round * (OUT_A - (output_a_lhs * 2**32 + output_a_rhs)) = 0;
```

### Secure: Correct Phase Selector

```pil
// SECURE: Use last for final output constraints
last * (OUT_A - (output_a_lhs * 2**32 + output_a_rhs)) = 0;

#[OUTPUT_RANGE_CHECK]
last { output_value } in range_check.sel { ... };
```

## Examples

### Example 1: SHA256 Output Range Checks (PR #19262)

```pil
// BEFORE (BUG): perform_round fires on 64 rows
// Output modulo addition checks used perform_round instead of last
#[RANGE_COMP_A_LHS]
perform_round { two_pow_32, output_a_lhs, perform_round }
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };

// AFTER (FIX): last fires only on final row
#[RANGE_COMP_A_LHS]
last { two_pow_32, output_a_lhs, last }
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };
```

**Impact**:
- Soundness: Final output range checks never performed (last != perform_round)
- Completeness: Lookup multiplicity mismatch caused verification failure

**Discovery**: Fuzzer found edge case where ALL 64 rounds overflowed, creating no `0 < 2**32` entry in GT trace, exposing the multiplicity bug.

## Key Files

- `pil/vm2/sha256.pil` - SHA256 compression (64 rounds + finalization)
- `pil/vm2/poseidon2*.pil` - Poseidon2 permutation
- `pil/vm2/bytecode/bc_hashing.pil` - Bytecode hashing

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-multi-phase-selector-mismatch` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-multi-phase-selector-mismatch-filename-123-issue-type` (MUST use full skill name: `vm2-audit-multi-phase-selector-mismatch`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-multi-phase-selector-mismatch.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-multi-phase-selector-mismatch",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-multi-phase-selector-mismatch-filename-123-issue-type",
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
  "skill": "vm2-audit-multi-phase-selector-mismatch",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.
