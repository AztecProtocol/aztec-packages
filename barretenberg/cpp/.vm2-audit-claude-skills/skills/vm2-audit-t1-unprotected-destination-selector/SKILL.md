---
name: vm2-audit-t1-unprotected-destination-selector
description: Audit VM2/AVM PIL files for unprotected lookup/permutation destination selectors. When any selector used as a destination in a lookup/permutation lacks a constraint tying it to the component's main activity selector (sel), a malicious prover can activate that selector on inactive rows (sel=0), bypassing all skippable constraints and forging results.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 2.0.0
---

# VM2 Unprotected Destination Selector Audit

## Purpose
Detect destination selectors in lookups/permutations that lack implication constraints, allowing malicious provers to forge computation results on inactive rows.

## When to Use
- Auditing any PIL file that exposes selectors as lookup/permutation destinations
- Reviewing multi-row gadget lifecycle selectors (start, end, write, latch, etc.)
- Reviewing per-opcode selectors used as lookup destinations from dispatching traces
- Reviewing phase/mode selectors in orchestration components that gate downstream interactions
- Security review of any component where forging selector activation would bypass constraints

## When NOT to Use
- Auditing source-side selector issues (use `vm2-audit-t1-selector-outside-active`)
- Reviewing precomputed/constant tables (destination rows are fixed)
- Non-PIL code review

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

## The Bug Pattern

This vulnerability is distinct from source-side ghost row injection. Here, the **destination** selector in a lookup is unprotected.

There are THREE categories of destination selectors to audit:

### Category A: Multi-Row Gadget Lifecycle Selectors

Selectors like `start`, `end`, `write`, `latch`, `first`, `last` in multi-row gadgets (hash, tree, memory, etc.) that mark specific lifecycle phases of a multi-row computation.

**Vulnerable pattern**:
```pil
// In gadget.pil (e.g., a hash gadget):
pol commit start;
start * (1 - start) = 0;  // Boolean only!
// MISSING: start * (1 - sel) = 0;

// All constraints are gated by sel:
#[skippable_if] sel = 0;
sel * (some_constraint) = 0;
```

**Vulnerable lookup** - external file looks up INTO unprotected destination:
```pil
// In caller.pil:
caller_sel { input_a, input_b, output }
in gadget.start { gadget.input_0, gadget.input_1, gadget.output };
```

### Category B: Per-Opcode Dispatch Destination Selectors

Selectors like `sel_op_*` that identify specific operations within a component. When these are used as **destination selectors** in lookups from an external dispatch trace, they become attack surfaces if not tied to the component's main `sel`.

**Vulnerable pattern**:
```pil
// In component.pil:
pol commit sel_op_foo;
sel_op_foo * (1 - sel_op_foo) = 0;  // Boolean only!
// MISSING: sel_op_foo * (1 - sel) = 0;

// The opcode selector IS used in an internal decomposition:
op_id = sel_op_foo * CONST_FOO + sel_op_bar * CONST_BAR + ...;
// But this decomposition does NOT prevent sel_op_foo=1 when sel=0
// unless the decomposition itself is gated by sel.

// External dispatch uses sel_op_foo as destination:
// In caller.pil:
dispatch_sel { inputs..., outputs... }
in component.sel_op_foo { component.ia, ..., component.ic, ... };
```

**Key distinction**: When the main dispatch lookup uses `component.sel` as destination (e.g., `in alu.sel { ... }`), the destination forces `sel=1`, activating all constraints. But when a *different* selector like `sel_op_foo` is used as the destination, `sel` is NOT forced to 1 -- it only appears as a regular tuple column. A prover can set `sel_op_foo=1, sel=0` and provide arbitrary values for other tuple columns since all constraints are skipped.

To verify whether the decomposition protects the selector, check:
1. Is the decomposition relation itself gated by `sel`? (e.g., `sel * (decomposition) = 0`)
2. Or does the decomposition equal `sel * something`? (e.g., `= sel_should_execute * op_id`)
3. If neither, the selector can be set independently of `sel`.

### Category C: Phase/Mode Selectors in Orchestration Components

Selectors that indicate which phase or mode a component is operating in (e.g., `is_foo_phase`, `is_bar_mode`). These are often read from precomputed tables via a lookup gated by the component's `sel`, but the selector itself may not have a direct implication constraint.

