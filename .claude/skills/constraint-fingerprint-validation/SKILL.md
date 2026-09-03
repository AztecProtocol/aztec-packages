---
name: constraint-fingerprint-validation
description: >-
  Phase 3: validate large protocol primitives via FunctionFingerprint chain from
  primitive_start; per-stage validate_* + orchestrator; verify opcode witness
  gates present in each primitive part flagged in Phase 2. Phase 3 of
  boomerang-constraint-validator. Use after Phase 2 primitive_start discovery.
---

# Constraint FunctionFingerprint Validation (Phase 3)

> **Orchestrator:** skill `boomerang-constraint-validator`. This file is **Phase 3 (Protocol primitive FP validation + witness link)** only.

## Purpose

With **`primitive_start_*`** from Phase 2, Phase 3:

1. Validates every **large protocol primitive** (Oink, Sumcheck, Shplemini, KZG, IPA finalize, …) via **FunctionFingerprint** — chained from `primitive_start`, covering the primitive **as a whole** (all internal dump stages in protocol order).
2. Confirms each primitive part that Phase 2 marked as using **opcode witnesses** actually contains **gates linked to those witnesses** inside the validated gate range.

Phase 3 does **not** re-derive witness layout or primitive start — it consumes Phase 1 dump + Phase 2 artifacts.

---

## Prerequisites

1. **Phase 1** — `*_functions_analysis.txt`: per-component / per-stage `FunctionFingerprint` lines in protocol order.
2. **Phase 2** — `*_witness_serialization.txt`, `*_witness_gate_map.txt`:
   - `primitive_start_*`, `first_primitive_part`, `last_serialization_part`
   - witness → **primitive part** map with aligned slots

Read **`primitive_start_*`** from Phase 2 (legacy: `circuit_build_start_*`). Do not guess offsets.

---

## Large protocol primitives

**Large primitive** = major verifier segment from family plan / Phase 1 dump, typically:

| Primitive | Typical internal stages (from dump tags) |
|-----------|-------------------------------------------|
| Oink | vk_hash, public_input_delta, commitments, alpha, … |
| Padding / gate challenge | padding, gate_challenge |
| Sumcheck | rounds + gate_challenge per round |
| Shplemini | batching, shplemini, kzg prep |
| KZG / pairing | kzg, pairing aggregation |
| Rollup extensions | IPA split, finalize, nested IPA verify |

Build list from Phase 1 dump: group consecutive stage tags under one large primitive name (match Phase 1 component map / family plan).

**Whole-primitive rule:** once `primitive_start` is correct, the first large primitive's `validate_*` chain starts there and runs through **all** its dump stages until the next large primitive boundary (squeeze boundary, block transition, or plan section). Do not validate isolated micro-stages without anchoring to the primitive entry.

---

## Default workflow

```text
Phase 3 Progress:
- [ ] Step 1: Read Phase 1 dump — list large primitives + internal stage tags + FP constants
- [ ] Step 2: Read Phase 2 artifacts — primitive_start, witness → primitive part map
- [ ] Step 3: Create/update <constraint>_validation.hpp + namespace
- [ ] Step 4: Dedupe FunctionFingerprint constants from dump
- [ ] Step 5: validate_<large_primitive>() per protocol segment (internal stage chain)
- [ ] Step 6: First stage of first large primitive starts at primitive_start_*
- [ ] Step 7: TEST — Acir*WitnessLinkIn<Primitive> per Phase 2 opcode-linked parts
- [ ] Step 8: Result structs + validate_<constraint>() orchestrator
- [ ] Step 9: Acir*FingerprintsMatchConstants + corruption tests
- [ ] Step 10: Focused gtest green
```

One step per change; run focused test after Step 9.

---

## Step 1 — Read dump + build primitive catalog

From `*_functions_analysis.txt`:

```text
Large primitive: OINK
  primitive_start source: Phase 2 first_primitive_part (e.g. C2_vk_hash)
  internal stages (protocol order):
    HN_OINK:vk_hash          → FP HN_OINK_VK_HASH_ARITH, …
    HN_OINK:w_l              → FP COMMITMENT_RECEIVE_ARITH (×N)
    …
  ends before: HN_SQUEEZE_GATE_CHALLENGE / next large primitive tag

Large primitive: MAIN_SUMCHECK
  starts after: previous primitive end / squeeze anchor
  internal stages: …
```

