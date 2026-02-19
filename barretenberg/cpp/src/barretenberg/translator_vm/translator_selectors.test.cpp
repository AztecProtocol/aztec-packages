#include "barretenberg/translator_vm/translator_selectors.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

/**
 * @brief Create all 10 structured Translator selector polynomials and verify that
 * TranslatorSelectorEvaluations::compute matches their MLE evaluations at a random challenge.
 *
 * @details Replicates the pattern-setting logic from TranslatorProvingKey::compute_lagrange_polynomials()
 * with a generic LOG_MINI parameter, then evaluates each polynomial via Polynomial::evaluate_mle and
 * compares against the O(d) analytical formulas.
 */
template <size_t LOG_MINI> void test_translator_selector_evaluations()
{
    using FF = fr;
    using Evaluations = TranslatorSelectorEvaluations<FF, LOG_MINI>;
    using Poly = Polynomial<FF>;

    constexpr size_t D = Evaluations::LOG_N;
    constexpr size_t N = 1UL << D;
    constexpr size_t MINI = 1UL << LOG_MINI;
    constexpr size_t NUM_MASKED_ROWS_END = Evaluations::NUM_MASKED_ROWS_END;
    constexpr size_t RESULT_ROW = Evaluations::RESULT_ROW;
    constexpr size_t RANDOMNESS_START = Evaluations::RANDOMNESS_START;
    constexpr size_t CONCATENATION_GROUP_SIZE = Evaluations::CONCATENATION_GROUP_SIZE;
    constexpr size_t MAX_RANDOM_VALUES_PER_ORDERED = Evaluations::MAX_RANDOM_VALUES_PER_ORDERED;
    constexpr size_t MINI_WITHOUT_MASKING = MINI - NUM_MASKED_ROWS_END;

    // Random sumcheck challenge
    std::vector<FF> u(D);
    for (auto& ui : u) {
        ui = FF::random_element();
    }

    // Compute selector evaluations analytically
    auto evals = Evaluations::compute(u);

    // Helper: create a full-size polynomial, set specified indices to 1, evaluate MLE
    auto make_and_eval = [&](auto set_fn) -> FF {
        Poly poly(N);
        set_fn(poly);
        return poly.evaluate_mle(u);
    };

    // --- lagrange_first: 1 at row 0 ---
    EXPECT_EQ(make_and_eval([](Poly& p) { p.at(0) = 1; }), evals.lagrange_first);

    // --- lagrange_last: 1 at row N-1 ---
    EXPECT_EQ(make_and_eval([](Poly& p) { p.at(N - 1) = 1; }), evals.lagrange_last);

    // --- lagrange_result_row: 1 at row RESULT_ROW ---
    EXPECT_EQ(make_and_eval([](Poly& p) { p.at(RESULT_ROW) = 1; }), evals.lagrange_result_row);

    // --- lagrange_last_in_minicircuit: 1 at row MINI - NUM_MASKED - 1 ---
    EXPECT_EQ(make_and_eval([](Poly& p) { p.at(MINI_WITHOUT_MASKING - 1) = 1; }), evals.lagrange_last_in_minicircuit);

    // --- lagrange_real_last: 1 at row N - MAX_RANDOM - 1 ---
    EXPECT_EQ(make_and_eval([](Poly& p) { p.at(N - MAX_RANDOM_VALUES_PER_ORDERED - 1) = 1; }),
              evals.lagrange_real_last);

    // --- lagrange_ordered_masking: 1 at rows [N - MAX_RANDOM, N - 1] ---
    EXPECT_EQ(make_and_eval([](Poly& p) {
                  for (size_t i = N - MAX_RANDOM_VALUES_PER_ORDERED; i < N; i++) {
                      p.at(i) = 1;
                  }
              }),
              evals.lagrange_ordered_masking);

    // --- lagrange_masking: 1 at last NUM_MASKED rows of each of 16 blocks ---
    EXPECT_EQ(make_and_eval([](Poly& p) {
                  for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; j++) {
                      for (size_t k = MINI - NUM_MASKED_ROWS_END; k < MINI; k++) {
                          p.at(j * MINI + k) = 1;
                      }
                  }
              }),
              evals.lagrange_masking);

    // --- lagrange_mini_masking: rows [RANDOMNESS_START..RESULT_ROW-1] ∪ [MINI-NUM_MASKED..MINI-1] in block 0 ---
    EXPECT_EQ(make_and_eval([](Poly& p) {
                  for (size_t i = RANDOMNESS_START; i < RESULT_ROW; i++) {
                      p.at(i) = 1;
                  }
                  for (size_t i = MINI_WITHOUT_MASKING; i < MINI; i++) {
                      p.at(i) = 1;
                  }
              }),
              evals.lagrange_mini_masking);

    // --- lagrange_even_in_minicircuit: 1 at even rows in [RESULT_ROW, MINI_WITHOUT_MASKING - 2], block 0 ---
    EXPECT_EQ(make_and_eval([](Poly& p) {
                  for (size_t i = RESULT_ROW; i < MINI_WITHOUT_MASKING; i += 2) {
                      p.at(i) = 1;
                  }
              }),
              evals.lagrange_even_in_minicircuit);

    // --- lagrange_odd_in_minicircuit: 1 at odd rows in [RESULT_ROW+1, MINI_WITHOUT_MASKING - 1], block 0 ---
    EXPECT_EQ(make_and_eval([](Poly& p) {
                  for (size_t i = RESULT_ROW; i < MINI_WITHOUT_MASKING; i += 2) {
                      p.at(i + 1) = 1;
                  }
              }),
              evals.lagrange_odd_in_minicircuit);
}

} // anonymous namespace