**Vulnerable pattern**:
```pil
// In orchestrator.pil:
pol commit is_foo_phase; // read from precomputed via lookup gated by sel

// Lookup gated by sel reads is_foo_phase from precomputed:
sel { phase_value, is_foo_phase, is_bar_phase, ... }
in precomputed.sel_phase { precomputed.clk, precomputed.is_foo, precomputed.is_bar, ... };

// BUT: is_foo_phase has NO direct constraint: is_foo_phase * (1 - sel) = 0
// Compare with is_bar_phase which DOES have: is_bar_phase * (1 - sel) = 0

// Downstream interaction uses is_foo_phase or a derived selector:
is_foo_phase { ... } is some_other_trace.sel { ... };
```

**Why the lookup-from-precomputed is NOT sufficient**: The lookup `sel { ..., is_foo_phase, ... } in precomputed.sel_phase { ... }` only constrains `is_foo_phase` on rows where `sel=1`. On rows where `sel=0`, `is_foo_phase` is unconstrained -- a prover can set it to any value. If `is_foo_phase` or a selector derived from it is then used as a source selector in a downstream lookup/permutation, the prover can activate that interaction on inactive rows.

**What to look for**: Compare all phase/mode selectors in a component. If SOME have explicit `selector * (1 - sel) = 0` constraints but OTHERS do not, the unprotected ones are likely vulnerable. This inconsistency is a strong signal.

## The Attack (General)

For any of the three categories, the attack follows the same template:

1. The attacker creates a ghost row in the destination component's trace
2. `sel = 0` (no constraints enforced due to `#[skippable_if] sel = 0`)
3. The destination selector = 1 (matches the lookup/permutation destination)
4. All tuple columns set to desired values (inputs match caller, outputs are ARBITRARY)
5. The lookup/permutation succeeds because the destination selector matches and tuple values match
6. Since `sel=0`, no constraint verifies correctness of the computation

**Fixed pattern** (same for all categories):
```pil
dest_selector * (1 - sel) = 0;  // dest_selector=1 requires sel=1, enforcing all constraints
```

## Why This Is Critical

Unlike source-side ghost rows (which need matching destinations), destination-side ghost rows are **trivially exploitable**:
1. The attacker controls all column values on the ghost row
2. No constraints are enforced (sel=0 means skippable)
3. External lookups will match the ghost row as a valid destination
4. The attacker can claim arbitrary computation results (fake hashes, fake proofs, fake truncations)

## Workflow

### Step 1: Find All Lookup/Permutation Destination Selectors (Lifecycle)

Find interactions where the destination selector is a lifecycle column (not just `sel`):

```bash
# Find lookups with named destination selectors (not just trace.sel)
grep -rn "^.*in.*\.\(start\|end\|write\|latch\|last\|first\)" pil/vm2/ --include="*.pil"

# Also find destinations using sub-selectors
grep -rn "^.*in.*\.\(sel_\|is_\|should_\)" pil/vm2/ --include="*.pil"
```

Note that these patterns are NOT comprehensive. They serve as a good first pass, but every PIL file must be manually reviewed to determine whether or not they have such destination selectors.

### Step 2: Find Per-Opcode Selectors Used as Lookup Destinations

Search for dispatch lookups where the destination selector is a per-opcode or per-operation selector rather than the component's main `sel`:

```bash
# Find lookups where destination is a sub-selector (sel_op_*, sel_foo_*) rather than just .sel
grep -rn "} in [a-z_]*\.sel_" pil/vm2/ --include="*.pil"
grep -rn "} is [a-z_]*\.sel_" pil/vm2/ --include="*.pil"
```

For each such destination selector found, go to the destination component and check:
1. Is there a `dest_sel * (1 - sel) = 0` constraint?
2. Is there a decomposition relation that transitively forces `sel=1` when `dest_sel=1`?
3. Does the lookup tuple include `sel` as a column that the source constrains to a nonzero value?

If NONE of the above hold, the selector is unprotected.

### Step 3: Find Phase/Mode Selectors Used in Downstream Interactions

Search for phase or mode selectors that gate downstream lookups/permutations:

```bash
# Find committed phase/mode selectors
grep -rn "pol commit is_[a-z_]*;" pil/vm2/ --include="*.pil"

# Find which of these are used as source selectors in lookups/permutations
grep -rn "is_[a-z_]* {" pil/vm2/ --include="*.pil"
```

