---
name: vm2-audit-t1-unprotected-destination-selector
description: Audit VM2/AVM PIL files for unprotected lookup/permutation destination selectors. When a lifecycle selector (start, end, write, etc.) or a derived sub-selector (start_keccak, start_sha256, etc.) is used as a destination selector in a lookup but lacks a constraint tying it to the main sel, a malicious prover can forge computation results by setting dest_sel=1 on inactive rows (sel=0), bypassing all gadget constraints. Includes analysis of implicit protection chains and error-path exploitation vectors.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 2.0.0
---

# VM2 Unprotected Destination Selector Audit

## Purpose
Detect destination selectors in lookups/permutations that lack implication constraints, allowing malicious provers to forge computation results on inactive rows.

## When to Use
- Auditing multi-row gadget PIL files (poseidon2_hash, merkle_check, sha256, keccak, bitwise, etc.)
- Reviewing any PIL file that exposes lifecycle selectors (start, end, write) as lookup destinations
- Reviewing files with **derived sub-selectors** (start_keccak, start_sha256, sel_write_x) used as destinations by other gadgets
- Security review of hash/tree gadgets where forging outputs would be critical
- Verifying that implicit protection mechanisms are actually sound

## When NOT to Use
- Auditing source-side selector issues (use `vm2-audit-t1-selector-outside-active`)
- Reviewing precomputed/constant tables (destination rows are fixed)
- Non-PIL code review

## Severity Assessment

- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

## The Bug Pattern

This vulnerability is distinct from source-side ghost row injection. Here, the **destination** selector in a lookup is unprotected:

**Vulnerable pattern** - destination gadget missing protection:
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

**The attack**: A malicious prover creates a ghost row in the gadget trace:
- `sel = 0` (no constraints enforced!)
- `start = 1` (matches the lookup destination selector)
- `input_0, input_1, input_2` = real inputs from the caller
- `output` = ARBITRARY FAKE VALUE (not the real hash!)

The lookup succeeds because `start=1` matches the destination selector, and the tuple values match. But since `sel=0`, no constraint verifies the output is a valid computation of the inputs.

**Sub-selector variant** - derived selectors used as destinations by OTHER gadgets:
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

**Sub-selector attack**: The prover creates a ghost row in the bitwise trace with `sel=0, start_keccak=1`, and arbitrary `acc_ic` (forged XOR output). The keccak lookup matches the ghost row. Since `sel=0`, no byte-level correctness is enforced. This forges arbitrary XOR results inside the keccak permutation.

**Key insight**: Even if `start` itself is implicitly protected (e.g., via constraint chains that force `sel=1` when `start=1, err=0`), sub-selectors derived from `start` may NOT inherit that protection. The attacker can intentionally trigger an error condition (making `err=1`) to reach a state where `start=1, start_keccak=1, sel=0` — all constraints bypassed.

**Fixed pattern**:
```pil
#[SELECTOR_ON_START]
start * (1 - sel) = 0;  // start=1 requires sel=1, enforcing all constraints

// Or for sub-selectors specifically:
start_keccak * (1 - sel) = 0;
start_sha256 * (1 - sel) = 0;
```

## Why This Is Critical

Unlike source-side ghost rows (which need matching destinations), destination-side ghost rows are **trivially exploitable**:
1. The attacker controls all column values on the ghost row
2. No constraints are enforced (sel=0 means skippable)
3. External lookups will match the ghost row as a valid destination
4. The attacker can claim arbitrary computation results (fake hashes, fake proofs)

## Real-World Example: poseidon2_hash.pil (PR #19853)

**The vulnerability**: `poseidon2_hash.start` was used as a destination selector by 6+ lookups from `public_data_check.pil`, `address_derivation.pil`, and `class_id_derivation.pil`. The `end` selector was protected but `start` was not.

**The exploit** (class_id forgery):
1. Attacker creates a valid 2-round poseidon2 computation with chosen inputs that happens to use the real bytecode in round 2
2. Attacker creates a FORGED ghost row: `sel=0, start=1, input=(real_artifact, real_private_root), output=fake_class_id`
3. Lookup 1 (into `start`): matches the forged ghost row
4. Lookup 2 (into `end`): matches the attacker's valid computation end row
5. Result: `class_id_derivation` accepts `fake_class_id` for real contract inputs

**Impact**: Complete class_id forgery, address derivation bypass, public data tree manipulation.

## Real-World Example: bitwise.pil (Sub-Selector Variant)

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

### Step 1: Find All Lookup/Permutation Destinations

Find interactions where the destination selector is a lifecycle column (not just `sel`):

```bash
# Find lookups with named destination selectors (not just trace.sel)
grep -rn "^.*in.*\.\(start\|end\|write\|latch\|last\|first\)" pil/vm2/ --include="*.pil"

# Find destinations using sub-selectors (derived from lifecycle selectors)
grep -rn "^.*in.*\.\(sel_\|is_\|should_\)" pil/vm2/ --include="*.pil"

# CRITICAL: Find destinations using derived/prefixed selectors (start_keccak, start_sha256, etc.)
grep -rn "^.*in.*\.\(start_\|end_\|sel_write\|sel_read\)" pil/vm2/ --include="*.pil"
```

