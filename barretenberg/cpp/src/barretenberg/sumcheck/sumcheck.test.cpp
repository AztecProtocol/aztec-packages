#include "sumcheck.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include "barretenberg/flavor/sumcheck_test_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {

/**
 * @brief Helper function to create a satisfiable trace for any SumcheckTestFlavor variant
 * @details Creates a trace that satisfies the arithmetic relation: q_arith * (q_m * w_l * w_r + q_l * w_l + q_r *
 * w_r + q_o * w_o + q_c) = 0
 *
 * For non-ZK flavors, creates a simple circuit with arithmetic gates.
 * For ZK flavors, adds random values to the last rows that are masked by the row-disabling polynomial.
 *
 * Examples of gates added:
 * - Row 1: w_l + w_r = w_o  (1 + 1 = 2)
 * - Row 2: w_l * w_r = w_o  (2 * 2 = 4)
 * - Row 0, 3+ : inactive (all zeros)
 */
template <typename Flavor> typename Flavor::ProverPolynomials create_satisfiable_trace(size_t circuit_size)
{
    using FF = typename Flavor::FF;
    using Polynomial = bb::Polynomial<FF>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    ProverPolynomials full_polynomials;

    // Initialize precomputed polynomials (selectors)
    for (auto& poly : full_polynomials.get_precomputed()) {
        poly = Polynomial(circuit_size);
    }

    // Initialize witness polynomials as shiftable (start_index = 1) to allow shifting
    for (auto& poly : full_polynomials.get_witness()) {
        poly = Polynomial::shiftable(circuit_size);
    }

    // Initialize shifted polynomials (will be populated by set_shifted())
    for (auto& poly : full_polynomials.get_shifted()) {
        poly = Polynomial(circuit_size);
    }

    // Create a simple arithmetic circuit with a few gates
    // Row 1: Addition gate: w_l + w_r = w_o (1 + 1 = 2)
    if (circuit_size > 1) {
        full_polynomials.w_l.at(1) = FF(1);
        full_polynomials.w_r.at(1) = FF(1);
        full_polynomials.w_o.at(1) = FF(2);
        full_polynomials.q_l.at(1) = FF(1);
        full_polynomials.q_r.at(1) = FF(1);
        full_polynomials.q_o.at(1) = FF(-1);
        full_polynomials.q_arith.at(1) = FF(1);
    }

    // Row 2: Multiplication gate: w_l * w_r = w_o (2 * 2 = 4)
    if (circuit_size > 2) {
        full_polynomials.w_l.at(2) = FF(2);
        full_polynomials.w_r.at(2) = FF(2);
        full_polynomials.w_o.at(2) = FF(4);
        full_polynomials.q_m.at(2) = FF(1);
        full_polynomials.q_o.at(2) = FF(-1);
        full_polynomials.q_arith.at(2) = FF(1);
    }

    // For ZK flavors: add randomness to the last rows (which will be masked by row-disabling polynomial)
    // These rows don't need to satisfy the relation because they're disabled
    if constexpr (Flavor::HasZK) {
        constexpr size_t NUM_DISABLED_ROWS = 3; // Matches the number of disabled rows in ZK sumcheck
        if (circuit_size > NUM_DISABLED_ROWS) {
            for (size_t i = circuit_size - NUM_DISABLED_ROWS; i < circuit_size; ++i) {
                full_polynomials.w_l.at(i) = FF::random_element();
                full_polynomials.w_r.at(i) = FF::random_element();
                full_polynomials.w_o.at(i) = FF::random_element();
                full_polynomials.w_4.at(i) = FF::random_element();
                full_polynomials.w_test_1.at(i) = FF::random_element();
                full_polynomials.w_test_2.at(i) = FF::random_element();
            }
        }
    }

    // Compute shifted polynomials using the set_shifted() method
    full_polynomials.set_shifted();

    return full_polynomials;
}

