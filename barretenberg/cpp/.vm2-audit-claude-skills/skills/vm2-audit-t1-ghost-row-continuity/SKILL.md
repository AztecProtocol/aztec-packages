---
name: vm2-audit-t1-ghost-row-continuity
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Ghost Row Injection Audit

## Purpose
Audit multi-row gadgets for trace continuity vulnerabilities. Two attack surfaces:
1. **Ghost row permutation exploitation**: Unconstrained sub-selectors firing permutations from inactive rows, where an attacker creates legitimate destination rows to match ghost sources.
2. **Lifecycle state manipulation**: Columns within active multi-row computations (error flags, counters, end conditions) that are free or insufficiently constrained, allowing premature termination, row skipping, or injection.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities.

**RULE 1 — Report first, dismiss later.** Every unprotected permutation selector and every lifecycle state freedom is a PRELIMINARY FINDING. Report ALL of them first, then only remove findings in a final filtering pass using the strict criteria below.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a ghost-row finding if it matches one of these EXACT safe patterns:
  - (a) **Explicit implication constraint**: `sub_sel * (1 - sel) = 0` (quote exact line).
  - (b) **Derived polynomial**: `pol NAME = sel * expr` (quote exact definition).
  - (c) **Algebraic decomposition**: `sel = sub_a + sub_b + ...` (quote it).
  - (d) **Group implication**: `(sel_a + sel_b + ...) * (1 - sel) = 0` (quote exact line).
  For lifecycle findings, you may ONLY dismiss if you can quote:
  - (e) **Completion guard**: `sel * (1 - sel') * (1 - end) = 0` or equivalent (quote exact line).
  - (f) **Start-after-latch guard**: `sel' * (start' - LATCH_CONDITION) = 0` (quote exact line).
  - (g) **Counter decrement constraint**: that the counter decrements by exactly 1 each active row (quote exact line).
  You MUST NOT construct novel "it's safe because..." arguments.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT PIL constraint (file:line and text). If you cannot, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with a quoted constraint proving limited impact.

## When to Use
- Auditing multi-row gadgets for premature termination or truncation
- After `vm2-audit-t1-selector-outside-active` finds sub-selector fires **PERMUTATION** from inactive rows
- Reviewing components with start/end lifecycle selectors
- Checking if error flags can trigger premature `end` conditions

## When NOT to Use
- Pure single-row constraints (no lifecycle selectors)
- Non-PIL code review

## Severity Assessment
- **Soundness** (malicious prover exploits): Critical if ghost rows can inject arbitrary operations
- **Completeness** (honest prover fails): Low to Critical based on reachability
- **Key principle**: Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Attack Concept

Ghost row injection exploits permutations by:
1. Placing a ghost row at `main_sel=0` with attacker-controlled values
2. Sub-selector fires permutation source from ghost row
3. Using simulation gadgets to create legitimate destination rows that match
4. CLK trick: place ghost at row N where N equals destination's committed `clk`

## Workflow

### Part A: Ghost Row Permutation Exploitation

#### Step 1: Identify Permutation and Tuple

```bash
# Find permutations across ALL multi-row gadgets
grep -rn "} is " pil/vm2/ --include="*.pil"
```

Extract the tuple columns - these must match between source and destination.

#### Step 2: Locate Destination Trace Builder

Find the destination's simulation gadget in tracegen:
```bash
grep -rn "class.*Builder\|EventEmitter" src/barretenberg/vm2/simulation/
grep -rn "<destination_trace>" src/barretenberg/vm2/tracegen/
```

#### Step 3: Verify Gadget Accepts Arbitrary Values

Check if simulation gadget parameters are attacker-controllable:
- Can caller specify slot, value, address, or other critical fields?
- Does gadget auto-generate valid cryptographic data (hashes, proofs)?

#### Step 4: Analyze CLK Matching

Permutation tuples often include clock:
- **Source**: uses `precomputed.clk` (equals row number)
- **Destination**: uses committed `clk` column

**Attack**: Place ghost at row 0, create destination with `clk=0` at any row.

#### Step 5: Check Blocking Factors

| Factor | Blocked? | Bypass |
|--------|----------|--------|
| CLK mismatch | Maybe | Place ghost at row N = destination clk |
| START_CONDITION (`sel' * (1 - sel) * (1 - first_row) = 0`) | No | Trace builder handles continuity |
| Cryptographic constraints | No | Simulation gadgets provide valid proofs |
| Other tuple fields constrained | Check | May require gadget to set specific values |

### Part B: Lifecycle State Manipulation (Multi-Row Gadgets)

#### Step 6: Discover All Multi-Row Gadgets

```bash
# Find all components with start/end lifecycle selectors
grep -rn "pol commit start\|pol commit end\|pol commit sel_start\|pol commit sel_end\|pol commit err" \
    pil/vm2/ --include="*.pil"

# Find LATCH_CONDITION / zero-check end patterns
grep -rn "LATCH_CONDITION\|counter.*end\|end.*counter" pil/vm2/ --include="*.pil"
```

