---
name: vm2-audit-t1-selector-outside-active
description: Audit VM2/AVM PIL files for selector under-constraint outside active rows. Sub-selectors that should only be active when sel=1 can be toggled on inactive rows (sel=0). Includes exploitability analysis to determine if missing constraints are critical (ghost rows consumable) or low severity (isolated by interaction graph).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 3.0.0
---

# VM2 Selector Outside Active Rows Audit

## Purpose
Detect sub-selectors missing implication constraints (`sub_sel * (1 - sel) = 0`), enabling ghost operations on inactive rows.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities. Follow these rules absolutely:

**RULE 1 — Report first, dismiss later.** Every candidate that gates an interaction is a PRELIMINARY FINDING. You report ALL of them first, then only remove findings in a final filtering pass using the strict criteria below. The default is REPORT, not dismiss.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if it matches one of these EXACT safe patterns:
  - (a) **Explicit implication constraint**: The file contains `sub_sel * (1 - sel) = 0` or equivalent (quote the exact line).
  - (b) **Derived polynomial**: The sub-selector is defined as `pol NAME = sel * expr` (quote the exact definition).
  - (c) **Algebraic decomposition**: A constraint like `sel = sub_a + sub_b + ...` where all terms are non-negative and boolean-constrained (quote the decomposition).
  - (d) **Group implication**: A constraint like `(sel_a + sel_b + ...) * (1 - sel) = 0` (quote the exact line).
  You MUST NOT construct novel "it's safe because..." arguments. If the protection doesn't match (a)-(d), REPORT IT.

**RULE 3 — Quote or report.** For ANY dismissal, you must quote the EXACT PIL constraint line (file:line_number and the constraint text) that provides protection. "Protected by lifecycle constraints at lines 33-40" is NOT acceptable — quote each specific constraint. If you cannot quote a specific protecting constraint, you MUST report the finding.

**RULE 4 — Severity floor.** When in doubt about severity, report as **High**. Only downgrade below High when you can quote a specific constraint proving limited impact.

## The Core Bug Pattern

When a sub-selector's ONLY constraints are gated by a parent selector (`sel * (expr) = 0`), those constraints are trivially satisfied when `sel=0`, leaving the sub-selector unconstrained. If the sub-selector gates an interaction (permutation/lookup), a malicious prover can fire that interaction from ghost rows.

**Required constraint** (the "implication pattern"):
```pil
sub_selector * (1 - sel) = 0;  // sub_selector=1 requires sel=1
```

**Vulnerable** — all constraints on sub_sel are gated by sel:
```pil
pol commit sub_sel;
sub_sel * (1 - sub_sel) = 0;       // Boolean — but no implication!
sel * (expr - sub_sel) = 0;         // Only constrains sub_sel when sel=1
sub_sel { ... } is other.sel { ... };  // Fires on ANY row where sub_sel=1!
```

## File Priority Tiers

**TIER 1 — MUST CHECK FIRST** (complex state machines, hardest bugs live here):

| File | What to look for |
|------|-----------------|
| `tx.pil` | Phase selectors (is_collect_fee, is_public_call_request, is_cleanup), emission selectors (note_hash, nullifier, l2_to_l1_msg) — all gated only by tx.sel |
| `bitwise.pil` | `start_keccak`, `start_sha256` — lifecycle sub-selectors that gate hash permutations. Check ALL attack paths including the err=1 path. |
| `keccak_memory.pil` | `start_read`, `start_write`, `last` — lifecycle selectors. Check `last * (1-sel)=0`, trace continuity, and what happens on rows AFTER `last`. |
| `execution.pil` | Most execution selectors ARE protected by algebraic decomposition (SUBTRACE_ID_DECOMPOSITION, EXEC_OP_ID_DECOMPOSITION, DYN_GAS_ID_DECOMPOSITION). Focus on selectors NOT part of a decomposition, e.g. `sel_bytecode_retrieval_failure`. |
| `data_copy.pil` | `sel_cd_copy`, `sel_rd_copy` — check if constrained beyond the sel_start row (propagation gap). Also `sel_start`, `sel_end`. |