template <typename Flavor> class SumcheckTests : public ::testing::Test {
  public:
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using ZKData = ZKSumcheckData<Flavor>;

    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    Polynomial<FF> random_poly(size_t size)
    {
        auto poly = bb::Polynomial<FF>(size);
        for (auto& coeff : poly.coeffs()) {
            coeff = FF::random_element();
        }
        return poly;
    }

    ProverPolynomials construct_ultra_full_polynomials(auto& input_polynomials)
    {
        ProverPolynomials full_polynomials;
        for (auto [full_poly, input_poly] : zip_view(full_polynomials.get_all(), input_polynomials)) {
            full_poly = input_poly.share();
        }
        return full_polynomials;
    }

    void test_polynomial_normalization()
    {
        // TODO(#225)(Cody): We should not use real constants like this in the tests, at least not in so many of them.
        const size_t multivariate_d(3);
        const size_t multivariate_n(1 << multivariate_d);

        // Randomly construct the prover polynomials that are input to Sumcheck.
        // Note: ProverPolynomials are defined as spans so the polynomials they point to need to exist in memory.
        std::vector<bb::Polynomial<FF>> random_polynomials(NUM_POLYNOMIALS);
        for (auto& poly : random_polynomials) {
            poly = random_poly(multivariate_n);
        }
        auto full_polynomials = construct_ultra_full_polynomials(random_polynomials);

        auto transcript = Flavor::Transcript::prover_init_empty();

        FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

        std::vector<FF> gate_challenges(multivariate_d);
        for (size_t idx = 0; idx < multivariate_d; idx++) {
            gate_challenges[idx] =
                transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        SumcheckProver<Flavor> sumcheck(
            multivariate_n, full_polynomials, transcript, alpha, gate_challenges, {}, multivariate_d);

        auto output = sumcheck.prove();

        FF u_0 = output.challenge[0];
        FF u_1 = output.challenge[1];
        FF u_2 = output.challenge[2];

        /* sumcheck.prove() terminates with sumcheck.multivariates.folded_polynoimals as an array such that
         * sumcheck.multivariates.folded_polynoimals[i][0] is the evaluatioin of the i'th multivariate at the vector of
         challenges u_i. What does this mean?

         Here we show that if the multivariate is F(X0, X1, X2) defined as above, then what we get is F(u0, u1, u2) and
         not, say F(u2, u1, u0). This is in accordance with Adrian's thesis (cf page 9).
          */

        // Get the values of the Lagrange basis polys L_i defined
        // by: L_i(v) = 1 if i = v, 0 otherwise, for v from 0 to 7.
        FF one{ 1 };
        // clang-format off
        FF l_0 = (one - u_0) * (one - u_1) * (one - u_2);
        FF l_1 = (u_0) * (one - u_1) * (one - u_2);
        FF l_2 = (one - u_0) * (u_1) * (one - u_2);
        FF l_3 = (u_0) * (u_1) * (one - u_2);
        FF l_4 = (one - u_0) * (one - u_1) * (u_2);
        FF l_5 = (u_0) * (one - u_1) * (u_2);
        FF l_6 = (one - u_0) * (u_1) * (u_2);
        FF l_7 = (u_0) * (u_1) * (u_2);
        // clang-format on
        FF hand_computed_value;
        for (auto [full_poly, partial_eval_poly] :
             zip_view(full_polynomials.get_all(), sumcheck.partially_evaluated_polynomials.get_all())) {
            // full_polynomials[0][0] = w_l[0], full_polynomials[1][1] = w_r[1], and so on.
            hand_computed_value = l_0 * full_poly[0] + l_1 * full_poly[1] + l_2 * full_poly[2] + l_3 * full_poly[3] +
                                  l_4 * full_poly[4] + l_5 * full_poly[5] + l_6 * full_poly[6] + l_7 * full_poly[7];
            EXPECT_EQ(hand_computed_value, partial_eval_poly[0]);
        }

        // We can also check the correctness of the multilinear evaluations produced by Sumcheck by directly evaluating
        // the full polynomials at challenge u via the evaluate_mle() function
        std::vector<FF> u_challenge = { u_0, u_1, u_2 };
        for (auto [full_poly, claimed_eval] :
             zip_view(full_polynomials.get_all(), output.claimed_evaluations.get_all())) {
            Polynomial<FF> poly(full_poly);
            auto v_expected = poly.evaluate_mle(u_challenge);
            EXPECT_EQ(v_expected, claimed_eval);
        }
    }

    void test_prover()
    {
        const size_t multivariate_d(2);
        const size_t multivariate_n(1 << multivariate_d);

        // Randomly construct the prover polynomials that are input to Sumcheck.
        // Note: ProverPolynomials are defined as spans so the polynomials they point to need to exist in memory.
        std::vector<Polynomial<FF>> random_polynomials(NUM_POLYNOMIALS);
        for (auto& poly : random_polynomials) {
            poly = random_poly(multivariate_n);
        }
        auto full_polynomials = construct_ultra_full_polynomials(random_polynomials);

        auto transcript = Flavor::Transcript::prover_init_empty();

        FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

        std::vector<FF> gate_challenges(multivariate_d);
        for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
            gate_challenges[idx] =
                transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        SumcheckProver<Flavor> sumcheck(
            multivariate_n, full_polynomials, transcript, alpha, gate_challenges, {}, CONST_PROOF_SIZE_LOG_N);

        SumcheckOutput<Flavor> output;

        if constexpr (Flavor::HasZK) {
            ZKData zk_sumcheck_data = ZKData(multivariate_d, transcript);
            output = sumcheck.prove(zk_sumcheck_data);
        } else {
            output = sumcheck.prove();
        }
        FF u_0 = output.challenge[0];
        FF u_1 = output.challenge[1];
        std::vector<FF> expected_values;
        for (auto& polynomial_ptr : full_polynomials.get_all()) {
            auto& polynomial = polynomial_ptr;
            // using knowledge of inputs here to derive the evaluation
            FF expected_lo = polynomial[0] * (FF(1) - u_0) + polynomial[1] * u_0;
            expected_lo *= (FF(1) - u_1);
            FF expected_hi = polynomial[2] * (FF(1) - u_0) + polynomial[3] * u_0;
            expected_hi *= u_1;
            expected_values.emplace_back(expected_lo + expected_hi);
        }

        for (auto [eval, expected] : zip_view(output.claimed_evaluations.get_all(), expected_values)) {
            eval = expected;
        }
    }

    // TODO(#225): make the inputs to this test more interesting, e.g. non-trivial permutations
    void test_prover_verifier_flow()
    {
        const size_t multivariate_d(3);
        const size_t multivariate_n(1 << multivariate_d);

        const size_t virtual_log_n = 6;

        auto full_polynomials = create_satisfiable_trace<Flavor>(multivariate_n);

        // SumcheckTestFlavor doesn't need complex relation parameters (no permutation, lookup, etc.)
        RelationParameters<FF> relation_parameters{};
        auto prover_transcript = Flavor::Transcript::prover_init_empty();
        FF prover_alpha = prover_transcript->template get_challenge<FF>("Sumcheck:alpha");

        std::vector<FF> prover_gate_challenges(virtual_log_n);
        prover_gate_challenges =
            prover_transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);

        SumcheckProver<Flavor> sumcheck_prover(multivariate_n,
                                               full_polynomials,
                                               prover_transcript,
                                               prover_alpha,
                                               prover_gate_challenges,
                                               relation_parameters,
                                               virtual_log_n);

        SumcheckOutput<Flavor> output;
        if constexpr (Flavor::HasZK) {
            ZKData zk_sumcheck_data = ZKData(multivariate_d, prover_transcript);
            output = sumcheck_prover.prove(zk_sumcheck_data);
        } else {
            output = sumcheck_prover.prove();
        }

        auto verifier_transcript = Flavor::Transcript::verifier_init_empty(prover_transcript);

        FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");

        auto sumcheck_verifier = SumcheckVerifier<Flavor>(verifier_transcript, verifier_alpha, virtual_log_n);

        std::vector<FF> verifier_gate_challenges(virtual_log_n);
        verifier_gate_challenges =
            verifier_transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);

        std::vector<FF> padding_indicator_array(virtual_log_n, 1);
        if constexpr (Flavor::HasZK) {
            for (size_t idx = 0; idx < virtual_log_n; idx++) {
                padding_indicator_array[idx] = (idx < multivariate_d) ? FF{ 1 } : FF{ 0 };
            }
        }

        auto verifier_output =
            sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges, padding_indicator_array);

        auto verified = verifier_output.verified;

        EXPECT_EQ(verified, true);
    };

    void test_failure_prover_verifier_flow()
    {
        // Since the last 4 rows in ZK Flavors are disabled, we extend an invalid circuit of size 4 to size 8 by padding
        // with 0.
        const size_t multivariate_d(3);
        const size_t multivariate_n(1 << multivariate_d);

        // Start with a satisfiable trace, then break it
        auto full_polynomials = create_satisfiable_trace<Flavor>(multivariate_n);

        // Break the circuit by changing w_l[1] from 1 to 0
        // This makes the arithmetic relation unsatisfied:
        // q_arith[1] * (q_l[1] * w_l[1] + q_r[1] * w_r[1] + q_o[1] * w_o[1]) = 1 * (1 * 0 + 1 * 1 + (-1) * 2) = -1 ≠
        // 0
        full_polynomials.w_l.at(1) = FF(0);

        // SumcheckTestFlavor doesn't need complex relation parameters
        RelationParameters<FF> relation_parameters{};
        auto prover_transcript = Flavor::Transcript::prover_init_empty();
        FF prover_alpha = prover_transcript->template get_challenge<FF>("Sumcheck:alpha");

        auto prover_gate_challenges =
            prover_transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", multivariate_d);

        SumcheckProver<Flavor> sumcheck_prover(multivariate_n,
                                               full_polynomials,
                                               prover_transcript,
                                               prover_alpha,
                                               prover_gate_challenges,
                                               relation_parameters,
                                               multivariate_d);

        SumcheckOutput<Flavor> output;
        if constexpr (Flavor::HasZK) {
            // construct libra masking polynomials and compute auxiliary data
            ZKData zk_sumcheck_data = ZKData(multivariate_d, prover_transcript);
            output = sumcheck_prover.prove(zk_sumcheck_data);
        } else {
            output = sumcheck_prover.prove();
        }

        auto verifier_transcript = Flavor::Transcript::verifier_init_empty(prover_transcript);

        FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");

        SumcheckVerifier<Flavor> sumcheck_verifier(verifier_transcript, verifier_alpha, multivariate_d);

        std::vector<FF> verifier_gate_challenges(multivariate_d);
        for (size_t idx = 0; idx < multivariate_d; idx++) {
            verifier_gate_challenges[idx] =
                verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        std::vector<FF> padding_indicator_array(multivariate_d);
        std::ranges::fill(padding_indicator_array, FF{ 1 });
        auto verifier_output =
            sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges, padding_indicator_array);

        auto verified = verifier_output.verified;

        EXPECT_EQ(verified, false);
    };
};

