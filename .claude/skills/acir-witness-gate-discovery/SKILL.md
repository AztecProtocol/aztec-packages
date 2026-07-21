---
name: acir-witness-gate-discovery
description: >-
  Phase 2: parse opcode, align witnesses via serialization rules, map slots to
  primitive parts, discover primitive_start (first verifier gates from opcode
  witnesses). get_variable_gates on aligned indices only. Phase 2 of
  boomerang-constraint-validator.
---

# ACIR Witness Gate Discovery (Phase 2)

> **Orchestrator:** skill `boomerang-constraint-validator`. This file is **Phase 2 (Opcode → alignment → primitive map → primitive_start)** only.

## Hard rules

### 1. Same chain as Phase 1

```text
make_<constraint>_acir_setup()
  → create_circuit<Builder>(program, metadata)
  OR same witness builder + ctx as FingerPrintDump test
```

### 2. Parse opcode and serialization **before** `get_variable_gates`

```text
FORBIDDEN order:
  constraint.key_hash → get_variable_gates immediately

REQUIRED order:
  parse opcode struct
  → read serialization rules from production code
  → build aligned witness table (logical slot → witness index)
  → only then get_variable_gates on aligned indices
```

Calling `get_variable_gates` on raw `constraint.proof[i]` without knowing whether `i` is ACIR proof body, stitched proof, VK field, or commitment limb yields wrong clusters and wrong `circuit_build_start`.

---

## Prerequisites

Phase 1 complete:

- [ ] `<constraint>_component_map.txt` with `[WITNESS]` components
- [ ] `execute_<constraint>_mirrored` + production trace
- [ ] `*_functions_analysis.txt` + parity test passed

---

## Goal

Phase 2 delivers **`primitive_start`** — the correct beginning of the **verifier primitive** (where Phase 3 must anchor), not gate 0 and not wrapper-only witness binding.

Pipeline:

1. **Parse** opcode → **align** witnesses (serialization rules).
2. **Map** each aligned slot → **primitive part** from Phase 1 component map + production source order.
3. Identify **which opcode witnesses are processed first** when the primitive is built (production line order + earliest gates).
4. **`get_variable_gates`** on aligned slots; group by primitive part.
5. Pin **`primitive_start`** = first gate of the first **circuit** primitive part after the last **serialization** part.
6. Link Phase 1 fingerprint from `primitive_start`; write artifacts.

```text
create_*_constraint wrapper     → witnesses bound first (key, proof, …) — often NOT primitive_start
proof deserialize components    → serialization primitive parts
verifier.verify_proof → Oink…   → primitive body begins here
primitive_start                 → first circuit gates from opcode witnesses in verifier path
```

---

## Default workflow

```text
Phase 2 Progress:
- [ ] Step 0: Parse opcode — RecursionConstraint + proof_type + opcode index
- [ ] Step 1: Serialization rules — from production (file:line)
- [ ] Step 2: Aligned witness table — logical slot → witness_index → role
- [ ] Step 3: TEST — Acir*WitnessSerializationParse (blocker; no gates yet)
- [ ] Step 4: Witness → primitive part map + early processing order (production line order)
- [ ] Step 5: TEST — build circuit (same chain as Phase 1)
- [ ] Step 6: TEST — Acir*WitnessGateDump (aligned slots, grouped by primitive part)
- [ ] Step 7: TEST — Acir*PrimitiveStartDiscovery → pin primitive_start
- [ ] Step 8: TEST — FP link from primitive_start + serialization boundary asserts
- [ ] Step 9: Artifacts — _witness_serialization.txt + _witness_gate_map.txt (includes primitive_start)
- [ ] Step 10: All Phase 2 tests green
```

One step per change, then run focused test.

---

## Step 0 — Parse opcode

Load the **exact** constraint instance the boomerang test uses:

```cpp
const auto& constraint = setup.program.constraints.honk_recursion_constraints.at(0);
// or hn_recursion_constraints / chonk_recursion_constraints — match family
const uint32_t proof_type = constraint.proof_type;
const size_t opcode_idx = setup.program.constraints.original_opcode_indices.honk_recursion_constraints.at(0);
```

