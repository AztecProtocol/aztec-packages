---
name: vm2-audit-t1-selector-outside-active
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

> **PERFORMANCE RULE**: Do NOT iterate per-selector with individual greps. Use the batch-first approach below. The codebase has hundreds of sub-selectors — per-selector iteration will exhaust the context window.

### Phase 1: Batch Collection (3 parallel searches)

**Search A — All committed sub-selectors** (candidates):
```bash
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit.*_op" pil/vm2/ --include="*.pil"
```

**Search B — All implication constraints** (already protected):
```bash
grep -rn "\* (1 - sel)" pil/vm2/ --include="*.pil"
```

**Search C — All derived-from-sel intermediates** (inherently safe):
```bash
grep -rn "pol [A-Z_]* = sel \*\|pol [A-Z_]* = .*\* sel" pil/vm2/ --include="*.pil"
```

### Phase 2: Set Difference (compute candidates)

From the batch results:
1. DECLARED = sub-selectors from Search A
2. PROTECTED = selectors appearing in Search B + derived selectors from Search C
3. CANDIDATES = DECLARED - PROTECTED

Typically yields **5-20 candidates** to investigate.

### Phase 3: Deep Analysis (only on candidates)

For each candidate, read the relevant PIL file and check:
1. Does it trigger a permutation or lookup? (grep for the column name in `{...} is {...}` patterns)
2. If permutation: can attacker create legitimate destination rows?
3. If lookup only: LOW severity (one-way)
4. If incoming uses `trace.sel` as destination selector: NOT AN ISSUE

| Interaction Type | Exploitability | Severity |
|------------------|----------------|----------|
| **Permutation** with simulation gadgets | Attacker creates destination rows | **CRITICAL** |
| **Permutation** without simulation path | No matching destinations | LOW |
| **Lookup** | One-way (source can't fake destination) | LOW |
| Incoming uses `trace.sel` | Ghost rows isolated | NOT AN ISSUE |

**WARNING**: "Destination protected by `write * (1 - sel) = 0`" is NOT sufficient! Ghost sources can still match legitimate destinations.

### Phase 4: Completeness Reconciliation

Catch sub-selectors with unconventional names by finding ALL columns that gate interactions:
```bash
# Find all columns used as selectors in permutation/lookup source positions
grep -roPh "[a-z_][a-z_0-9]* \{" pil/vm2/ --include="*.pil" | sort -u
```

Cross-check: any selector name appearing here that wasn't in Search A is an unconventionally-named sub-selector. Add to candidates and re-run Phase 3.

Also verify: for each PIL file that declares a `pol commit sel;`, confirm at least one sub-selector was analyzed. List any files with 0 candidates (they may have no sub-selectors, but flag for awareness).

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
| Skill | `vm2-audit-t1-selector-outside-active` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-t1-selector-outside-active-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t1-selector-outside-active",
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
