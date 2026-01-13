---
name: vm2-audit-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Selector Outside Active Rows Audit

## Purpose
Detect sub-selectors that can be toggled on inactive rows (sel=0), enabling ghost operations: extra writes, state corruption, or feature triggering on invalid rows.

## When to Use
- Auditing PIL files for selector under-constraint
- Reviewing new sub-selectors for missing implication constraints
- Analyzing potential ghost row attacks

## Core Vulnerability

Sub-selectors must imply the main selector is active:

```pil
// VULNERABLE: sub_sel can be 1 when sel = 0
pol commit sub_sel;
sub_sel * (1 - sub_sel) = 0;  // Boolean only, no implication

// SECURE: sub_sel requires sel = 1
sub_sel * (1 - sel) = 0;  // Implication constraint

// ALSO SECURE: Derived from sel (inherently safe)
pol SUB_SEL = sel * condition;
```

## Workflow

### Step 1: Find Sub-Selectors
```bash
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit should_\|pol commit has_" pil/vm2/ --include="*.pil"
```

Common patterns: `sel_*`, `is_*`, `should_*`, `has_*`, `*_op`, `*_flag`

### Step 2: Check for Implication Constraints

For each committed sub-selector, verify one exists:
```bash
# Direct implication
grep -n "sub_selector.*(1 - sel)" pil/vm2/component.pil

# Or derived from sel
grep -n "pol.*= sel \*" pil/vm2/component.pil
```

### Step 3: Check Gated Boolean Constraints

```pil
// INCOMPLETE: Boolean only checked when sel = 1
sel * sub_sel * (1 - sub_sel) = 0;
// sub_sel can be ANY value when sel = 0!

// COMPLETE: Add force-zero
sub_sel * (1 - sel) = 0;
```

### Step 4: Assess Exploitability

**CRITICAL WARNING**: Do NOT assume "destination protection" makes vulnerabilities unexploitable.

For ghost rows (sub_sel=1, sel=0) firing interactions:

1. **Check outgoing interactions**: What lookups/permutations fire from this selector?
2. **For permutations**: Can attacker create legitimate destination rows?
   - If YES (simulation gadgets exist): **CRITICAL**
   - If NO: LOW

```bash
# Find what this trace sends to
grep -n "in \|is " pil/vm2/component.pil
```

3. **Check incoming interactions**: If callers use `trace.sel` as destination, ghost rows are isolated.
4. **Check tracegen**: Sparse storage defaults to 0, so ungated booleans on unset rows satisfy `0*(1-0)=0`.

### Severity Rating

| Scenario | Severity |
|----------|----------|
| Ghost source fires permutation to populatable destination | **CRITICAL** |
| Ghost source fires permutation to unpopulatable destination | LOW |
| Ghost source fires lookup | LOW (one-way) |
| Ghost rows isolated by `trace.sel` destination | NOT AN ISSUE |
| Tracegen zeros inactive rows | NOT AN ISSUE |

**Key insight**: `write * (1 - sel) = 0` at destination only prevents ghost destinations, NOT ghost sources matching legitimate destinations.

## Real Examples

### CRITICAL - SSTORE Exploit (2024)
```pil
// sstore.pil
pol commit sel_write_public_data;
sel_execute_sstore * ((1 - sel_opcode_error) - sel_write_public_data) = 0;
// MISSING: sel_write_public_data * (1 - sel_execute_sstore) = 0;
```

**Attack**:
1. Ghost row: `sel_execute_sstore=0, sel_write_public_data=1`
2. Fires `STORAGE_WRITE` permutation
3. Attacker creates LEGITIMATE `public_data_check` rows via simulation
4. Ghost source matches legitimate destination - arbitrary storage writes!

**Fix**: `sel_write_public_data * (1 - sel_execute_sstore) = 0`

### FALSE POSITIVE - ECC
```pil
double_op * (1 - double_op) = 0;  // Not gated by sel
```
**Not an issue**: Tracegen only sets values in event loops, sparse storage defaults to 0, and incoming lookups use `ecc.sel` as destination (ghost rows isolated).

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-selector-outside-active` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-selector-outside-active-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write to output directory as `vm2-audit-selector-outside-active.json`:

```json
{
  "skill": "vm2-audit-selector-outside-active",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-selector-outside-active-sstore-45-ghost-permutation",
      "severity": "critical",
      "file": "pil/vm2/sstore.pil",
      "line": 45,
      "description": "sel_write_public_data unconstrained outside active rows",
      "exploitability": "high",
      "fix": "Add: sel_write_public_data * (1 - sel_execute_sstore) = 0"
    }
  ]
}
```