For each phase/mode selector that gates a downstream interaction:
1. Check if there is a direct `phase_sel * (1 - sel) = 0` constraint
2. Check if SOME sibling phase selectors have such protection while OTHERS do not (inconsistency signal)
3. Check if the selector is derived from another selector that IS protected (e.g., `derived = sel * phase_sel * (1 - is_padded)` -- in this case `derived` is safe even if `phase_sel` itself isn't, because `derived` requires `sel=1`)

**Important nuance**: If the only downstream use of the phase selector is through a derived selector that multiplies by `sel` (e.g., `should_do_thing = sel * is_foo_phase * ...`), then `is_foo_phase` being unconstrained on inactive rows may be safe for that particular usage. But check ALL usages -- the selector might be used directly elsewhere.

### Step 4: For Each Unprotected Destination, Check Protection

Go to the destination file and verify the selector is constrained:

```bash
# Check if destination selector has implication constraint
# In the destination file, look for: dest_sel * (1 - sel) = 0
grep -n "dest_sel.*(1 - sel)\|(1 - sel).*dest_sel" pil/vm2/<component>.pil

# Also check combined forms
grep -n "(start + end).*(1 - sel)" pil/vm2/<component>.pil
```

Again, these patterns may not catch every form of protection, so manual review is necessary.

**Missing constraint if**: The destination selector is a `pol commit` boolean, used as a destination in a lookup/permutation, but has NO `dest_sel * (1 - sel) = 0` constraint AND no transitive protection through a decomposition gated by `sel`.

### Step 5: Identify What Can Be Forged

For each unprotected destination, determine what tuple columns the attacker controls:

```bash
# Find the full lookup tuple
grep -B2 -A5 "in.*<component>\.<dest_sel>" pil/vm2/ --include="*.pil" -r
```

Key columns to check:
- **output/result columns**: Can the attacker claim arbitrary computation results?
- **input columns**: Are these constrained by the source, making them fixed?
- **metadata columns** (rounds, length, tags): Must these match specific values?
- **sel or activity columns in the tuple**: Does the source force these to nonzero?

### Step 6: Assess Severity

| What Can Be Forged | Severity |
|---------------------|----------|
| Hash outputs (poseidon2, sha256, keccak) | **CRITICAL** - breaks all hash-based security |
| Merkle tree operations | **CRITICAL** - fake proofs of inclusion/non-inclusion |
| Address/class_id derivation | **CRITICAL** - identity forgery |
| Arithmetic/truncation results | **HIGH** - bypass computation correctness |
| Comparison results (gt, lt) | **HIGH** - bypass range/comparison checks |
| Memory reads | **HIGH** - read arbitrary values |
| Phase/mode activation on inactive rows | **HIGH** - activate downstream interactions without proper gating |
| Precomputed table lookups | **LOW** - table is fixed, can't forge |

### Step 7: Check for Multi-Lookup Patterns

Multi-round gadgets often use TWO lookups (one into `start`, one into `end`). The attack exploits the gap:

```pil
// Lookup 1: First round (into start) - VULNERABLE if start unprotected
source_sel { first_round_inputs, output, rounds }
in gadget.start { gadget.input_0, ..., gadget.output, gadget.num_rounds };

// Lookup 2: Last round (into end) - SAFE if end is protected
source_sel { last_round_inputs, output }
in gadget.end { gadget.input_0, ..., gadget.output };
```

**Attack**: Forge lookup 1 with ghost row, satisfy lookup 2 with a separate valid computation that produces the same `output` with attacker-chosen first-round inputs.

Also check dispatch patterns where one lookup uses `component.sel` (safe) but a separate dispatch for a different opcode uses `component.sel_op_*` (potentially unsafe). The inconsistency in destination selector choice is itself a signal to investigate.

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-unprotected-destination-selector` |
| Target | `{path}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format

- **ID**: `vm2-audit-t1-unprotected-destination-selector-{dest_file}-{line}-{dest_selector}`
- **Category**: A (lifecycle) / B (per-opcode dispatch) / C (phase/mode)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/destination_file.pil:line` (where the fix should be applied)
- **Destination Selector**: The unprotected column name
- **Source Lookups**: List of files/lookups that target this destination
- **Description**: What can be forged and impact
- **Exploitability**: high (trivial ghost row) / medium (requires multi-lookup coordination)
- **Fix**: `dest_sel * (1 - sel) = 0;`

### JSON Output (write to specified path)

```json
{
  "skill": "vm2-audit-t1-unprotected-destination-selector",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-t1-unprotected-destination-selector-<component>-<line>-<selector>",
    "category": "A|B|C",
    "severity": "critical",
    "file": "pil/vm2/<component>.pil",
    "line": 58,
    "destination_selector": "<selector_name>",
    "source_lookups": [
      "pil/vm2/<caller>.pil:<line> (<LOOKUP_NAME>)"
    ],
    "description": "<selector> used as lookup destination without <selector> * (1 - sel) = 0. Attacker can forge <what>.",
    "exploitability": "high",
    "impact": "Critical - <impact description>",
    "fix": "Add: <selector> * (1 - sel) = 0;"
  }]
}
```