// Define the FlavorTypes using SumcheckTestFlavor variants
// Note: Only testing short monomials since full barycentric adds complexity without testing sumcheck-specific logic
// Note: Grumpkin sumcheck requires ZK mode for commitment-based protocol (used in ECCVM/IVC)
using FlavorTypes = testing::Types<SumcheckTestFlavor,            // BN254, non-ZK, short monomials
                                   SumcheckTestFlavorZK,          // BN254, ZK, short monomials
                                   SumcheckTestFlavorGrumpkinZK>; // Grumpkin, ZK, short monomials

TYPED_TEST_SUITE(SumcheckTests, FlavorTypes);

TYPED_TEST(SumcheckTests, PolynomialNormalization)
{
    if constexpr (!TypeParam::HasZK) {
        this->test_polynomial_normalization();
    } else {
        GTEST_SKIP() << "Skipping test for ZK-enabled flavors";
    }
}
// Test the prover
TYPED_TEST(SumcheckTests, Prover)
{
    this->test_prover();
}
// Tests the prover-verifier flow
TYPED_TEST(SumcheckTests, ProverAndVerifierSimple)
{
    this->test_prover_verifier_flow();
}
// This tests is fed an invalid circuit and checks that the verifier would output false.
TYPED_TEST(SumcheckTests, ProverAndVerifierSimpleFailure)
{
    this->test_failure_prover_verifier_flow();
}

} // namespace
