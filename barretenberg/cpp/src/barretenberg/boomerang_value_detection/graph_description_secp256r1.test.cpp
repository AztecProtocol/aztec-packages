// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"

using namespace bb;
using namespace cdg;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = UltraCircuitBuilder;
using secp256r1_ct = stdlib::secp256r1<Builder>;
using element_ct = secp256r1_ct::Group;
using scalar_ct = secp256r1_ct::ScalarField;
using witness_ct = stdlib::witness_t<Builder>;

namespace {

template <typename Bigfield> void fix_bigfield(const Bigfield& bf)
{
    stdlib::bigfield_test_access::fix_witness_in_place(bf);
}

/**
 * @brief Fix both coordinates of a biggroup element so the analyzer does not flag externally-visible
 * input/output limbs.
 */
void fix_biggroup_element(const element_ct& point)
{
    fix_bigfield(point.x());
    fix_bigfield(point.y());
}

// Variables-in-one-gate emitted by `secp256r1_ecdsa_mul` after `finalize_circuit()`.
//
// All 10 come from `T2_neg.conditional_select(T2, beta2_neg)` in `biggroup_secp256r1.hpp`. A
// biggroup conditional_select expands to two bigfield `conditional_assign`s (one per coordinate),
// each emitting 5 single-row arithmetic gates of the form
//     w_4 = w_o · (1 - cond)   (q_arith=1, q_m=-1, q3=1, q4=-1; `cond` is the shared w_l)
// — one per bigfield limb (4 binary basis + 1 prime basis). 2 coords × 5 limbs = 10.
//
// Each gate fully pins its `w_4`; the analyzer's "in one gate" heuristic is a known false positive
// for this single-row conditional-assign pattern (raw scan confirms exactly 1 occurrence per var
// in the trace). Input-independence verified by `ecdsa_mul_edge_cases`.
constexpr size_t EXPECTED_ECDSA_MUL_ONE_GATE_VARS = 10;

void run_ecdsa_mul_circuit_and_check(const secp256r1_ct::ScalarFieldNative& u1_native,
                                     const secp256r1_ct::ScalarFieldNative& u2_native,
                                     const secp256r1_ct::AffineElementNative& pubkey_native,
                                     size_t expected_one_gate)
{
    Builder builder;
    element_ct pubkey = element_ct::from_witness(&builder, pubkey_native);
    scalar_ct u1 = scalar_ct::from_witness(&builder, u1_native);
    scalar_ct u2 = scalar_ct::from_witness(&builder, u2_native);
    fix_biggroup_element(pubkey);
    fix_bigfield(u1);
    fix_bigfield(u2);

    auto output = element_ct::secp256r1_ecdsa_mul(pubkey, u1, u2);
    fix_biggroup_element(output.result);

    builder.finalize_circuit();
    EXPECT_TRUE(CircuitChecker::check(builder));
    auto graph = StaticAnalyzer(builder);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), expected_one_gate);
}

} // namespace

/**
 * @brief Static analysis of `secp256r1_fixed_base_mul` on a random witness scalar.
 *
 * Inputs and outputs are fixed so the count reflects only the internal wiring (plookup reads +
 * chain-adds + offset subtract).
 */
