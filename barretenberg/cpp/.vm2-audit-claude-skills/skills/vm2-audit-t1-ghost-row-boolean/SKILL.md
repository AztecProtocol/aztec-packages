---
name: vm2-audit-t1-ghost-row-boolean
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Ghost Row Injection Audit

## Purpose
Test exploitability of selector-outside-active vulnerabilities via ghost row injection on PERMUTATIONS.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities.

**RULE 1 — Report first, dismiss later.** Every unprotected sub-selector that gates a permutation is a PRELIMINARY FINDING. Report ALL of them first, then only remove findings in a final filtering pass using the strict criteria below. The default is REPORT, not dismiss.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if it matches one of these EXACT safe patterns:
  - (a) **Explicit implication constraint**: `sub_sel * (1 - sel) = 0` exists (quote the exact line).
  - (b) **Derived polynomial**: `pol NAME = sel * expr` (quote the exact definition).
  - (c) **Algebraic decomposition**: `sel = sub_a + sub_b + ...` with all terms non-negative and boolean (quote it).
  - (d) **Group implication**: `(sel_a + sel_b + ...) * (1 - sel) = 0` (quote the exact line).
  You MUST NOT invent novel "it's safe because..." reasoning. If protection doesn't match (a)-(d), REPORT IT.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT PIL constraint (file:line and text). If you cannot quote a specific protecting constraint, you MUST report the finding.

**RULE 4 — Severity floor.** When in doubt about severity, report as **High**. Only downgrade with a quoted constraint proving limited impact.

## When to Use
- After `vm2-audit-t1-selector-outside-active` finds unconstrained sub-selector firing a **PERMUTATION**
- Testing if attacker can inject ghost source rows matching legitimate destination rows
- Note: "Destination protection" (`write * (1 - sel) = 0`) only prevents ghost destinations, not ghost sources

## When NOT to Use
- The interaction is a LOOKUP (not exploitable this way)
- Sub-selector is already constrained by `sub_sel * (1 - main_sel) = 0`

## Workflow

### Step 0: Systematic Component Discovery (MANDATORY)

> **CRITICAL**: Enumerate ALL permutation-bearing files before analysis. Do not limit to known components.

```bash
# Find ALL files containing permutations (} is patterns)
grep -rl "} is " pil/vm2/ --include="*.pil" | sort
```

This gives the complete list of files where ghost-row-boolean matters. Process EVERY file in this list.

### Step 1: For Each File, Identify Permutation Source Selectors

For each file from Step 0:
```bash
# Find all committed columns used as permutation source selectors
grep -n "} is " pil/vm2/<file>.pil
```

Extract the source selector for each permutation. Check if it's:
- A main `sel` (inherently safe — if sel=0, constraints skip)
- A sub-selector (`sel_write`, `sel_do_write`, `is_write`, `start`, `end`, `latch`, `start_keccak`, `start_sha256`, etc.)

> NOTE: Include lifecycle selectors (start, end, latch) and operation-type selectors (start_keccak, start_sha256) — not just write-pattern selectors.

### Step 2: Check Each Sub-Selector for Protection

For each sub-selector identified:
```bash
grep -n "sub_sel.*(1 - sel)\|(1 - sel).*sub_sel" pil/vm2/<file>.pil
```

If no implication constraint exists, the sub-selector can be set on ghost rows.

### Step 3: For Vulnerable Selectors, Verify Gadget Exploitability

Find the destination trace and check if simulation gadgets can create matching rows:
- Can caller specify slot, value, address, or other critical fields?
- Does the CLK trick work? (Place ghost at row N = destination's committed `clk`)

| Factor | How It Blocks | Bypass |
|--------|---------------|--------|
| CLK mismatch | Source uses `precomputed.clk`, dest uses committed `clk` | Place ghost row at row N = destination's clk |
| START_CONDITION | `sel' * (1 - sel) * (1 - first_row) = 0` requires continuity | Trace builder handles automatically |
| Crypto constraints | Destinations require valid hashes/proofs | Use simulation gadgets |

### Step 4: Document Results

- Attack succeeds: **CRITICAL** finding
- Attack blocked: Document the blocking factor

### Step 5: Coverage Table (MANDATORY)

Output a table of ALL permutation-bearing files and their analysis status:

| File | Permutations found | Sub-selectors checked | Vulnerable? | Analyzed? |
|------|-------------------|---------------------|-------------|-----------|

## Fix Pattern

```pil
// Vulnerable: sub_selector unconstrained when main_sel = 0
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;

// Fixed: force sub_selector = 0 when main_sel = 0
#[SUB_SELECTOR_REQUIRES_MAIN_SEL]
sub_selector * (1 - main_sel) = 0;
```

## Reference: Abstract Ghost Row Attack Pattern

The canonical attack shape for this vulnerability:
1. Use a simulation gadget with attacker-controlled parameters to build legitimate destination rows
2. Inject a ghost source row at an inactive row (main_sel=0) with sub_sel=1
3. Ghost source matches legitimate destination via permutation tuple
4. All relations and permutations PASS — **Attack SUCCEEDS**

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low (theoretical) to Critical (blocks valid inputs)
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-ghost-row-boolean` |
| Target | `{path}` |
| Files Scanned | `{count}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-t1-ghost-row-boolean-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t1-ghost-row-boolean",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-t1-ghost-row-boolean-filename-123-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Description",
    "exploitability": "high",
    "fix": "Suggested fix"
  }]
}
```