**TIER 2 — Opcode files** (systematic sweep, each is small):

| File | What to look for |
|------|-----------------|
| `opcodes/sstore.pil` | `sel_write_public_data` — gated only by `sel_execute_sstore` |
| `opcodes/emit_notehash.pil` | `sel_write_note_hash` |
| `opcodes/emit_nullifier.pil` | `sel_write_nullifier` |
| `opcodes/send_l2_to_l1_msg.pil` | `sel_write_l2_to_l1_msg` |
| `opcodes/get_contract_instance.pil` | `is_valid_member_enum`, `is_valid_writes_in_bounds` |
| `opcodes/get_env_var.pil` | `sel_envvar_pi_lookup_col0/col1` |
| `opcodes/emit_unencrypted_log.pil` | Memory read sub-selectors |
| `opcodes/sload.pil` | Storage read sub-selectors |
| `opcodes/external_call.pil` | Call dispatch sub-selectors |

**TIER 3 — Memory-gadget files** (also check top-level `sel` has boolean constraint):

| File | What to look for |
|------|-----------------|
| `ecc_mem.pil` | `sel` boolean constraint, `sel_should_exec` derivation |
| `poseidon2_mem.pil` | `sel` boolean constraint, `sel_should_read_mem`/`sel_should_exec` |
| `to_radix_mem.pil` | `sel` boolean constraint, `start` implication, `sel_should_write_mem` |
| `sha256_mem.pil` | Memory sub-selectors |

**TIER 4 — Tree and other files** (lower priority):
- `trees/*.pil` — `write` selectors (usually have `write * (1-sel) = 0`)
- `context.pil`, `context_stack.pil` — context management selectors
- `memory.pil` — ACTIVE_ROW_NEEDS_PERM_SELECTOR constraint status

## Workflow

> **BUDGET RULE**: Spend 40% on Tier 1 files, 30% on Tier 2 files, 20% on Tier 3-4, 10% on write-up. Do NOT spend more than 15% of your total budget on execution.pil — most of its selectors are protected by decomposition.

### Phase 1: Batch Collection (4 parallel searches)

**Search A — All committed sub-selectors** (candidates):
```bash
grep -rn "pol commit.*sel_\|pol commit is_\|pol commit.*_op\|pol commit start\|pol commit end\|pol commit write\|pol commit latch\|pol commit first\|pol commit last\|pol commit err" pil/vm2/ --include="*.pil"
```

**Search B — All implication constraints** (already protected):
```bash
grep -rn "\* (1 - sel)" pil/vm2/ --include="*.pil"
```

**Search C — All derived-from-sel intermediates** (inherently safe):
```bash
grep -rn "pol [A-Z_]* = sel \*\|pol [A-Z_]* = .*\* sel" pil/vm2/ --include="*.pil"
```

**Search D — All interaction selectors** (what actually gates interactions):
```bash
grep -rn "^[^/]*{" pil/vm2/ --include="*.pil" | grep -v "pol\|//\|let\|namespace" | head -80
```

### Phase 2: Set Difference → PRELIMINARY FINDINGS

1. DECLARED = sub-selectors from Search A
2. PROTECTED = selectors appearing in Search B + derived selectors from Search C
3. CANDIDATES = DECLARED - PROTECTED
4. **Every candidate that gates an interaction is a PRELIMINARY FINDING.** Add ALL of them to your findings list now. You will filter in Phase 6.

### Phase 3: Tiered Deep Read

**For each file in priority order (Tier 1 first)**, read the full file and for each preliminary finding:

**Step 3a** — Gather evidence:
1. List ALL constraints that reference this sub-selector (quote each one with file:line)
2. List ALL interactions this sub-selector gates (quote each one with file:line)
3. Check: does any constraint reference this sub-selector WITHOUT being gated by a parent selector?
4. If not → the sub-selector is unconstrained when parent_sel=0 → remains a FINDING