Skip serialization-only dump sections (Phase 2 `role=serialization`) — they are **not** FP-validated in Phase 3 unless family plan requires.

---

## Step 2 — Validation header

Create or update:

`barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/<constraint>_validation.hpp`

```cpp
namespace <ConstraintName>Validation {
// FP constants, Result structs, validate_<large_primitive>, validate_<constraint>
}
```

---

## Step 3 — FunctionFingerprint constants (dedupe)

Promote from dump; dedupe identical hash tuples; comment aliases.

Group constants under large primitive comments:

```cpp
// ── Large primitive: OINK (starts at primitive_start from Phase 2) ──
inline constexpr FunctionFingerprint OINK_VK_HASH_POSEIDON2_EXT = { … };
```

---

## Step 4 — validate_* per large primitive (internal chain)

For each **large primitive**, one orchestrating function that chains **all** internal stage validators in dump order:

```cpp
template <typename FF, typename CircuitBuilder, typename Analyzer>
OinkValidationResult validate_<constraint>_oink(CircuitBuilder& builder,
                                                Analyzer& analyzer,
                                                size_t oink_start)  // = primitive_start for first primitive
{
    OinkValidationResult result;
    size_t cursor = oink_start;

    result.vk_hash = validate_vk_hash_at<FF>(builder, analyzer, cursor, OINK_VK_HASH_…);
    cursor = result.vk_hash.arith_end; // or cross-block handoff

    // all OINK dump stages in order …
    result.fingerprint_valid = result.vk_hash.valid && /* all stages */;
    result.oink_end = cursor;
    return result;
}
```

**First large primitive:** pass `oink_start = primitive_start_*` from Phase 2 gate map (correct block: arith vs poseidon2_ext).

**Next large primitives:** start at previous primitive's documented end (squeeze + 1, or Result struct `*_end` field).

Use helpers: `matches_fingerprint_at`, linked poseidon validators, squeeze maps from `recursion_constraints_helper.hpp`.

**Forbidden:** full-circuit scan for each stage when cursor chain from `primitive_start` is available.

---

## Step 5 — Opcode witness link tests (Phase 2 → Phase 3 bridge)

For every **primitive part** in Phase 2 map where opcode witnesses **must** appear in gates (`role=circuit` or explicit witness-link flag):

Add test **before or alongside** FP integration test:

```cpp
TEST_F(..., Acir<Constraint>WitnessLinkIn<Oink>)
{
    const auto setup = make_<constraint>_acir_setup();
    Builder builder = create_circuit<Builder>(setup.program, setup.metadata);
    Analyzer analyzer(builder, false);
    const auto& c = setup.constraint(0);
    const auto proof_indices = add_public_inputs_to_proof(c.proof, c.public_inputs);

    // Load primitive_start from Phase 2 constants or re-derive in test helper
    const size_t primitive_start = …;

    // Example: first_primitive_part C2_vk_hash uses key_hash — gates must exist in validated range
    const uint32_t key_hash_real = builder.real_variable_index[c.key_hash];
    auto gates = collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, builder.blocks.poseidon2_external);

    ASSERT_FALSE(gates.empty());
    EXPECT_GE(gates.front(), primitive_start);  // or range check vs validate_* Result

    // For each Phase 2 row: primitive_part=X, slot=Y, witness=W
    // ASSERT get_variable_gates(W) intersects [part_start, part_end) from validation Result
}
```

**Rule:** if Phase 2 said primitive part `P` consumes opcode witness `W`, Phase 3 must have:

1. FP validation covering part `P`'s gate range, **and**
2. Test proving `get_variable_gates(W)` hits gates inside that range.

Reference: `ValidateHNOinkArithLinksToPos2Ext`, `validate_oink_subcircuit` witness checks in `recursion_constraints_helper.hpp`.

Parts with `role=serialization`: witness link test asserts gates **before** `primitive_start`, not inside crypto validators.

---

## Step 6 — Result structs

Per **large primitive** + per internal stage when debugging needed:

