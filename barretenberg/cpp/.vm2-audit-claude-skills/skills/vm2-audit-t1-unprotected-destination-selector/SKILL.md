---
name: vm2-audit-t1-unprotected-destination-selector
description: Audit VM2/AVM PIL files for unprotected lookup/permutation destination selectors. When a lifecycle selector (start, end, write, etc.) is used as a destination selector in a lookup but lacks a constraint tying it to the main sel, a malicious prover can forge computation results by setting dest_sel=1 on inactive rows (sel=0), bypassing all gadget constraints.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Unprotected Destination Selector Audit

## Purpose
Detect destination selectors in lookups/permutations that lack implication constraints, allowing malicious provers to forge computation results on inactive rows.

## When to Use
- Auditing multi-row gadget PIL files (poseidon2_hash, merkle_check, sha256, keccak, etc.)
- Reviewing any PIL file that exposes lifecycle selectors (start, end, write) as lookup destinations
- Security review of hash/tree gadgets where forging outputs would be critical

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

**Fixed pattern**:
```pil
#[SELECTOR_ON_START]
start * (1 - sel) = 0;  // start=1 requires sel=1, enforcing all constraints
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

## Workflow

### Step 1: Find All Lookup/Permutation Destinations

Find interactions where the destination selector is a lifecycle column (not just `sel`):

```bash
# Find lookups with named destination selectors (not just trace.sel)
grep -rn "^.*in.*\.\(start\|end\|write\|latch\|last\|first\)" pil/vm2/ --include="*.pil"

# Also find destinations using sub-selectors
grep -rn "^.*in.*\.\(sel_\|is_\|should_\)" pil/vm2/ --include="*.pil"
```

Note that these patterns are NOT comprehensive. They serve as a good first pass, but every PIL file must be manually reviewed to determine whether or not they have such destination selectors.

### Step 2: For Each Destination Selector, Check Protection

Go to the destination file and verify the selector is constrained:

```bash
# Check if destination selector has implication constraint
# In the destination file, look for: dest_sel * (1 - sel) = 0
grep -n "start.*(1 - sel)\|(1 - sel).*start" pil/vm2/<gadget>.pil
grep -n "end.*(1 - sel)\|(1 - sel).*end" pil/vm2/<gadget>.pil
grep -n "write.*(1 - sel)\|(1 - sel).*write" pil/vm2/<gadget>.pil

# Also check combined forms
grep -n "(start + end).*(1 - sel)" pil/vm2/<gadget>.pil
```

Again, these patterns may not catch every form of protection, so manual review is necessary.

**Missing constraint if**: The destination selector is a `pol commit` boolean, used as a destination in a lookup/permutation, but has NO `dest_sel * (1 - sel) = 0` constraint.

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

### Step 4: Assess Severity

| What Can Be Forged | Severity |
|---------------------|----------|
| Hash outputs (poseidon2, sha256, keccak) | **CRITICAL** - breaks all hash-based security |
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
    "id": "vm2-audit-t1-unprotected-destination-selector-poseidon2_hash-58-start",
    "severity": "critical",
    "file": "pil/vm2/poseidon2_hash.pil",
    "line": 58,
    "destination_selector": "start",
    "source_lookups": [
      "pil/vm2/trees/public_data_check.pil:212 (LOW_LEAF_POSEIDON2_0)",
      "pil/vm2/bytecode/class_id_derivation.pil:32 (CLASS_ID_POSEIDON2_0)"
    ],
    "description": "poseidon2_hash.start used as lookup destination without start * (1 - sel) = 0. Attacker can forge hash outputs for multi-round computations.",
    "exploitability": "high",
    "impact": "Critical - breaks hash security for public data trees, address derivation, class ID verification",
    "fix": "Add: start * (1 - sel) = 0;"
  }]
}
```