TEST(TranslatorSelectors, SmallCircuit)
{
    // LOG_MINI = 7: MINI = 128, N = 2048. Fast and tests the generic formulas.
    test_translator_selector_evaluations<7>();
}

TEST(TranslatorSelectors, RealCircuit)
{
    // LOG_MINI = 13: MINI = 8192, N = 131072. Matches the actual Translator circuit size.
    test_translator_selector_evaluations<13>();
}

/**
 * @brief Measure the in-circuit cost of computing all 11 Translator selector evaluations.
 *
 * @details Creates witness challenge values in a circuit builder, runs the analytical computation,
 * measures the gate delta, and verifies correctness against native field computation.
 */
template <typename Builder, size_t LOG_MINI> void test_translator_selector_circuit_cost()
{
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using NativeEvaluations = TranslatorSelectorEvaluations<fr, LOG_MINI>;
    using CircuitEvaluations = TranslatorSelectorEvaluations<field_ct, LOG_MINI>;

    constexpr size_t D = NativeEvaluations::LOG_N;

    Builder builder;

    // Generate random native challenge and create circuit witnesses
    std::vector<fr> u_native(D);
    std::vector<field_ct> u_circuit(D);
    for (size_t k = 0; k < D; k++) {
        u_native[k] = fr::random_element();
        u_circuit[k] = field_ct(witness_ct(&builder, u_native[k]));
    }

    // Compute native reference values
    auto native_evals = NativeEvaluations::compute(u_native);

    // Measure circuit cost
    size_t gates_before = builder.num_gates();
    auto circuit_evals = CircuitEvaluations::compute(u_circuit);
    size_t gates_after = builder.num_gates();
    size_t gates_added = gates_after - gates_before;

    info("TranslatorSelectorEvaluations in-circuit cost (",
         Builder::NAME_STRING,
         ", LOG_MINI=",
         LOG_MINI,
         "): ",
         gates_added,
         " gates");

    // Verify correctness: circuit values must match native values
    EXPECT_EQ(circuit_evals.lagrange_first.get_value(), native_evals.lagrange_first);
    EXPECT_EQ(circuit_evals.lagrange_last.get_value(), native_evals.lagrange_last);
    EXPECT_EQ(circuit_evals.lagrange_odd_in_minicircuit.get_value(), native_evals.lagrange_odd_in_minicircuit);
    EXPECT_EQ(circuit_evals.lagrange_even_in_minicircuit.get_value(), native_evals.lagrange_even_in_minicircuit);
    EXPECT_EQ(circuit_evals.lagrange_result_row.get_value(), native_evals.lagrange_result_row);
    EXPECT_EQ(circuit_evals.lagrange_last_in_minicircuit.get_value(), native_evals.lagrange_last_in_minicircuit);
    EXPECT_EQ(circuit_evals.lagrange_masking.get_value(), native_evals.lagrange_masking);
    EXPECT_EQ(circuit_evals.lagrange_mini_masking.get_value(), native_evals.lagrange_mini_masking);
    EXPECT_EQ(circuit_evals.lagrange_real_last.get_value(), native_evals.lagrange_real_last);
    EXPECT_EQ(circuit_evals.lagrange_ordered_masking.get_value(), native_evals.lagrange_ordered_masking);
}

TEST(TranslatorSelectors, CircuitCostUltra)
{
    test_translator_selector_circuit_cost<UltraCircuitBuilder, 13>();
}

TEST(TranslatorSelectors, CircuitCostMega)
{
    test_translator_selector_circuit_cost<MegaCircuitBuilder, 13>();
}