Read how ACIR deserializes into struct (`acir_to_constraint_buf.cpp` — `RecursiveAggregation`):

| ACIR arg | `RecursionConstraint` field |
|----------|----------------------------|
| `verification_key` | `key[]` |
| `proof` | `proof[]` (body **without** pub inputs in ACIR layout) |
| `public_inputs` | `public_inputs[]` |
| `key_hash` | `key_hash` |
| `proof_type` | `proof_type` |
| `predicate` | `predicate` |

Record in artifact header: opcode index, proof_type name, vector sizes (`key.size()`, `proof.size()`, `public_inputs.size()`).

Family quirks (must note in parse output):

| Family | Quirk |
|--------|-------|
| HN / IVC | `constraint.proof` often `{}`; proof witnesses from `ivc->verification_queue` — parse queue entry, not empty vector |
| HONK rollup | `add_public_inputs_to_proof` then verifier may **split** honk vs IPA — read `ultra_verifier.cpp` |
| CHONK | `proof_indices = add_public_inputs_to_proof(proof, public_inputs)` then MegaZK body layout |
| Predicate witness | extra conditional_assign witnesses — tag separately in alignment table |

---

## Step 1 — Serialization rules (from production code)

Document rules **before** gate search. Minimum set for all recursion opcodes:

### Rule A — ACIR vs Barretenberg proof layout

From `utils.hpp` / `add_public_inputs_to_proof`:

```text
ACIR stores:
  public_inputs[]     — extracted pub inputs
  proof[]             — proof WITHOUT those pub inputs

Production stitches before fields_from_witnesses:
  proof_indices = add_public_inputs_to_proof(constraint.proof, constraint.public_inputs)
  // order: { public_inputs[0..n-1] | proof[0..m-1] }
```

Every `get_variable_gates` on proof data must use **`proof_indices[i]`**, not blind `constraint.proof[i]`, unless test proves `public_inputs` is empty.

### Rule B — VK and key_hash

```cpp
vk_fields = fields_from_witnesses(builder, constraint.key);           // 1:1 index order
vk_hash   = field_ct::from_witness_index(&builder, constraint.key_hash);
```

Aligned slots: `key[i]` → VK limb `i`; `key_hash` → single witness.

### Rule C — Proof body / commitment groups (when Oink deserialize applies)

From `recursion_constraints_helper.hpp`:

```text
FRS_PER_COMMITMENT = 4
group g commitment limbs: proof_body[g*4 + 0..3]
```

Map group index → verifier object (wire comms, sorted list, …) by reading `validate_oink_subcircuit` / family plan — not by guessing offset.

### Rule D — Family-specific post-stitch transforms

Read `create_*_recursion_constraints` for extra steps **after** stitch:

- rollup: split combined proof into honk + IPA segments (`ultra_verifier.hpp`)
- root rollup: finalize + nested IPA claims (`recursion_constraint_output.cpp`)
- write_vk mode: `populate_fields` overwrites witness values — note if test uses write_vk

Write rules to `<constraint>_witness_serialization.txt`:

```text
# Opcode: honk_recursion_constraints[0] proof_type=ROOT_ROLLUP_HONK
# Rule A: proof_indices[i] = i < pub.size ? public_inputs[i] : proof[i - pub.size]
# Rule B: key[j] = VK field j
# Rule C: commitment group 0 = proof_indices[base..base+3]  (base from OINK layout table)
# Production refs: honk_recursion_constraint.cpp:L53-L56, utils.cpp:add_public_inputs_to_proof
```

---

## Step 2 — Aligned witness table

Build table **in memory and in artifact** before any gate call:

```text
| logical_slot           | source_rule | witness_index | component | role           |
|------------------------|-------------|---------------|-----------|----------------|
| key_hash               | Rule B      | c.key_hash    | C0        | wrapper        |
| vk_field_0             | Rule B      | c.key[0]      | C0        | wrapper        |
| stitched_proof_0       | Rule A      | pub[0] or …   | C3        | serialization  |
| commitment_g0_fr0      | Rule C      | pi[base+0]    | C3        | serialization  |
| …                      |             |               |           |                |
```

Helper in test (reuse across dump + filter tests):

```cpp
std::vector<uint32_t> proof_indices =
    add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);

auto stitched_at = [&](size_t i) -> uint32_t {
    BB_ASSERT_LT(i, proof_indices.size());
    return proof_indices[i];
};
```

For HN empty `constraint.proof`: build `proof_indices` from the **same source** production uses (IVC queue proof witness indices), documented in Step 0.

---

## Step 3 — Serialization parse test (blocker before gates)

```cpp
TEST_F(..., Acir<Constraint>WitnessSerializationParse)
{
    const auto setup = make_<constraint>_acir_setup();
    const auto& c = setup.constraint(0);

    const auto proof_indices = add_public_inputs_to_proof(c.proof, c.public_inputs);

    // Rule A: stitched length
    EXPECT_EQ(proof_indices.size(), c.proof.size() + c.public_inputs.size());

    // Rule A: prefix is public inputs
    for (size_t i = 0; i < c.public_inputs.size(); ++i) {
        EXPECT_EQ(proof_indices[i], c.public_inputs[i]);
    }
    for (size_t i = 0; i < c.proof.size(); ++i) {
        EXPECT_EQ(proof_indices[c.public_inputs.size() + i], c.proof[i]);
    }

    // Rule C example: commitment group 0 base
    if (proof_indices.size() >= OINK_PROOF_COMMITMENT_WITNESSES) {
        const size_t base = 0 * FRS_PER_COMMITMENT;
        EXPECT_EQ(get_commitment_group_witness_indices(proof_indices, 0)[0], proof_indices[base]);
    }

    // Write aligned table for human review
    std::ofstream out("<constraint>_witness_serialization.txt");
    out << "# proof_type=" << c.proof_type << " key.size=" << c.key.size() << "\n";
    // dump rows from aligned witness table
    SUCCEED();
}
```

**Do not add gate tests until Step 3 passes.**

---

## Step 4 — Witness → primitive part map + early processing order

After alignment, map slots to **primitive parts** (Phase 1 component map IDs) and record **production processing order**.

### 4a. Read production top-to-bottom

In `create_*_recursion_constraints` (and first callee e.g. `verify_proof` → Oink), list **every statement that reads opcode witnesses**, in order:

Example HONK (`honk_recursion_constraint.cpp`):

```text
Order | Production lines        | Opcode witnesses consumed      | Primitive part | Gates?
  1   | fields_from_witnesses   | key[]                          | C0 wrapper     | wiring only
  2   | from_witness_index      | key_hash                       | C0 wrapper     | wiring only
  3   | fields_from_witnesses   | proof_indices (stitched)       | C0 wrapper     | wiring only
  4   | predicate / conditional | predicate, maybe key/proof     | C0 wrapper     | optional
  5   | verify_proof entry      | vk_and_hash, proof_fields      | C1 primitive   | yes
  6   | Oink vk_hash            | key_hash (via vk_and_hash)     | C2 vk_hash     | yes — circuit
  …   | receive_commitment      | proof limbs                    | C3 deserialize | yes — serialization
```

**First task of Phase 2:** from this table, mark:

- **`early_opcode_witnesses`** — slots touched before `verify_proof` / primitive entry (wrapper).
- **`first_primitive_part`** — first component **inside** verifier that adds gates from opcode witnesses (often first Oink stage using `key_hash`, NOT first proof limb deserialize).
- **`last_serialization_part`** — last component with `role=serialization` before primitive body.

Write to `<constraint>_witness_serialization.txt` (append section) or `<constraint>_primitive_witness_map.txt`:

```text
# Early processing order (production)
1 wrapper | key[0..n] | witness_index=…
2 wrapper | key_hash    | witness_index=…
3 wrapper | stitched_proof[0..m] | …
# First primitive part with gates: C2_vk_hash (uses key_hash)
# Last serialization part before primitive body: C3_commitment_gN
```

### 4b. Slot → primitive part table

Extend aligned table:

```text
| logical_slot      | witness_index | primitive_part | role           | prod_order |
|-------------------|---------------|----------------|----------------|------------|
| key_hash          | c.key_hash    | C2_vk_hash     | circuit        | 6          |
| commitment_g0_fr0 | pi[0]         | C3_deserialize | serialization  | 8          |
```

Every aligned row must have `primitive_part` matching Phase 1 component map.

Optional test (no gates yet):

```cpp
TEST_F(..., Acir<Constraint>WitnessPrimitiveMap) {
    // Assert production order documented: first primitive part id matches family plan
    // Assert every aligned slot has primitive_part + role
    // Assert first_primitive_part has role=circuit OR is explicit verifier entry
}
```

---

## Step 5 — Production circuit for analysis

Same as before — after serialization test:

```cpp
Builder builder = create_circuit<Builder>(setup.program, setup.metadata);
Analyzer analyzer(builder, false);
```

---

## Step 6 — Witness gate dump (by primitive part)

```cpp
TEST_F(..., Acir<Constraint>WitnessGateDump)
{
    // ... build circuit ...
    const auto proof_indices = add_public_inputs_to_proof(c.proof, c.public_inputs);

    out << "# primitive_parts from Step 4\n";

    const auto dump_slot = [&](const char* part, const char* slot, uint32_t w) {
        out << "part=" << part << " slot=" << slot << " w=" << w << "\n";
        size_t gate_min = SIZE_MAX;
        for (auto [blk, g] : analyzer.get_variable_gates(builder.real_variable_index[w])) {
            out << "  block=" << blk << " gate=" << g << "\n";
            gate_min = std::min(gate_min, g);
        }
        out << "  gate_min=" << gate_min << "\n";
    };

    dump_slot("C2_vk_hash", "key_hash", c.key_hash);
    dump_slot("C3_deserialize", "commitment_g0_fr0", proof_indices[0 * FRS_PER_COMMITMENT + 0]);
    // every row: primitive_part + aligned slot
}
```

---

## Step 7 — Primitive start discovery (primary Phase 2 deliverable)

**Definition:** `primitive_start` is the earliest gate index (per block) where the **verifier primitive body** begins — first **circuit** primitive part that consumes opcode witnesses **after** all **serialization** parts that precede it in production order.

**Not** primitive_start:

- wrapper witness binding with no gates yet;
- global gate 0 of full circuit;
- first proof limb if that limb is still deserialization (serialization part).

**Procedure:**

1. From Step 4: identify `first_primitive_part` (circuit) and `last_serialization_part`.
2. From Step 6 dump: for each primitive part, compute `gate_min` / `gate_max` per block (min over all slots in that part).
3. `serialization_end` = max `gate_max` over all serialization parts that run **before** `first_primitive_part` in prod_order.
4. `primitive_start` = min `gate_min` of `first_primitive_part` on anchor block (usually arith or poseidon2_ext for vk_hash).
5. Assert `primitive_start > serialization_end` (or on different block with documented cross-block rule).

```cpp
TEST_F(..., Acir<Constraint>PrimitiveStartDiscovery)
{
    const auto setup = make_<constraint>_acir_setup();
    Builder builder = create_circuit<Builder>(setup.program, setup.metadata);
    Analyzer analyzer(builder, false);
    const auto& c = setup.constraint(0);
    const auto proof_indices = add_public_inputs_to_proof(c.proof, c.public_inputs);

    // Compute gate_min per primitive part from aligned slots (helper or inline)
    const size_t serialization_end = /* max gate from C3_* parts */;
    const size_t primitive_start = /* min gate from first circuit part, e.g. C2 vk_hash key_hash in p2_ext */;

    EXPECT_GT(primitive_start, serialization_end);

    std::ofstream out("<constraint>_witness_gate_map.txt");
    out << "first_primitive_part=C2_vk_hash\n";
    out << "last_serialization_part=C3_commitment_gN\n";
    out << "serialization_end_arith=" << serialization_end << "\n";
    out << "primitive_start_poseidon2_ext=" << primitive_start << "\n";
    out << "early_opcode_witnesses=key[],key_hash,stitched_proof[]\n";
    // slot → part → gate ranges table
}
```

