---
name: vm2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Ghost Row Injection Audit

## Purpose
Determine if a selector-outside-active vulnerability is exploitable by injecting ghost source rows that match legitimate destination rows created via simulation gadgets.

## When to Use
- After `vm2-audit-selector-outside-active` finds sub-selector fires **PERMUTATION** from inactive rows
- Validating if "destination protection" (`write * (1 - sel) = 0`) is sufficient (it only blocks ghost DESTINATIONS, not ghost SOURCES)

## When NOT to Use
- Sub-selector fires a LOOKUP (lookups allow duplicates, different attack model)
- No selector-outside-active finding exists for the target

## Attack Concept

Ghost row injection exploits permutations by:
1. Placing a ghost row at `main_sel=0` with attacker-controlled values
2. Sub-selector fires permutation source from ghost row
3. Using simulation gadgets to create legitimate destination rows that match
4. CLK trick: place ghost at row N where N equals destination's committed `clk`

## Workflow

### Step 1: Identify Permutation and Tuple

```bash
# Find permutation in the vulnerable PIL
grep -n "in " pil/vm2/<component>.pil
```

Extract the tuple columns - these must match between source and destination.

### Step 2: Locate Destination Trace Builder

Find the destination's simulation gadget in tracegen:
```bash
grep -rn "class.*Builder\|EventEmitter" src/barretenberg/vm2/simulation/
grep -rn "<destination_trace>" src/barretenberg/vm2/tracegen/
```

### Step 3: Verify Gadget Accepts Arbitrary Values

Check if simulation gadget parameters are attacker-controllable:
- Can caller specify slot, value, address, or other critical fields?
- Does gadget auto-generate valid cryptographic data (hashes, proofs)?

### Step 4: Analyze CLK Matching

Permutation tuples often include clock:
- **Source**: uses `precomputed.clk` (equals row number)
- **Destination**: uses committed `clk` column

**Attack**: Place ghost at row 0, create destination with `clk=0` at any row.

### Step 5: Check Blocking Factors

| Factor | Blocked? | Bypass |
|--------|----------|--------|
| CLK mismatch | Maybe | Place ghost at row N = destination clk |
| START_CONDITION (`sel' * (1 - sel) * (1 - first_row) = 0`) | No | Trace builder handles continuity |
| Cryptographic constraints | No | Simulation gadgets provide valid proofs |
| Other tuple fields constrained | Check | May require gadget to set specific values |

### Step 6: Document Result

- **Exploitable**: CRITICAL - ghost rows can inject arbitrary operations
- **Blocked**: Document specific constraint that prevents exploitation

## Real-World Example: SSTORE Attack

```cpp
// Ghost sstore row at row 0 with precomputed_clk=0
// public_data_check write row at row 1 with clk=0
// Result: PERMUTATION PASSES - Attack SUCCEEDED
```

Attack succeeded because:
1. `sel_sstore` unconstrained when `main_sel=0`
2. PublicDataTreeCheck gadget creates legitimate destination rows
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

- Prerequisite: `vm2-audit-selector-outside-active`
- SSTORE attack test: `src/barretenberg/vm2/constraining/relations/storage_write.test.cpp`

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-ghost-row-injection` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{count by severity or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format

- **ID**: `vm2-audit-ghost-row-injection-{file}-{line}-{type}`
- **Severity**: Critical (exploitable) / High (likely exploitable) / Medium (theoretical)
- **File**: `path/to/file.pil:line`
- **Exploitability**: Analysis of attack feasibility
- **Fix**: Constraint to add

### JSON Output (write to specified path)

```json
{
  "skill": "vm2-audit-ghost-row-injection",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-ghost-row-injection-file-line-type",
    "severity": "critical",
    "file": "path/to/file.pil",
    "line": 123,
    "description": "Ghost source can match legitimate destination",
    "exploitability": "high",
    "fix": "Add sub_selector * (1 - main_sel) = 0"
  }]
}
```