**Step 3b** — Also check for these specific patterns:
- **Lifecycle selectors without implication**: `start`, `end`, `last`, `latch` columns that lack `start * (1 - sel) = 0`. Compare with sha256.pil line 110 which correctly has `start * (1 - sel) = 0`.
- **Top-level `sel` without boolean**: Check if the file's main `sel` column has `sel * (1 - sel) = 0`. If not, ADD as a new finding.
- **Propagation gaps**: Selectors constrained only on specific rows (e.g., only on `sel_start` rows) but used on all rows — ADD as a new finding.
- **Multiple attack paths**: For state machines (bitwise, keccak), check ALL code paths (normal, error, edge cases). If ANY path allows the sub-selector to be set while sel=0, it is a finding.

**CRITICAL for execution.pil**: The algebraic decompositions (`SUBTRACE_ID_DECOMPOSITION`, `EXEC_OP_ID_DECOMPOSITION`, `DYN_GAS_ID_DECOMPOSITION`) force sub-selectors to 0 when sel=0. These match safe pattern (c). Only investigate execution.pil selectors that are NOT part of any decomposition.

### Phase 4: Completeness Reconciliation

**4a — Enumerate ALL PIL files** (ensure no file is skipped):
```bash
find pil/vm2/ -name "*.pil" | sort
```
Cross-reference this list against the files you analyzed. If ANY file was not covered by Search A through D, read it now and check for sub-selectors.

**4b — Catch sub-selectors with unconventional names**:
```bash
grep -roPh "[a-z_][a-z_0-9]* \{" pil/vm2/ --include="*.pil" | sort -u
```
Any selector name used to gate an interaction that wasn't in Search A is an unconventionally-named candidate — ADD as preliminary finding.

**4c — Verify transitive protection chains carefully**: When you encounter arguments like "start_X → start → round=1 → sel=1", trace each step through the actual constraints. Quote EVERY constraint in the chain. If any link is not an explicit PIL constraint (just an invariant of the trace generator), the chain does NOT protect and you MUST report.

### Phase 5: File Coverage Table (MANDATORY)

| File | Tier | Sub-selectors found | Preliminary findings | Final findings | Dismissed (with quoted constraint) |
|------|------|-------------------|---------------------|---------------|-----------------------------------|

**Every PIL file MUST appear** — not just interaction-bearing files. Use the full file list from Phase 4a. Breadth across all files beats depth on any single file. If a file has no sub-selectors, mark it as "N/A" in the table.

### Phase 6: Final Filtering Pass

Review ALL preliminary findings. For each one, you may ONLY dismiss it if:
- It matches safe pattern (a), (b), (c), or (d) from the Auditor Doctrine
- You quote the EXACT protecting constraint (file:line and constraint text)

If you cannot do both, the finding STAYS. Reclassify severity using the table below if needed, but the severity floor is **High** unless you can quote a constraint proving limited impact.

## Severity Assessment

| Interaction Type | Exploitability | Severity |
|------------------|----------------|----------|
| **Permutation** (`} is`) with simulation gadgets | Attacker creates destination rows | **CRITICAL** |
| **Permutation** without simulation path | No matching destinations available | HIGH |
| **Lookup** (`} in`) | One-way (source can't fake destination) | HIGH (can replay) |
| Top-level `sel` missing boolean | All gated constraints compromised | HIGH |
| Sub-selector only in multiplicative constraints, no interactions | Limited impact | MEDIUM |

**Default severity: HIGH.** Only use CRITICAL when a permutation with attacker-controlled destinations is confirmed. Only use MEDIUM when you can quote constraints proving the sub-selector gates no interaction.

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
- **Description**: 2-4 sentences. State the sub-selector, why it's unconstrained, what interaction it fires, and the impact.
- **Fix**: One-line suggestion (typically `sub_sel * (1 - parent_sel) = 0`)

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-t1-selector-outside-active",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...",
    "severity": "critical",
    "files": ["path/to/file.pil"],
    "line": 123,
    "description": "...",
    "exploitability": "high",
    "fix": "..."
  }]
}
```
