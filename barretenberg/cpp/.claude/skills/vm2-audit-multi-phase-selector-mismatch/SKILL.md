---
name: vm2-audit-multi-phase-selector-mismatch
description: Audit VM2/AVM PIL files for multi-phase selector mismatches. Soundness/completeness issue where lookups or constraints use a selector from the wrong execution phase (e.g., perform_round vs last), causing checks to fire on wrong rows or miss required rows entirely.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Multi-Phase Selector Mismatch Audit

## Purpose
Detect selector mismatches in multi-row computations where using the wrong phase selector causes lookups/constraints to fire on wrong rows.

## The Problem

Multi-row gadgets (SHA256, Poseidon2, bytecode hashing) have phases:
- **Start**: First row, initialization
- **Rounds/Middle**: Repeated computation rows
- **Last/Latch**: Final row, output finalization

Using the wrong selector causes:
- **Soundness**: Required checks never fire (selector never active on needed row)
- **Completeness**: Multiplicity imbalance (source/dest row counts differ)

```pil
// BUG: Range check uses perform_round (64 rows) instead of last (1 row)
#[RANGE_COMP_A_LHS]
perform_round { two_pow_32, output_a_lhs, perform_round }  // WRONG - fires 64x
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };

// FIX: Use last for final output checks
last { two_pow_32, output_a_lhs, last }  // CORRECT - fires 1x
in gt.sel_sha256 { gt.input_a, gt.input_b, gt.res };
```

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via valid inputs, Low if theoretical

## Workflow

### Step 1: Identify Multi-Phase Components

```bash
grep -rln "perform_round\|latch\|start\|first\|last\|NUM_ROUNDS" \
    barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Common patterns: `start`/`last`/`latch`, `perform_round`/`LATCH_CONDITION`, `first_row`/`last_row`

### Step 2: Map Selectors to Phases

| Selector | Phase | Active Rows |
|----------|-------|-------------|
| `start` | Initialization | Row 0 |
| `perform_round` | Computation | Rows 0 to N-1 |
| `last`/`latch` | Finalization | Row N |

```bash
grep -n "pol.*start\|pol.*last\|pol.*latch\|pol.*perform" \
    barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 3: Check Each Lookup/Permutation

```bash
grep -nP '}\s*(in|is)\b' barretenberg/cpp/pil/vm2/<component>.pil
```

For each interaction verify:
1. What data is validated? (input, intermediate, output)
2. Which phase produces this data?
3. Does the selector match that phase?

### Step 4: Verify Constraint Phases

```bash
grep -n "perform_round\|last\|latch\|start" barretenberg/cpp/pil/vm2/<component>.pil | grep -v "pol"
```

- Output finalization: use `last`/`latch`
- Round computation: use `perform_round`
- Initialization: use `start`

## Vulnerable Patterns

```pil
// VULNERABLE: Output range check uses round selector (fires N times, output valid once)
perform_round { output_value } in range_check.sel { ... };

// VULNERABLE: Final addition uses round phase instead of latch
perform_round * (OUT_A - (output_a_lhs * 2**32 + output_a_rhs)) = 0;

// SECURE: Correct phase selectors
last * (OUT_A - (output_a_lhs * 2**32 + output_a_rhs)) = 0;
last { output_value } in range_check.sel { ... };
```

## Real Bug: SHA256 Output Range Checks (PR #19262)

Output modulo addition checks used `perform_round` instead of `last`:
- **Impact**: Final output range checks never performed; lookup multiplicity mismatch caused verification failure
- **Discovery**: Fuzzer found edge case where all 64 rounds overflowed, exposing multiplicity bug

## Key Files

- `pil/vm2/sha256.pil` - SHA256 compression (64 rounds + finalization)
- `pil/vm2/poseidon2*.pil` - Poseidon2 permutation
- `pil/vm2/bytecode/bc_hashing.pil` - Bytecode hashing

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-multi-phase-selector-mismatch` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format

- **ID**: `vm2-audit-multi-phase-selector-mismatch-filename-123-issue-type`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (Required)

Write `vm2-audit-multi-phase-selector-mismatch.json` to the output directory:

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
