---
name: vm2-audit-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Selector Outside Active Rows Audit

Audits for selector under-constraint outside active rows. Selectors that should only be active when `sel = 1` can be toggled on inactive rows (`sel = 0`), enabling ghost operations.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## The Implication Pattern

```pil
// sub_selector = 1 requires sel = 1
sub_selector * (1 - sel) = 0;
```

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Selectors

```bash
# Find sub-selectors (sel_*, is_*, should_*, has_*, *_op, *_flag)
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit.*_op" pil/vm2/ --include="*.pil"

# Find main selector
grep -rn "pol commit sel;" pil/vm2/ --include="*.pil"
```

### Step 2: Check for Implication Constraints

For each sub-selector, verify one of these exists:

```bash
# Direct implication: sub_selector * (1 - sel) = 0
grep -rn "sub_selector.*(1 - sel)" pil/vm2/ --include="*.pil"

# Derived definition: pol SUB = sel * condition (inherently safe)
grep -rn "pol [A-Z_]* = sel \*" pil/vm2/ --include="*.pil"
```

Missing constraint if:
- `pol commit sub_sel` exists with boolean constraint
- But no `sub_sel * (1 - sel) = 0`
- And not derived from `sel *`

### Step 3: Assess Exploitability

For each missing constraint, check severity:

| Check | If True | Severity |
|-------|---------|----------|
| Sub-selector fires a **permutation**? | Check destination | See below |
| Sub-selector fires a **lookup**? | Lookups are one-way | LOW |
| Incoming interactions use `trace.sel`? | Ghost rows isolated | NOT AN ISSUE |

**For permutations**, the key question: Can attacker create legitimate destination rows?

```bash
# Check if destination has simulation gadgets
grep -rn "destination_trace" src/barretenberg/vm2/simulation/
```

- If simulation gadgets exist → **CRITICAL** (attacker can match ghost source to legitimate destination)
- If no simulation path → LOW

**WARNING**: "Destination protected by `write * (1 - sel) = 0`" is NOT sufficient! This only prevents ghost destinations, not ghost sources matching legitimate destinations.

## Patterns

### Vulnerable
```pil
pol commit sub_sel;
sub_sel * (1 - sub_sel) = 0;  // Boolean but no implication!
```

### Secure
```pil
pol commit sub_sel;
sub_sel * (1 - sub_sel) = 0;
sub_sel * (1 - sel) = 0;  // Implication constraint
```

## Examples

### Example 1: TX Subsystem (PR #18336)
```pil
pol commit is_public_call_request;
// Missing: is_public_call_request * (1 - sel) = 0;
```
**Impact**: Insert illegitimate public call requests.

### Example 2: False Positive - ECC
```pil
double_op * (1 - double_op) = 0;  // Not gated by sel!
```
**Not an issue** because: tracegen uses sparse storage (inactive rows = 0), and incoming lookups use `ecc.sel` as destination, isolating ghost rows.

### Example 3: SSTORE - CRITICAL (2024)
```pil
pol commit sel_write_public_data;
sel_execute_sstore * ((1 - sel_opcode_error) - sel_write_public_data) = 0;
// Missing: sel_write_public_data * (1 - sel_execute_sstore) = 0;
```
**Attack**: Ghost row with `sel_execute_sstore=0, sel_write_public_data=1` fires permutation. Attacker creates legitimate `public_data_check` rows via simulation. Ghost source matches legitimate destination → arbitrary storage writes.

**Test**: `storage_write.test.cpp:NegativeFullAttackWithAllTraces`

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-selector-outside-active` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-selector-outside-active-filename-123-issue-type` (MUST use full skill name: `vm2-audit-selector-outside-active`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-selector-outside-active.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-selector-outside-active",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-selector-outside-active-filename-123-issue-type",
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
  "skill": "vm2-audit-selector-outside-active",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.