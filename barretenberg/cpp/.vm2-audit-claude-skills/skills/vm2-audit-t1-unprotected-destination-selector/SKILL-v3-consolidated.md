---
name: vm2-audit-t1-unprotected-destination-selector
description: Audit VM2/AVM PIL files for unprotected lookup/permutation destination selectors. When any selector used as a destination in a lookup/permutation lacks a constraint tying it to the component's main activity selector (sel), a malicious prover can activate that selector on inactive rows (sel=0), bypassing all skippable constraints and forging results. Covers lifecycle selectors, per-opcode dispatch selectors, phase/mode selectors, and derived sub-selectors. Includes implicit protection chain analysis and error-path exploitation vectors.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 3.0.0
---

# VM2 Unprotected Destination Selector Audit

## Purpose
Detect destination selectors in lookups/permutations that lack implication constraints, allowing malicious provers to forge computation results on inactive rows.

## When to Use
- Auditing any PIL file that exposes selectors as lookup/permutation destinations
- Reviewing multi-row gadget lifecycle selectors (start, end, write, latch, etc.)
- Reviewing **derived sub-selectors** (start_keccak, start_sha256, sel_write_x) used as destinations by other gadgets
- Reviewing per-opcode selectors used as lookup destinations from dispatching traces
- Reviewing phase/mode selectors in orchestration components that gate downstream interactions
- Verifying that implicit protection mechanisms are actually sound
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

There are THREE categories of destination selectors to audit, plus a sub-selector variant that cuts across categories:

### Category A: Multi-Row Gadget Lifecycle Selectors

Selectors like `start`, `end`, `write`, `latch`, `first`, `last` in multi-row gadgets (hash, tree, memory, etc.) that mark specific lifecycle phases of a multi-row computation.

**Vulnerable pattern**:
```pil
// In gadget.pil (e.g., poseidon2_hash.pil):
pol commit start;
start * (1 - start) = 0;  // Boolean only!
// MISSING: start * (1 - sel) = 0;

#[SELECTOR_ON_END]
end * (1 - sel) = 0;      // end is protected, but start is NOT!

// All constraints are gated by sel:
#[skippable_if] sel = 0;
sel * (some_constraint) = 0;
```

**Vulnerable lookup** - external file looks up INTO unprotected destination:
```pil
// In caller.pil (e.g., class_id_derivation.pil):
sel { input_a, input_b, input_c, output, rounds }
in gadget.start { gadget.input_0, gadget.input_1, gadget.input_2, gadget.output, gadget.rounds };
```

### Category A+: Sub-Selector Variants

Derived sub-selectors (e.g., `start_keccak`, `start_sha256`, `sel_write_x`) are often used as lookup destinations by OTHER gadgets. Even if the parent selector (e.g., `start`) is protected, sub-selectors may NOT inherit that protection.

**Vulnerable pattern**:
```pil
// In gadget.pil (e.g., bitwise.pil):
pol commit start;
pol commit start_keccak;  // Sub-selector: active on subset of start rows
pol commit start_sha256;
start_keccak * (1 - start) = 0;  // start_keccak implies start, BUT...
// MISSING: start_keccak * (1 - sel) = 0;
// MISSING: start_sha256 * (1 - sel) = 0;

// All correctness constraints gated by sel:
#[skippable_if] sel = 0;
sel * (byte_operations_constraint) = 0;
```

**Sub-selector lookup** - another gadget looks up INTO the sub-selector:
```pil
// In keccak.pil:
sel_theta { state_in_00, state_in_01, theta_xor_01 }
in bitwise.start_keccak { bitwise.ia, bitwise.ib, bitwise.acc_ic };
```

**Key insight**: Even if `start` itself is implicitly protected (e.g., via constraint chains that force `sel=1` when `start=1, err=0`), sub-selectors derived from `start` may NOT inherit that protection. The attacker can intentionally trigger an error condition (making `err=1`) to reach a state where `start=1, start_keccak=1, sel=0` — all constraints bypassed.

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

## Real-World Example: poseidon2_hash.pil (PR #19853) — Category A

