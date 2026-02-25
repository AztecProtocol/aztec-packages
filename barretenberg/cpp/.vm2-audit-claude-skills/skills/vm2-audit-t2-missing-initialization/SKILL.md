---
name: vm2-audit-t2-missing-initialization
description: Audit VM2/AVM PIL files for missing initialization constraints. High severity soundness issue where values that should have specific initial states at the start of a computation or trace lack initialization constraints, allowing malicious provers to start execution with arbitrary PC, corrupted state, or bypassed setup phases.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# VM2 Missing Initialization Audit

Audits for missing initialization constraints. Allows arbitrary starting values: execution at any PC, fake initial state, bypassed setup phases.

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (theoretical) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report issues.

**RULE 1 — Report first, dismiss later.** Every state column that lacks an explicit initialization constraint on its first active row is a PRELIMINARY FINDING.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss if:
  - (a) **Initialized via interaction**: The column receives its initial value from a lookup/permutation (quote the interaction with file:line).
  - (b) **First-row constraint exists**: A constraint explicitly sets the value on the start/first row (quote with file:line).
  - (c) **Column is precomputed**: It's a `pol constant` (quote the declaration).

**RULE 3 — Quote or report.** For ANY dismissal, quote exact evidence.

**RULE 4 — Severity floor.** When in doubt, report as **High**.

## Workflow

### Step 0: Enumerate ALL PIL Files With State Columns (MANDATORY)

> **CRITICAL**: Before deep-diving any file, enumerate ALL PIL files that have columns needing initialization.

```bash
# Find all PIL files with state columns (counters, PCs, phase indicators, accumulators)
grep -rl "pol commit.*counter\|pol commit.*pc\|pol commit.*phase\|pol commit.*idx\|pol commit.*accum\|pol commit.*gas\|pol commit.*context" pil/vm2/ --include="*.pil" | sort

# Also find files with first-row or start constraints (to see what's already initialized)
grep -rl "first_row\|sel_start\|sel_enter" pil/vm2/ --include="*.pil" | sort
```

Build a master checklist of ALL files with state columns. You MUST check every file for missing initialization.

### Step 1: Identify Values Needing Initialization

| Category | Examples | Expected Init |
|----------|----------|---------------|
| Program counters | `pc` | 0 for new calls |
| State accumulators | `gas_used`, `total_count` | 0 at start |
| Phase indicators | `phase_value`, `state` | First phase |
| Counters/indices | `row_idx`, `counter` | 0 at start |
| Context identifiers | `context_id`, `call_depth` | Defined at entry |

```bash
grep -rn "pol commit pc\|pol commit.*counter\|pol commit.*phase\|pol commit.*idx\|pol commit.*accum" pil/vm2/ --include="*.pil"
```

### Step 2: Check for Initialization Constraints

```bash
# First row initialization
grep -rn "first_row.*value\|precomputed.first_row" pil/vm2/ --include="*.pil"

# Start-of-computation initialization
grep -rn "sel_start\|sel_enter\|sel_new" pil/vm2/ --include="*.pil"
```

### Step 3: Verify Initialization Before Use

1. First row constraints fire before propagation/update constraints
2. Start-of-computation constraints gate value use
3. No path where value used before initialization

### Step 4: Check Edge Cases

- Trace with only one row
- Computation starting on row 0
- Nested contexts (call within call)
- First row of new phase/context

### Step 5: Trace Value Lifecycle

1. **Init**: Constrained at start
2. **Update**: Properly constrained during computation
3. **Reset**: Properly handled at end/context switch

## Vulnerable vs Secure Patterns

### VULNERABLE: Value Used But Not Initialized
```pil
pol commit pc;
#[PC_INCREMENT]
sel * (1 - sel_jump) * (pc' - pc - instr_length) = 0;
// pc can start at ANY value!
```

### VULNERABLE: Initialization via Shifted Column Only
```pil
pol commit start_tx; // @boolean
(1 - end) * (start_tx' - ...) = 0;
// Row 0 unconstrained - only next-row relation exists
```

### SECURE: Explicit Initialization
```pil
pol commit pc;
#[PC_INIT]
precomputed.first_row * pc = 0;  // First row of trace
#[PC_INIT_ON_CALL]
sel_start_call * (pc - expected_pc) = 0;  // New context
#[PC_INCREMENT]
sel * (1 - sel_jump) * (pc' - pc - instr_length) = 0;
```

## Initialization Pattern Reference

| Pattern | Constraint |
|---------|------------|
| First row of trace | `precomputed.first_row * (value - INIT) = 0` |
| Start of computation | `start * (value - INIT) = 0` |
| New context | `sel_new_context * (value - INIT) = 0` |
| Zero init | `precomputed.first_row * value = 0` |
| Enqueued call PC | `sel_enter_enqueued_call * pc = 0` |

## Abstract Bug Patterns

### Uninitialized Phase Indicator at Trace Start
```pil
// VULNERABLE: Could start at any phase, skipping earlier phases
pol commit stage_indicator;
// Missing: precomputed.first_row * (stage_indicator - FIRST_STAGE) = 0;
```
**Impact**: Skip arbitrary computation phases.

### Uninitialized Counter at Context Entry
```pil
// VULNERABLE: Could start execution at any offset
pol commit step_counter;
// Missing: sel_enter_context * step_counter = 0;
```
**Impact**: Complete control flow corruption.

### Shifted-Only Initialization (Row 0 Gap)
```pil
// VULNERABLE: Only constrained via next-row relation
pol commit begin_flag; // @boolean
(1 - done) * (begin_flag' - ...) = 0;
// Row 0 has unconstrained begin_flag!
```
**Impact**: Theoretical - row 0 behavior undefined (mitigated if row 0 inactive).

## Output Format

### Summary Table (Markdown)

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t2-missing-initialization` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-t2-missing-initialization-{filename}-{line}-{issue-type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (Required)

Write `vm2-audit-t2-missing-initialization.json` to output directory:

```json
{
  "skill": "vm2-audit-t2-missing-initialization",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-missing-initialization-filename-123-issue-type",
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