```cpp
struct OinkValidationResult {
    VkHashValidationResult vk_hash;
    size_t oink_start = 0;
    size_t oink_end = 0;
    bool fingerprint_valid = false;
};

struct Result {
    OinkValidationResult oink;
    SumcheckValidationResult main_sumcheck;
    // … one field per large primitive …
    bool all_valid = false;
};
```

Store `*_start` / `*_end` for witness link tests and Review.

---

## Step 7 — Top-level orchestrator

```cpp
template <typename FF, typename CircuitBuilder, typename Analyzer>
Result validate_<constraint>(CircuitBuilder& builder, Analyzer& analyzer,
                             const acir_format::RecursionConstraint& constraint)
{
    Result result;
    const size_t primitive_start = /* from Phase 2 pin or helper */;

    result.oink = validate_<constraint>_oink<FF>(builder, analyzer, primitive_start);
    result.main_sumcheck = validate_<constraint>_main_sumcheck<FF>(
        builder, analyzer, result.oink.oink_end /* or squeeze anchor */);

    // all large primitives in protocol order …
    result.all_valid = result.oink.fingerprint_valid && result.main_sumcheck.valid && …;
    return result;
}
```

Wire into:

- `Acir<Constraint>FingerprintsMatchConstants` (full pipeline on `create_circuit` builder)
- `MegaStaticAnalyzerAcir` / `graph_description_acir.cpp` when family handler exists

---

## Step 8 — Integration + corruption tests

```cpp
TEST_F(..., Acir<Constraint>FingerprintsMatchConstants)
{
    auto setup = make_<constraint>_acir_setup();
    Builder builder = create_circuit<Builder>(setup.program, setup.metadata);
    Analyzer analyzer(builder, false);
    auto result = ConstraintValidation::validate_<constraint>(builder, analyzer, setup.constraint(0));
    EXPECT_TRUE(result.all_valid);
}

TEST_F(..., Acir<Constraint>FingerprintsRejectCorruption)
{
    // corrupt gate inside validated region of one large primitive; expect all_valid == false
}
```

Run:

```bash
./bin/noir_programs_boomerang_values_tests --gtest_filter='*<Constraint>*Fingerprint*'
./bin/noir_programs_boomerang_values_tests --gtest_filter='*<Constraint>*WitnessLink*'
```

---

## Definition of done

| Step | Done when |
|------|-----------|
| 1 | Large primitive catalog from dump + Phase 2 start |
| 2–4 | Header + deduped FP constants |
| 5 | Each large primitive has chained validate_* over all internal dump stages |
| 6 | First primitive starts at Phase 2 `primitive_start_*` |
| 7 | Witness link test per Phase 2 opcode-linked primitive part |
| 8 | Result structs document ranges |
| 9 | Orchestrator + FP match + corruption tests pass |
| 10 | All large primitives in family plan covered |

**Blockers:** no Phase 3 without Phase 2 `primitive_start`; no skipping witness link for parts Phase 2 flagged.

---

## Anti-patterns

- Validating single micro-stage without whole-primitive chain from `primitive_start`.
- FP constants from CHONK copied to HONK without HONK dump.
- Skipping witness link tests («FP match is enough»).
- `validate_*` start at gate 0 or wrapper region.
- Missing large primitive from Phase 1 dump / family plan.
- Witness link asserted globally, not inside validated `[part_start, part_end)`.

---

## Canonical files

| Purpose | Path |
|---------|------|
| FP infra | `recursion_constraints_helper.hpp` |
| Whole Oink + links | `validate_oink_subcircuit`, `VkHashValidationResult` |
| INIT example | `HNInitValidation.hpp` |
| HN orchestrator | `hypernova_verification.hpp` |
| Witness link example | `boomerang_hn_recursion.test.cpp` — `ValidateHNOinkArithLinksToPos2Ext` |
| Phase 2 artifacts | `acir-witness-gate-discovery/SKILL.md` |

---

## Quick decision tree

```text
Phase 2 primitive_start pinned?
├─ No → acir-witness-gate-discovery
└─ Yes →
    ├─ Catalog large primitives from Phase 1 dump
    ├─ validate_<large_primitive> chains from primitive_start / prior end
    ├─ Acir*WitnessLinkIn* for Phase 2 opcode-linked parts
    ├─ validate_<constraint>() + corruption test
    └─ Review
```

Extended templates: [reference.md](reference.md).