**The vulnerability**: `poseidon2_hash.start` was used as a destination selector by 6+ lookups from `public_data_check.pil`, `address_derivation.pil`, and `class_id_derivation.pil`. The `end` selector was protected but `start` was not.

**The exploit** (class_id forgery):
1. Attacker creates a valid 2-round poseidon2 computation with chosen inputs that happens to use the real bytecode in round 2
2. Attacker creates a FORGED ghost row: `sel=0, start=1, input=(real_artifact, real_private_root), output=fake_class_id`
3. Lookup 1 (into `start`): matches the forged ghost row
4. Lookup 2 (into `end`): matches the attacker's valid computation end row
5. Result: `class_id_derivation` accepts `fake_class_id` for real contract inputs

**Impact**: Complete class_id forgery, address derivation bypass, public data tree manipulation.

## Real-World Example: bitwise.pil (PR #18244) — Category A+ (Sub-Selector)

**The vulnerability**: `bitwise.start_keccak` and `bitwise.start_sha256` were used as destination selectors by keccak and sha256 XOR lookups. While the parent `start` selector had implicit protection (constraint chain forcing `sel=1` when `err=0`), the sub-selectors did NOT have `* (1 - sel) = 0`.

**The exploit** (forging keccak XOR output):
1. Attacker creates a ghost row in the bitwise trace: `sel=0, start=1, start_keccak=1`
2. Attacker sets `tag_a != tag_b` (intentional tag mismatch) → `err=1`
3. Error path: `sel_get_ctr = start*(1-err) = 0` → `INTEGRAL_TAG_LENGTH` lookup inactive → `ctr` unconstrained → `ctr=0` → `sel=0`
4. All byte-level correctness constraints (BYTE_OPERATIONS) are gated by `sel` → bypassed!
5. Attacker sets `acc_ic = FORGED_XOR_RESULT` (arbitrary value)
6. Keccak's `THETA_XOR_01` lookup matches: `start_keccak=1` and tuple values match the forged output
7. `theta_xor_01` in keccak trace is constrained ONLY by this lookup → completely forged

**Why implicit protection failed**: The parent `start` was protected for the `err=0` path, but the sub-selectors `start_keccak` and `start_sha256` were exploitable via the `err=1` path because:
- The error path legitimately allows `start=1, sel=0` (for tag error detection)
- The keccak/sha256 lookups do NOT include `err` in their tuples
- The dispatch lookup from execution DOES include `err`, but that's a separate lookup

**Impact**: Complete forgery of XOR results in keccak permutation and SHA256 message schedule, breaking hash security.

**Fix**: `start_keccak * (1 - sel) = 0; start_sha256 * (1 - sel) = 0;`

## Workflow

### Step 1: Find All Lookup/Permutation Destination Selectors

Find interactions where the destination selector is a lifecycle, sub-selector, per-opcode, or phase column:

```bash
# Category A: Lifecycle destination selectors (not just trace.sel)
grep -rn "^.*in.*\.\(start\|end\|write\|latch\|last\|first\)" pil/vm2/ --include="*.pil"

# Category A+: Sub-selectors (derived from lifecycle selectors)
grep -rn "^.*in.*\.\(start_\|end_\|sel_write\|sel_read\)" pil/vm2/ --include="*.pil"

# Category B: Per-opcode dispatch destination selectors
grep -rn "} in [a-z_]*\.sel_" pil/vm2/ --include="*.pil"
grep -rn "} is [a-z_]*\.sel_" pil/vm2/ --include="*.pil"

# Category C: Phase/mode destination selectors
grep -rn "^.*in.*\.\(is_\|should_\)" pil/vm2/ --include="*.pil"

# Also catch phase selectors used as SOURCE selectors in downstream lookups
grep -rn "is_[a-z_]* {" pil/vm2/ --include="*.pil"
```

Note that these patterns are NOT comprehensive. They serve as a good first pass, but every PIL file must be manually reviewed to determine whether or not they have such destination selectors.

### Step 2: For Each Destination Selector, Check Explicit Protection

Go to the destination file and verify the selector is constrained:

```bash
# Check if destination selector has implication constraint
# In the destination file, look for: dest_sel * (1 - sel) = 0
grep -n "dest_sel.*(1 - sel)\|(1 - sel).*dest_sel" pil/vm2/<component>.pil

# Also check combined forms
grep -n "(start + end).*(1 - sel)" pil/vm2/<component>.pil

# Check sub-selectors too (start_keccak, start_sha256, etc.)
grep -n "start_\w*.*(1 - sel)\|(1 - sel).*start_\w*" pil/vm2/<component>.pil
```

Again, these patterns may not catch every form of protection, so manual review is necessary.

**Missing constraint if**: The destination selector is a `pol commit` boolean, used as a destination in a lookup/permutation, but has NO `dest_sel * (1 - sel) = 0` constraint AND no transitive protection through a decomposition gated by `sel`.

**Sub-selector nuance**: A parent selector (e.g., `start`) might be protected, but derived sub-selectors (e.g., `start_keccak`) might NOT be. The constraint `start * (1 - sel) = 0` does NOT automatically protect `start_keccak` — the sub-selector needs its own protection. Conversely, protecting only the sub-selectors leaves the parent `start` potentially exploitable by future lookups.

### Step 2b: Analyze Implicit Protection Mechanisms

If a destination selector lacks an explicit `dest_sel * (1 - sel) = 0` constraint, check whether it has **implicit protection** through constraint chains. This is critical for avoiding false positives AND for catching cases where implicit protection has exploitable gaps.

**How to trace an implicit protection chain:**

1. Starting from `dest_sel = 1`, follow the constraints to determine if `sel = 1` is forced:
   - Does `dest_sel = 1` activate a lookup that constrains some intermediate variable?
   - Does that intermediate variable force `sel = 1` through another constraint?

2. Example of a VALID implicit protection (bitwise.start with err=0):
   ```
   start=1, err=0 → sel_get_ctr = start*(1-err) = 1
     → INTEGRAL_TAG_LENGTH lookup activates
     → ctr is constrained to tag_byte_length (≥ 1 for valid tags)
     → ctr ≥ 1
     → BITW_SEL_CTR_NON_ZERO forces sel = 1
   ```

3. **Check ALL paths**: An implicit chain may protect one path but not another. Key questions:
   - Does the chain hold when error flags are set? (e.g., `err=1` may disable a lookup, breaking the chain)
   - Does the chain hold for all possible tag/type values? (e.g., FF tag might have byte_length=0)
   - Are there intermediate variables the attacker can control to break the chain?

**When implicit protection is INSUFFICIENT — error path exploitation:**

A common attack pattern exploits error-handling paths to bypass implicit protection:
```
dest_sel=1, intentional_error=1
  → error disables the protective lookup (e.g., sel_get_ctr = start*(1-err) = 0)
  → intermediate variable unconstrained (e.g., ctr can be 0)
  → sel NOT forced to 1 → ghost row is possible!
```