TEST(boomerang_secp256r1, fixed_base_mul)
{
    Builder builder;
    auto scalar = secp256r1_ct::ScalarFieldNative::random_element(&engine);
    scalar_ct u = scalar_ct::from_witness(&builder, scalar);
    fix_bigfield(u);

    auto output = element_ct::secp256r1_fixed_base_mul(u);
    fix_biggroup_element(output);

    builder.finalize_circuit();
    EXPECT_TRUE(CircuitChecker::check(builder));
    auto graph = StaticAnalyzer(builder);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Static analysis of `secp256r1_ecdsa_mul` on random witness inputs.
 */
TEST(boomerang_secp256r1, ecdsa_mul)
{
    using FrN = secp256r1_ct::ScalarFieldNative;
    auto u1 = FrN::random_element(&engine);
    auto u2 = FrN::random_element(&engine);
    auto pk_scalar = FrN::random_element(&engine);
    auto pk = secp256r1_ct::AffineElementNative(secp256r1_ct::GroupNative::one * pk_scalar);
    run_ecdsa_mul_circuit_and_check(u1, u2, pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
}

/**
 * @brief `secp256r1_fixed_base_mul(u=0)` — exercises the offset-subtract-to-infinity edge case.
 *
 * With u=0, `raw_result == total_offset`, so the final `operator-` collapses to canonical infinity.
 * Verifies the infinity-detection path doesn't introduce unconstrained witnesses.
 */
TEST(boomerang_secp256r1, fixed_base_mul_u_zero)
{
    Builder builder;
    scalar_ct u = scalar_ct::from_witness(&builder, secp256r1_ct::ScalarFieldNative::zero());
    fix_bigfield(u);
    auto output = element_ct::secp256r1_fixed_base_mul(u);
    fix_biggroup_element(output);

    builder.finalize_circuit();
    EXPECT_TRUE(CircuitChecker::check(builder));
    auto graph = StaticAnalyzer(builder);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief Two `secp256r1_ecdsa_mul` calls in the same builder.
 *
 * Asserts the count scales linearly (2 × `EXPECTED_ECDSA_MUL_ONE_GATE_VARS`). Non-linear scaling
 * would indicate shared state between invocations — e.g., a stale lookup-table index, accumulator
 * carryover, or the per-instance MultiTable setup leaking witnesses across calls.
 */
TEST(boomerang_secp256r1, two_ecdsa_muls_in_same_builder)
{
    using FrN = secp256r1_ct::ScalarFieldNative;
    Builder builder;
    auto build_one = [&] {
        auto pk_scalar = FrN::random_element(&engine);
        auto pk = secp256r1_ct::AffineElementNative(secp256r1_ct::GroupNative::one * pk_scalar);
        element_ct pubkey = element_ct::from_witness(&builder, pk);
        scalar_ct u1 = scalar_ct::from_witness(&builder, FrN::random_element(&engine));
        scalar_ct u2 = scalar_ct::from_witness(&builder, FrN::random_element(&engine));
        fix_biggroup_element(pubkey);
        fix_bigfield(u1);
        fix_bigfield(u2);
        auto out = element_ct::secp256r1_ecdsa_mul(pubkey, u1, u2);
        fix_biggroup_element(out.result);
    };
    build_one();
    build_one();

    builder.finalize_circuit();
    EXPECT_TRUE(CircuitChecker::check(builder));
    auto graph = StaticAnalyzer(builder);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 2 * EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
}

/**
 * @brief Edge-case `secp256r1_ecdsa_mul` — verifies the count stays at 10 across all substitution branches.
 *
 *   - u₂ ∈ {0, ±1}: triggers `u2_needs_subst=true`, swaps u₂ for 2 via `Fr::conditional_assign`.
 *   - u₁ = 0: `secp256r1_fixed_base_mul(0)` returns canonical infinity; T₁ + T₂ flows through
 *             `operator+`'s infinity handling.
 *   - Both zero: both paths exercised together.
 *
 * Input-independence of the count means the circuit's wire structure does not depend on the
 * runtime input value — no wire that exists for one input becomes "unused" for another.
 */
TEST(boomerang_secp256r1, ecdsa_mul_edge_cases)
{
    using FrN = secp256r1_ct::ScalarFieldNative;
    auto pk_scalar = FrN::random_element(&engine);
    auto pk = secp256r1_ct::AffineElementNative(secp256r1_ct::GroupNative::one * pk_scalar);
    auto random_u = [&] { return FrN::random_element(&engine); };

    run_ecdsa_mul_circuit_and_check(random_u(), FrN::zero(), pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
    run_ecdsa_mul_circuit_and_check(random_u(), FrN::one(), pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
    run_ecdsa_mul_circuit_and_check(random_u(), -FrN::one(), pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
    run_ecdsa_mul_circuit_and_check(FrN::zero(), random_u(), pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
    run_ecdsa_mul_circuit_and_check(FrN::zero(), FrN::zero(), pk, EXPECTED_ECDSA_MUL_ONE_GATE_VARS);
}
