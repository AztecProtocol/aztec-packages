---
name: vm2-take2-audit-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Selector Outside Active Rows Audit

## Purpose
Detect sub-selectors missing implication constraints (`sub_sel * (1 - sel) = 0`), enabling ghost operations on inactive rows.

## When to Use
- Auditing PIL files for selector constraint issues
- Reviewing new opcodes or subsystems for proper selector gating
- Security review of interaction-triggering selectors

## When NOT to Use
- Other constraint types (use specific audit skills)
- Non-PIL code review

## The Bug Pattern

**Required constraint** (the "implication pattern"):
```pil
sub_selector * (1 - sel) = 0;  // sub_selector=1 requires sel=1
```

**Vulnerable** - boolean but no implication:
```pil
pol commit sub_sel;
sub_sel * (1 - sub_sel) = 0;  // Missing implication!
```

**Secure** - derived from sel (inherently safe):
```pil
pol SUB = sel * condition;
```

## Workflow

### Step 1: Find All Selectors
```bash
# Sub-selectors (sel_*, is_*, *_op patterns)
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit.*_op" pil/vm2/ --include="*.pil"

# Main selector
grep -rn "pol commit sel;" pil/vm2/ --include="*.pil"
```

### Step 2: Check Implication Constraints
For each sub-selector, verify existence of:
```bash
# Direct: sub_selector * (1 - sel) = 0
grep -rn "sub_selector.*(1 - sel)" pil/vm2/ --include="*.pil"

# Or derived: pol SUB = sel * ...
grep -rn "pol [A-Z_]* = sel \*" pil/vm2/ --include="*.pil"
```

**Missing constraint if**: `pol commit sub_sel` exists with boolean constraint, but no `sub_sel * (1 - sel) = 0` and not derived from `sel *`.

### Step 3: Assess Exploitability

| Interaction Type | Exploitability | Severity |
|------------------|----------------|----------|
| **Permutation** with simulation gadgets | Attacker creates destination rows | **CRITICAL** |
| **Permutation** without simulation path | No matching destinations | LOW |
| **Lookup** | One-way (source can't fake destination) | LOW |
| Incoming uses `trace.sel` | Ghost rows isolated | NOT AN ISSUE |

**Key question for permutations**: Can attacker create legitimate destination rows?
```bash
grep -rn "destination_trace" src/barretenberg/vm2/simulation/
```

**WARNING**: "Destination protected by `write * (1 - sel) = 0`" is NOT sufficient! Ghost sources can still match legitimate destinations.

## Critical Examples

### SSTORE Attack (2024) - CRITICAL
```pil
pol commit sel_write_public_data;
sel_execute_sstore * ((1 - sel_opcode_error) - sel_write_public_data) = 0;
// Missing: sel_write_public_data * (1 - sel_execute_sstore) = 0;
```
**Attack**: Ghost row (`sel_execute_sstore=0, sel_write_public_data=1`) fires permutation. Attacker creates `public_data_check` rows via simulation. Ghost source matches legitimate destination -> arbitrary storage writes.

**Test**: `storage_write.test.cpp:NegativeFullAttackWithAllTraces`

### False Positive - ECC
```pil
double_op * (1 - double_op) = 0;  // Not gated by sel
```
**Not an issue**: Incoming lookups use `ecc.sel` as destination, isolating ghost rows.

## Severity Assessment

- **Soundness** (malicious prover): Critical/High based on exploitability
- **Completeness** (honest prover): Low (theoretical) to Critical (blocks valid inputs)
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-selector-outside-active` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-take2-audit-selector-outside-active-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-take2-audit-selector-outside-active",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "...",
    "exploitability": "high",
    "fix": "..."
  }]
}
```