When this occurs, check whether the error path makes exploitation HARMLESS:
- Does the dispatch lookup from execution include the error flag in its tuple? (If so, the ghost row's error value must match what execution expects, which may block the attack)
- Does execution gate result write-back on `(1 - sel_opcode_error)`? (If so, forged results are never consumed)
- Does the sub-selector's consuming lookup include error-related columns in its tuple?

**Classification of implicit protection:**
- **Sound**: The constraint chain unconditionally forces `sel=1` when `dest_sel=1`, OR error paths make exploitation harmless. Still recommend explicit constraint for defense-in-depth.
- **Unsound**: There exists a path where `dest_sel=1, sel=0` is achievable AND the forged values are consumed. This is a real vulnerability.
- **Partial**: The parent selector is implicitly protected but sub-selectors are not. Sub-selectors used as destinations by other gadgets are vulnerable.

### Step 3: For Per-Opcode Selectors (Category B), Verify Decomposition Protection

For each per-opcode selector used as a lookup destination, check whether the opcode decomposition transitively forces `sel=1`:

1. Is the decomposition relation itself gated by `sel`? (e.g., `sel * (decomposition) = 0`)
2. Or does the decomposition equal `sel * something`? (e.g., `= sel_should_execute * op_id`)
3. If neither, the selector can be set independently of `sel`.

Also check dispatch patterns where one lookup uses `component.sel` (safe) but a separate dispatch for a different opcode uses `component.sel_op_*` (potentially unsafe). The inconsistency in destination selector choice is itself a signal to investigate.

### Step 4: For Phase/Mode Selectors (Category C), Check Consistency

For each phase/mode selector that gates a downstream interaction:
1. Check if there is a direct `phase_sel * (1 - sel) = 0` constraint
2. Check if SOME sibling phase selectors have such protection while OTHERS do not (inconsistency signal)
3. Check if the selector is derived from another selector that IS protected (e.g., `derived = sel * phase_sel * (1 - is_padded)` -- in this case `derived` is safe even if `phase_sel` itself isn't, because `derived` requires `sel=1`)

**Important nuance**: If the only downstream use of the phase selector is through a derived selector that multiplies by `sel` (e.g., `should_do_thing = sel * is_foo_phase * ...`), then `is_foo_phase` being unconstrained on inactive rows may be safe for that particular usage. But check ALL usages -- the selector might be used directly elsewhere.

### Step 5: Identify What Can Be Forged and Check Tuple Coverage

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

**Tuple coverage protection**: Even if a destination selector is unprotected, the lookup tuple itself may prevent exploitation:
- The tuple includes an **error flag** from the destination gadget (e.g., `bitwise.err`). If the dispatch lookup from execution includes `err` in its tuple, the ghost row's `err` must match what execution expects.
- The tuple includes **columns that are independently constrained** even when `sel=0` (rare but possible).

**Tuple does NOT provide protection when:**
- The consuming lookup is from a **different gadget** (not execution dispatch). For example, `keccak.pil` looking up into `bitwise.start_keccak` — the keccak lookup typically does NOT include `bitwise.err`.
- The tuple only includes committed polynomials that are unconstrained on inactive rows.

**Critical distinction**: A gadget may have TWO types of lookups into the same selector:
1. **Dispatch lookup** (from execution): often includes error flags → may provide protection
2. **Computation lookup** (from another gadget): typically does NOT include error flags → vulnerable

Both must be checked independently.

### Step 6: Assess Severity

| What Can Be Forged | Severity |
|---------------------|----------|
| Hash outputs (poseidon2, sha256, keccak) | **CRITICAL** - breaks all hash-based security |
| Bitwise/XOR intermediates used by hash gadgets | **CRITICAL** - corrupts hash internals (keccak theta, sha256 sigma) |
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
- **Category**: A (lifecycle) / A+ (sub-selector) / B (per-opcode dispatch) / C (phase/mode)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/destination_file.pil:line` (where the fix should be applied)
- **Destination Selector**: The unprotected column name (include whether it's a parent or sub-selector)
- **Source Lookups**: List of files/lookups that target this destination
- **Description**: What can be forged and impact
- **Implicit Protection**: None / Sound (describe chain) / Unsound (describe gap) / Partial (describe what's covered)
- **Error Path**: Whether the attacker can exploit error-handling paths to bypass implicit protection
- **Exploitability**: high (trivial ghost row) / medium (requires error-path or multi-lookup coordination) / mitigated (implicit protection is sound, but recommend defense-in-depth)
- **Fix**: `dest_sel * (1 - sel) = 0;`

### JSON Output (write to specified path)

```json
{
  "skill": "vm2-audit-t1-unprotected-destination-selector",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-t1-unprotected-destination-selector-<component>-<line>-<selector>",
    "category": "A|A+|B|C",
    "severity": "critical",
    "file": "pil/vm2/<component>.pil",
    "line": 58,
    "destination_selector": "<selector_name>",
    "selector_type": "parent|sub-selector|per-opcode|phase",
    "source_lookups": [
      "pil/vm2/<caller>.pil:<line> (<LOOKUP_NAME>)"
    ],
    "description": "<selector> used as lookup destination without <selector> * (1 - sel) = 0. Attacker can forge <what>.",
    "implicit_protection": "none|sound|unsound|partial",
    "error_path_exploitable": "yes|no|n/a",
    "exploitability": "high",
    "impact": "Critical - <impact description>",
    "fix": "Add: <selector> * (1 - sel) = 0;"
  }]
}
```