**Phase 3 must use `primitive_start_*` from this test** — also referred to as `circuit_build_start_*` in older artifacts (same value; prefer `primitive_start` in new files).

Cross-check: `first_primitive_part` dump tag must match first Phase 1 fingerprint **after** serialization sections in `*_functions_analysis.txt`.

---

## Step 8 — Fingerprint link + boundary asserts

```cpp
auto& block = builder.blocks.poseidon2_external; // or arith — match first_primitive_part
EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
    builder, block, primitive_start, FIRST_POST_SERIALIZE_FP));

// Serialization slots: all gates < primitive_start on shared block
const uint32_t fr0_real = builder.real_variable_index[proof_indices[base + 0]];
for (auto [blk, g] : analyzer.get_variable_gates(fr0_real)) {
    if (blk == ANCHOR_BLOCK) {
        EXPECT_LT(g, primitive_start);
    }
}
```

---

## Step 9 — Artifacts

**`<constraint>_witness_serialization.txt`** (Steps 3–4):

- serialization rules + aligned witness table
- early processing order + witness → primitive part map

**`<constraint>_witness_gate_map.txt`** (Steps 6–7):

- `first_primitive_part`, `last_serialization_part`, `early_opcode_witnesses`
- `serialization_end_*`, `primitive_start_*` (alias `circuit_build_start_*`)
- per-part gate_min / gate_max table

Phase 3 anchors at **`primitive_start_*`**.

---

## Definition of done

| Step | Done when |
|------|-----------|
| 0–3 | Opcode parsed; serialization aligned; parse test passes |
| 4 | Witness → primitive part map + early processing order documented |
| 5 | Circuit = same chain as Phase 1 |
| 6 | Gate dump grouped by primitive part with gate_min/max |
| 7 | **`primitive_start` pinned**; serialization_end < primitive_start |
| 8 | First Phase 1 FP matches from primitive_start |
| 9 | Both artifacts written |
| 10 | Focused gtest filter green |

**Blockers:**

- No gate tests before Step 3.
- No Phase 3 without Step 7 **`primitive_start`**.
- Using gate 0 or first wrapper witness as start without production order proof.

---

## Anti-patterns

- `get_variable_gates(constraint.proof[i])` ignoring stitch / primitive part map.
- **`primitive_start = 0`** or first aligned witness without production order + gate_min analysis.
- Treating wrapper witness binding (Step 1 of create_*) as primitive start.
- Treating first proof limb gates as primitive start when that part is `role=serialization`.
- Skipping Step 4 primitive part map («components obvious from dump»).
- Gate dump before serialization parse test.

---

## Canonical files

| Topic | Path |
|-------|------|
| Stitch pub into proof | `dsl/acir_format/utils.hpp`, `utils.cpp` — `add_public_inputs_to_proof` |
| ACIR → struct | `acir_to_constraint_buf.cpp` — `RecursiveAggregation` |
| HONK wiring | `honk_recursion_constraint.cpp` L51–57 |
| CHONK wiring | `chonk_recursion_constraints.cpp` L78–79 |
| Commitment layout | `recursion_constraints_helper.hpp` — `FRS_PER_COMMITMENT`, `get_commitment_group_witness_indices` |
| Rollup split / finalize | `ultra_verifier.cpp`, `recursion_constraint_output.cpp` |
| Phase 1 map | `acir-constraint-fingerprint/SKILL.md` |

---

## After Phase 2

Orchestrator → **Phase 3** (`constraint-fingerprint-validation`) with `primitive_start_*` from artifact.