#### Step 7: For Each Gadget, Check Lifecycle State Freedom

For every multi-row gadget found in Step 6, answer:

| Check | What to look for |
|-------|-----------------|
| **Is `end` solely determined by counter?** | Can `end` be set to 1 before the counter reaches terminal? |
| **Are error flags constrained?** | If `err` is committed, can a prover set `err=1` on any intermediate row to trigger premature end? |
| **Is the end-condition gated correctly?** | What selector multiplies the end-condition constraint? Can it be 0 on intermediate rows? |
| **Is there a completion guard?** | `sel * (1 - sel') * (1 - end) = 0` — prevents trace going inactive mid-computation |
| **Is there a start-after-latch guard?** | `sel' * (start' - LATCH_CONDITION) = 0` — prevents extra rows between computations |
| **Does `last` imply `sel=1`?** | If the file uses a `last` column, check `last * (1 - sel) = 0`. Without this, a malicious prover can set `last=1` on inactive rows. |
| **Is TRACE_CONTINUITY present?** | Multi-row gadgets need continuity constraints. If missing, rows can be injected or reordered. |

**MANDATORY — Check ALL termination paths**: For each multi-row gadget, identify EVERY way the computation can end:
1. **Normal completion** (counter reaches zero, all data processed)
2. **Error paths** (err column triggers early termination via END_ON_ERR or similar)
3. **Edge cases** (single-row operations, zero-length inputs)

For error paths specifically: check whether error columns (`err`, `sel_err`, error flags) are constrained AFTER the first row. If an error column is only set on `sel_start` rows but used on all rows, the prover can set it freely on intermediate rows to trigger premature termination.

#### Step 8: Check for Premature Termination Exploits

For each gadget where `end` or `err` has freedom:
1. Can the prover set the flag to truncate the computation?
2. If truncated, are side effects (memory writes, lookups) correctly suppressed for skipped rows?
3. Can a prover insert extra rows into the gadget's active region?

### Step 9: Document Results

- **Exploitable ghost row**: CRITICAL — ghost rows can inject arbitrary operations
- **Exploitable premature termination**: CRITICAL/HIGH — computation can be truncated
- **Blocked**: Document specific constraint that prevents exploitation

### Step 8b: Check Both SOURCE and DESTINATION Sides of Lifecycle Lookups

For every lookup or permutation that involves lifecycle selectors (`start`, `end`, `sel`, `last`):
1. Check the **SOURCE** side: Is the source selector protected? (covered by Part A)
2. Check the **DESTINATION** side: Is the destination selector constrained? If an external file uses `start` or `end` as a destination selector in a `skippable_if` interaction, the destination rows can be skipped entirely if those selectors are unconstrained on inactive rows.

This is critical because a vulnerability may exist on the destination side even when the source side is safe.

### Coverage Requirement

**Enumerate ALL PIL files**:
```bash
find pil/vm2/ -name "*.pil" | sort
```

You MUST check ALL multi-row gadgets in the codebase, not just the first few found. Cross-reference the full file list against files analyzed. For any file not reached, read it and check for lifecycle selectors. Output a coverage table listing every PIL file and whether it was analyzed.

## Abstract Attack Example

```cpp
// Ghost row at row 0 with precomputed_clk=0
// Destination write row at row 1 with clk=0
// Result: PERMUTATION PASSES - Attack SUCCEEDED
```

Attack succeeded because:
1. `sub_sel_op` unconstrained when `main_sel=0`
2. Simulation gadget creates legitimate destination rows
3. Ghost source at row 0 matched destination with `clk=0`

## Fix Pattern

```pil
// VULNERABLE: sub_selector unconstrained when main_sel = 0
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;

// FIXED: force sub_selector = 0 when main_sel = 0
#[SUB_SELECTOR_REQUIRES_MAIN_SEL]
sub_selector * (1 - main_sel) = 0;
```

## References

- Prerequisite: `vm2-audit-t1-selector-outside-active`

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-ghost-row-continuity` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{count by severity or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format

- **ID**: `vm2-audit-t1-ghost-row-continuity-{file}-{line}-{type}`
- **Severity**: Critical (exploitable) / High (likely exploitable) / Medium (theoretical)
- **File**: `path/to/file.pil:line`
- **Exploitability**: Analysis of attack feasibility
- **Fix**: Constraint to add

### JSON Output (write to specified path)

```json
{
  "skill": "vm2-audit-t1-ghost-row-continuity",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-t1-ghost-row-continuity-file-line-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Ghost source can match legitimate destination",
    "exploitability": "high",
    "fix": "Add sub_selector * (1 - main_sel) = 0"
  }]
}
```
