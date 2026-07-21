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

    // Create a simple arithmetic circuit with a few gates.
    // Gates start after the disabled region (NUM_DISABLED_ROWS_IN_SUMCHECK = 4) for flavors with row disabling.
    constexpr size_t gate_start = UseRowDisablingPolynomial<Flavor> ? NUM_DISABLED_ROWS_IN_SUMCHECK : 1;

    // Gate 0: Addition gate: w_l + w_r = w_o (1 + 1 = 2)
    if (circuit_size > gate_start) {
        full_polynomials.w_l.at(gate_start) = FF(1);
        full_polynomials.w_r.at(gate_start) = FF(1);
        full_polynomials.w_o.at(gate_start) = FF(2);
        full_polynomials.q_l.at(gate_start) = FF(1);
        full_polynomials.q_r.at(gate_start) = FF(1);
        full_polynomials.q_o.at(gate_start) = FF(-1);
        full_polynomials.q_arith.at(gate_start) = FF(1);
    }

    // Gate 1: Multiplication gate: w_l * w_r = w_o (2 * 2 = 4)
    if (circuit_size > gate_start + 1) {
        full_polynomials.w_l.at(gate_start + 1) = FF(2);
        full_polynomials.w_r.at(gate_start + 1) = FF(2);
        full_polynomials.w_o.at(gate_start + 1) = FF(4);
        full_polynomials.q_m.at(gate_start + 1) = FF(1);
        full_polynomials.q_o.at(gate_start + 1) = FF(-1);
        full_polynomials.q_arith.at(gate_start + 1) = FF(1);
    }

    // For ZK flavors: add randomness to the disabled rows (first 4 rows) which are masked by row-disabling polynomial.
    // These rows don't need to satisfy the relation because they're disabled.
    if constexpr (Flavor::HasZK) {
        for (size_t i = 1; i < NUM_DISABLED_ROWS_IN_SUMCHECK; ++i) { // start at 1 (row 0 is zero row for shiftable)
            full_polynomials.w_l.at(i) = FF::random_element();
            full_polynomials.w_r.at(i) = FF::random_element();
            full_polynomials.w_o.at(i) = FF::random_element();
            full_polynomials.w_4.at(i) = FF::random_element();
            full_polynomials.w_test_1.at(i) = FF::random_element();
            full_polynomials.w_test_2.at(i) = FF::random_element();
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

        auto transcript = Flavor::Transcript::test_prover_init_empty();

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

        // Check the correctness of the multilinear evaluations produced by Sumcheck by directly evaluating
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
        // Need at least 4 rounds for row-disabling flavors (disabled region = 4 rows = 2^2, needs n > 2^2)
        const size_t multivariate_d = UseRowDisablingPolynomial<Flavor> ? 4 : 2;
        const size_t multivariate_n(1 << multivariate_d);

        // Grumpkin flavors run at a fixed number of rounds (no padding); their Libra concatenation only fits
        // CONST_ECCVM_LOG_N * LIBRA_UNIVARIATES_LENGTH + 1 coefficients in the SmallSubgroupIPA subgroup.
        const size_t virtual_log_n = IsGrumpkinFlavor<Flavor> ? CONST_ECCVM_LOG_N : CONST_PROOF_SIZE_LOG_N;

        // Randomly construct the prover polynomials that are input to Sumcheck.
        // Note: ProverPolynomials are defined as spans so the polynomials they point to need to exist in memory.
        std::vector<Polynomial<FF>> random_polynomials(NUM_POLYNOMIALS);
        for (auto& poly : random_polynomials) {
            poly = random_poly(multivariate_n);
        }
        auto full_polynomials = construct_ultra_full_polynomials(random_polynomials);

        auto transcript = Flavor::Transcript::test_prover_init_empty();

        FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

        auto gate_challenges =
            transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);

        SumcheckProver<Flavor> sumcheck(
            multivariate_n, full_polynomials, transcript, alpha, gate_challenges, {}, virtual_log_n);

        SumcheckOutput<Flavor> output;

        if constexpr (Flavor::HasZK) {
            // ZKData needs univariates for ALL rounds (real + virtual) since libra covers the full range
            ZKData zk_sumcheck_data = ZKData(virtual_log_n, transcript);
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
        const size_t multivariate_d = UseRowDisablingPolynomial<Flavor> ? 4 : 3;
        const size_t multivariate_n(1 << multivariate_d);

        const size_t virtual_log_n = 6;

        auto full_polynomials = create_satisfiable_trace<Flavor>(multivariate_n);

        // SumcheckTestFlavor doesn't need complex relation parameters (no permutation, lookup, etc.)
        RelationParameters<FF> relation_parameters{};
        auto prover_transcript = Flavor::Transcript::test_prover_init_empty();
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
            ZKData zk_sumcheck_data = ZKData(virtual_log_n, prover_transcript);
            output = sumcheck_prover.prove(zk_sumcheck_data);
        } else {
            output = sumcheck_prover.prove();
        }

        auto verifier_transcript = Flavor::Transcript::test_verifier_init_empty(prover_transcript);

        FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");

        auto sumcheck_verifier = SumcheckVerifier<Flavor>(verifier_transcript, verifier_alpha, virtual_log_n);

        std::vector<FF> verifier_gate_challenges(virtual_log_n);
        verifier_gate_challenges =
            verifier_transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);

        auto verifier_output = sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges);

        auto verified = verifier_output.verified;

        EXPECT_EQ(verified, true);
    };

    void test_failure_prover_verifier_flow()
    {
        const size_t multivariate_d = UseRowDisablingPolynomial<Flavor> ? 4 : 3;
        const size_t multivariate_n(1 << multivariate_d);

        // Start with a satisfiable trace, then break it
        auto full_polynomials = create_satisfiable_trace<Flavor>(multivariate_n);

        // Break the circuit at the first active gate (after disabled region for row-disabling flavors).
        constexpr size_t gate_row = UseRowDisablingPolynomial<Flavor> ? NUM_DISABLED_ROWS_IN_SUMCHECK : 1;
        full_polynomials.w_l.at(gate_row) = FF(0);

        // SumcheckTestFlavor doesn't need complex relation parameters
        RelationParameters<FF> relation_parameters{};
        auto prover_transcript = Flavor::Transcript::test_prover_init_empty();
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

        auto verifier_transcript = Flavor::Transcript::test_verifier_init_empty(prover_transcript);

        FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");

        SumcheckVerifier<Flavor> sumcheck_verifier(verifier_transcript, verifier_alpha, multivariate_d);

        std::vector<FF> verifier_gate_challenges(multivariate_d);
        for (size_t idx = 0; idx < multivariate_d; idx++) {
            verifier_gate_challenges[idx] =
                verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        auto verifier_output = sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges);

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
