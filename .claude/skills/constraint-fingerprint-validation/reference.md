# Constraint Fingerprint Validation — Reference

## Header skeleton

```cpp
#pragma once
// Include from parent if needed, e.g. hypernova_verification.hpp
// Requires recursion_helpers::FunctionFingerprint and validate infra already visible

namespace MyConstraintValidation {

// ── Protocol indices (squeeze counts, round counts) ─────────────────────────
static constexpr size_t TOTAL_SQUEEZES = ...;

// ── Deduplicated fingerprints ───────────────────────────────────────────────
inline constexpr FunctionFingerprint STAGE_A_ARITH = { ... };
// STAGE_B and STAGE_C alias STAGE_A_ARITH — same receive_commitment template

// ── Per-stage results ───────────────────────────────────────────────────────
struct StageAValidationResult {
    size_t arith_start = 0;
    size_t arith_end = 0;
    bool fingerprint_valid = false;
};

struct Result {
    StageAValidationResult stage_a;
    bool all_valid = false;
};

// ── Stage validators ────────────────────────────────────────────────────────
template <typename FF, typename CircuitBuilder, typename Analyzer>
StageAValidationResult validate_stage_a(CircuitBuilder& builder, Analyzer& analyzer, size_t arith_start)
{
    StageAValidationResult out;
    out.arith_start = arith_start;
    auto& arith = builder.blocks.arithmetic;
    out.fingerprint_valid = recursion_helpers::matches_fingerprint_at(
        builder, arith, arith_start, STAGE_A_ARITH);
    out.arith_end = arith_start + STAGE_A_ARITH.gate_count;
    return out;
}

// ── Orchestrator ────────────────────────────────────────────────────────────
template <typename FF, typename CircuitBuilder, typename Analyzer>
Result validate(CircuitBuilder& builder, Analyzer& analyzer)
{
    Result result;
    size_t cursor = 0; // or ACIR-anchored start from witness test

    result.stage_a = validate_stage_a<FF>(builder, analyzer, cursor);
    cursor = result.stage_a.arith_end;

    // result.stage_b = validate_stage_b(..., cursor);
    // ...

    result.all_valid = result.stage_a.fingerprint_valid /* && ... */;
    return result;
}

} // namespace MyConstraintValidation
```

---

## ACIR witness anchor test (Step 6 template)

```cpp
TEST_F(MyRecursionTestSuite, AcirMyConstraintWitnessGateDump)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_my_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    // Find arithmetic gates linked to constraint.key_hash / constraint.key[0]
    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    const auto gates = analyzer.get_variable_gates(key_hash_real);

    std::ofstream out("my_constraint_witness_gates.txt");
    for (auto [block_idx, gate_idx] : gates) {
        out << "block=" << block_idx << " gate=" << gate_idx << "\n";
    }

    // From earliest relevant arith gate, scan forward with matches_fingerprint_at
    // for first pipeline fingerprint (e.g. vk_hash or pre_eta)
    SUCCEED();
}
```

Run before locking `arith_start` constants in validation header.

---

## Deduplication example (from HN OINK dump)

Many stages share `{ 5, 0x8c7907ea98903f3, 0x8c7907ea98903f3, 5 }`:

- `HN_OINK:w_l`, `w_r`, `w_o`
- `HN_OINK:ecc_op_wire_0..3`
- `HN_OINK:databus_commitment_0..7`

Validation approach:

```cpp
inline constexpr FunctionFingerprint COMMITMENT_RECEIVE_ARITH = { 5, 0x8c7907ea98903f3ULL, ... };
static constexpr size_t NUM_WIRE_COMMS = 3;
static constexpr size_t NUM_ECC_OP_WIRES = 4;
static constexpr size_t NUM_DATABUS_COMMS = 8;

// validate_commitment_receive_chain(): loop NUM times at cursor += fp.gate_count
// Comment: identical transcript receive template; position distinguishes stages
```

---

## Cross-block chaining note

OINK `vk_hash` may end in arithmetic + poseidon2_ext + poseidon2_int.

Next stage `w_l` receive only adds arithmetic gates in block 4.

Chain rule:

1. Record `arith_end`, `poseidon2_ext_end`, `poseidon2_int_end` from vk_hash Result.
2. For `w_l` in arithmetic: start = vk_hash.arith_end.
3. If a stage first touches poseidon2_ext after only touching arithmetic before, start_ext = previous stage's ext_end **or** linked gates from arithmetic window (see `validate_arith_and_linked_poseidon_stages`).

Read verifier step source (`oink_verifier.cpp`, `hn_execute_oink_part`) when cross-block order is unclear.

---

## Integration test after Step 9

```cpp
TEST_F(MyRecursionTestSuite, AcirMyConstraintFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();
    auto setup = make_my_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat cs_copy = setup.program.constraints;

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

TEST_F(MyRecursionTestSuite, ValidateMyConstraintDetectsCorruption)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_my_kernel_circuit();
    auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    builder.blocks.arithmetic.q_2().set(sq[0] + 3, bb::fr(7));
    EXPECT_FALSE(MyConstraintValidation::validate(builder).all_valid);
}
```

---

## Build / run

```bash
cd barretenberg/cpp/build
cmake --build . --target noir_programs_boomerang_values_tests -j$(nproc)
./bin/noir_programs_boomerang_values_tests --gtest_filter='*MyConstraint*'
```
