---
name: vm2-audit-t2-missing-propagation
description: Audit VM2/AVM PIL files for missing propagation constraints. High severity soundness issue where values that should remain constant across multiple rows of a multi-row computation lack propagation constraints, allowing malicious provers to change context_id, clock, or operation parameters mid-computation.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Missing Propagation Audit

## Purpose
Detect missing propagation constraints where values constant across multi-row computations can be changed mid-operation (context_id, clock, operation parameters).

## When to Use
- Auditing PIL files with multi-row computations (start/end patterns, row counters)
- Reviewing operations that span multiple rows (copy, merkle, hash, etc.)
- Checking values that should remain constant within an operation

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every column that should remain constant across multi-row computation but lacks a propagation constraint is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Propagation constraint exists**: `sel * (1 - end) * (col' - col) = 0` or equivalent (quote with file:line).
  - (b) **Value re-derived each row**: The column is computed from other propagated values each row (quote the derivation).
  - (c) **Column changes intentionally**: The design requires the value to change row-by-row (explain with quoted evidence).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## When NOT to Use
- Single-row operations (no propagation needed)
- Values that legitimately change each row

## Severity Assessment

- **Soundness** (malicious prover exploits): Typically Critical/High
- **Completeness** (honest prover fails): Critical if reachable via canonical tracegen on valid inputs
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## The Propagation Pattern

```pil
pol LATCH_CONDITION = end + start' + precomputed.first_row;
// LATCH fires when: end of computation, next row starts new, or first row

#[PROPAGATE_VALUE]
(1 - LATCH_CONDITION) * (value' - value) = 0;
// LATCH=0: propagate | LATCH=1: new computation
```

## Workflow

### Step 0: Enumerate ALL Multi-Row Components (MANDATORY)

> **CRITICAL**: Before deep-diving any single file, enumerate ALL PIL files with multi-row computation patterns.

```bash
# Find all files with start/end/latch patterns (multi-row indicators)
grep -rl "start\|end\|latch\|is_first\|is_last\|NOT_END" pil/vm2/ --include="*.pil" | sort

# Count multi-row indicators per file
for f in $(grep -rl "start\|end\|latch" pil/vm2/ --include="*.pil"); do
  echo "=== $f ==="; grep -c "start\|end\|latch\|propagat" "$f"
done
```

Build a master checklist of ALL files with multi-row computations. You MUST check every multi-row component for missing propagation.

### Step 1: Identify Multi-Row Computations

```bash
# Start/end patterns
grep -rn "pol commit start\|pol commit end\|latch" pil/vm2/ --include="*.pil"

# Row counters/indices
grep -rn "row_idx\|counter\|cnt\|idx\|phase" pil/vm2/ --include="*.pil"

# Multi-row indicators
grep -rn "is_first\|is_last\|NOT_END\|NOT_LAST" pil/vm2/ --include="*.pil"
```

### Step 2: List Values That Should Be Constant

| Category | Examples |
|----------|----------|
| Context | `context_id`, `call_id`, `space_id` |
| Clock/sequence | `clk`, `timestamp` |
| Operation params | `opcode`, `dst_offset`, `src_offset` |
| Size/address | `size`, `length`, `base_addr` |

### Step 3: Verify Initialization + Propagation

For each constant value, check:

1. **Initialization on start**:
   ```pil
   start * (value - expected_value) = 0;
   ```

2. **Propagation constraint**:
   ```pil
   (1 - LATCH) * (value' - value) = 0;
   ```

3. **Latch completeness** (most complete form):
   ```pil
   pol LATCH = end + start' + precomputed.first_row;
   ```
   - Does it handle first row? (`precomputed.first_row`)
   - Does it handle consecutive ops? (`start'`)
   - Does it handle last row?

### Step 4: Check for False Positives (Propagate-Until-Reset)

**CRITICAL**: Conditional propagation gaps are NOT always vulnerable.

```pil
// POTENTIALLY VULNERABLE: Gap in propagation
(1 - is_teardown') * (gas_limit' - gas_limit) = 0;
```

**Before flagging**, verify BOTH paths constrain the value:
1. When `selector' = 0`: value' propagated from previous
2. When `selector' = 1`: value' constrained by lookup/init (e.g., public inputs)

If both paths constrain, this is SAFE (propagate-until-reset pattern).

### Step 5: Cross-Reference Tracegen

```bash
grep -rn "context_id\|propagat" src/barretenberg/vm2/tracegen/<component>*.cpp
```

## Vulnerability Patterns

### VULNERABLE: Not Propagated
```pil
pol commit context_id;
start * (context_id - expected) = 0;
// Missing: (1 - LATCH) * (context_id' - context_id) = 0
```

### VULNERABLE: Incomplete Latch
```pil
pol LATCH = end;  // Missing: + precomputed.first_row
(1 - LATCH) * (value' - value) = 0;
```

### SAFE: Propagate-Until-Reset
```pil
// Propagation disabled before teardown
NOT_LAST_ROW * (1 - is_teardown') * (l2_gas_limit - l2_gas_limit') = 0;

// BUT: On teardown, value re-constrained from public inputs
should_read_gas_limit { gas_limit } in public_inputs.sel { ... };
```

### SECURE: Complete
```pil
pol commit context_id;
pol LATCH = end + start' + precomputed.first_row;
start * (context_id - expected) = 0;
(1 - LATCH) * (context_id' - context_id) = 0;
```

## Abstract Bug Patterns

**Missing propagation of inherited attribute**: Static attributes associated with a computation phase not propagated across rows -- could change resource limits mid-phase.

**Missing propagation of identity columns in multi-row copy**: Identity and sequencing columns not propagated during a multi-row data transfer -- could change context mid-operation.

## REQUIRED OUTPUT FORMAT

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-missing-propagation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Finding Format

- **ID**: `vm2-audit-t2-missing-propagation`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-t2-missing-propagation.json` to the specified output directory:

```json
{
  "skill": "vm2-audit-t2-missing-propagation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-missing-propagation-filename-123-issue-type",
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