**Important**: Sub-selectors (e.g., `start_keccak`, `start_sha256`) are often used as lookup destinations by OTHER gadgets (keccak, sha256) but are defined WITHIN a different gadget (bitwise). These cross-gadget lookups are particularly dangerous because the sub-selector's protection status may not be obvious when reviewing only the consuming gadget.

Note that these patterns are NOT comprehensive. They serve as a good first pass, but every PIL file must be manually reviewed to determine whether or not they have such destination selectors.

### Step 2: For Each Destination Selector, Check Explicit Protection

Go to the destination file and verify the selector is constrained:

```bash
# Check if destination selector has implication constraint
# In the destination file, look for: dest_sel * (1 - sel) = 0
grep -n "start.*(1 - sel)\|(1 - sel).*start" pil/vm2/<gadget>.pil
grep -n "end.*(1 - sel)\|(1 - sel).*end" pil/vm2/<gadget>.pil
grep -n "write.*(1 - sel)\|(1 - sel).*write" pil/vm2/<gadget>.pil

# Also check combined forms
grep -n "(start + end).*(1 - sel)" pil/vm2/<gadget>.pil

# CRITICAL: Check sub-selectors too (start_keccak, start_sha256, etc.)
grep -n "start_\w*.*(1 - sel)\|(1 - sel).*start_\w*" pil/vm2/<gadget>.pil
```

Again, these patterns may not catch every form of protection, so manual review is necessary.

**Missing constraint if**: The destination selector is a `pol commit` boolean, used as a destination in a lookup/permutation, but has NO `dest_sel * (1 - sel) = 0` constraint.

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

### Step 3: Identify What Can Be Forged

For each unprotected destination, determine what tuple columns the attacker controls:

```bash
# Find the full lookup tuple
grep -B2 -A5 "in.*<gadget>\.start" pil/vm2/ --include="*.pil" -r
```

Key columns to check:
- **output/result columns**: Can the attacker claim arbitrary computation results?
- **input columns**: Are these constrained by the source, making them fixed?
- **metadata columns** (rounds, length): Must these match specific values?

### Step 3b: Check Lookup Tuple Coverage

Even if a destination selector is unprotected, the **lookup tuple itself** may prevent exploitation if it includes columns that the attacker cannot freely control on the ghost row:

```bash
# Examine the full tuple of each consuming lookup
grep -B2 -A8 "in.*<gadget>\.start_keccak\|in.*<gadget>\.start_sha256" pil/vm2/ --include="*.pil" -r
```

**Tuple provides protection when:**
- The tuple includes an **error flag** from the destination gadget (e.g., `bitwise.err`). If the dispatch lookup from execution includes `err` in its tuple, then the ghost row's `err` value must match what the execution trace expects. If execution only dispatches with `err=0`, a ghost row with `err=1` won't match.
- The tuple includes **columns that are independently constrained** even when `sel=0` (rare but possible).

**Tuple does NOT provide protection when:**
- The consuming lookup is from a **different gadget** (not execution dispatch). For example, `keccak.pil` looking up into `bitwise.start_keccak` — the keccak lookup typically does NOT include `bitwise.err` in its tuple.
- The tuple only includes committed polynomials that are unconstrained on inactive rows.

**Critical distinction**: A gadget may have TWO types of lookups into the same selector:
1. **Dispatch lookup** (from execution): often includes error flags → may provide protection
2. **Computation lookup** (from another gadget): typically does NOT include error flags → vulnerable

Both must be checked independently.

### Step 4: Assess Severity

| What Can Be Forged | Severity |
|---------------------|----------|
| Hash outputs (poseidon2, sha256, keccak) | **CRITICAL** - breaks all hash-based security |
| Bitwise/XOR intermediates used by hash gadgets | **CRITICAL** - corrupts hash internals (keccak theta, sha256 sigma) |
| Merkle tree operations | **CRITICAL** - fake proofs of inclusion/non-inclusion |
| Address/class_id derivation | **CRITICAL** - identity forgery |
| Comparison results (gt, lt) | **HIGH** - bypass range/comparison checks |
| Memory reads | **HIGH** - read arbitrary values |
| Precomputed table lookups | **LOW** - table is fixed, can't forge |

### Step 5: Check for Multi-Lookup Patterns

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
    "id": "vm2-audit-t1-unprotected-destination-selector-poseidon2_hash-58-start",
    "severity": "critical",
    "file": "pil/vm2/poseidon2_hash.pil",
    "line": 58,
    "destination_selector": "start",
    "selector_type": "parent",
    "source_lookups": [
      "pil/vm2/trees/public_data_check.pil:212 (LOW_LEAF_POSEIDON2_0)",
      "pil/vm2/bytecode/class_id_derivation.pil:32 (CLASS_ID_POSEIDON2_0)"
    ],
    "description": "poseidon2_hash.start used as lookup destination without start * (1 - sel) = 0. Attacker can forge hash outputs for multi-round computations.",
    "implicit_protection": "none",
    "error_path_exploitable": "n/a",
    "exploitability": "high",
    "impact": "Critical - breaks hash security for public data trees, address derivation, class ID verification",
    "fix": "Add: start * (1 - sel) = 0;"
  }]
}
```
