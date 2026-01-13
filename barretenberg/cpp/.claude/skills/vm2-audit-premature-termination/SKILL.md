---
name: vm2-audit-premature-termination
description: Audit VM2/AVM PIL files for premature computation termination vulnerabilities. High severity soundness issue where multi-row computations can be terminated before completion due to missing trace continuity constraints, allowing provers to skip computation steps, truncate Merkle proofs, end copy operations early, or skip validation steps.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Premature Termination Audit

## Purpose
Detect missing trace continuity constraints that allow multi-row computations to exit early, enabling skipped hash steps, truncated Merkle proofs, partial copies, and bypassed validation.

## When to Use
- Auditing PIL files with multi-row computations (loops, Merkle proofs, copy operations)
- Reviewing start/end/counter patterns in PIL constraints
- Security review of computation continuation logic

## Severity Assessment
- **Soundness** (malicious prover exploits): Critical/High
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation

## Core Pattern

The trace continuity constraint prevents premature termination:

```pil
#[TRACE_CONTINUITY]
sel * (1 - sel') * (1 - end) = 0;
// Meaning: If sel=1 and sel'=0, then end=1 (proper termination required)
```

## Workflow

### Step 1: Identify Multi-Row Computations

```bash
# Start/end patterns
grep -rn "pol commit start\|pol commit end\|pol commit sel_end" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Counters
grep -rn "remaining\|counter\|cnt\|idx\|row_idx" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Continuation patterns
grep -rn "latch\|NOT_END\|continue\|continuity" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

**Note**: Also manually review each PIL file - grep may miss patterns.

### Step 2: Verify Trace Continuity Exists

```bash
grep -rn "sel.*1 - sel'.*1 - end\|CONTINUITY\|FINISH_AT_END\|MUST_END" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Check End Condition Constraints

Verify bidirectional constraints on `end`:
```pil
// end => done
end * remaining_count = 0;
// done => end (often missing!)
(1 - end) * is_done_indicator = 0;
```

### Step 4: Check Counter Underflow

```bash
grep -rn "remaining'.*remaining - 1\|counter'.*counter - 1" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Verify counters can't wrap in field arithmetic.

### Step 5: Verify Error Path Termination

```bash
grep -rn "err.*end\|error.*end\|END_ON_ERR" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

Error paths must still require `end=1` before `sel'=0`.

## Vulnerable Patterns

### No Continuation Enforcement
```pil
// VULNERABLE: sel can drop to 0 anytime
pol commit sel;
pol commit end;
// Missing: sel * (1 - sel') * (1 - end) = 0
```

### One-Way End Condition
```pil
// VULNERABLE: end can be set prematurely
end * remaining_count = 0;  // Only checks end => done
// Missing: done => end
```

### Missing Start Gating on Error
```pil
// VULNERABLE: Error triggers end on any row
err * (1 - sel_end) = 0;  // Missing sel_start!

// SECURE:
sel_start * err * (1 - sel_end) = 0;
```

## Real Bug Examples

### Data Copy (PR #17877)
```pil
// Missing: sel * (1 - sel') * (1 - sel_end) = 0
```
**Impact**: Truncated copy operations.

### Merkle Check (PR #17771)
```pil
// Added: sel * (1 - sel') * (1 - end) = 0
```
**Impact**: Truncated Merkle proofs.

### TX is_padded (PR #18336)
```pil
// Added: is_padded * (1 - end_phase) = 0
```
**Impact**: Infinite trace extension via counter underflow.

### Data Copy sel_end (PR #17877)
```pil
// BEFORE: err * (1 - sel_end) = 0  // Missing sel_start!
// AFTER: sel_start * err * (1 - sel_end) = 0
```
**Impact**: Premature end on non-start rows.

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-premature-termination` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-premature-termination-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (required)

Write `vm2-audit-premature-termination.json` to the specified output directory:

```json
{
  "skill": "vm2-audit-premature-termination",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-premature-termination-filename-123-issue-type",
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
