#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/sumcheck_test_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test fixture for RowDisablingPolynomial tests
 * @details Provides common setup for relation parameters, gate challenges, and alphas
 */
template <typename Flavor> class RowDisablingPolynomialTest : public ::testing::Test {
  public:
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using SumcheckRound = SumcheckProverRound<Flavor>;
    using ZKData = ZKSumcheckData<Flavor>;
    using SubrelationSeparators = std::array<FF, Flavor::NUM_SUBRELATIONS - 1>;

    struct SumcheckSetup {
        RelationParameters<FF> relation_parameters;
        std::vector<FF> gate_challenges;
        GateSeparatorPolynomial<FF> gate_separators;
        SubrelationSeparators alphas;
        FF alpha;
    };

    /**
     * @brief Create standard sumcheck setup with transcript-derived challenges
     */
    static SumcheckSetup create_sumcheck_setup(size_t multivariate_d)
    {
        auto transcript = Flavor::Transcript::prover_init_empty();
        FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

        std::vector<FF> gate_challenges(multivariate_d);
        for (size_t idx = 0; idx < multivariate_d; idx++) {
            gate_challenges[idx] =
                transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        GateSeparatorPolynomial<FF> gate_separators(gate_challenges, multivariate_d);

        // Compute alphas as consecutive powers of alpha
        SubrelationSeparators alphas;
        alphas[0] = alpha;
        for (size_t i = 1; i < Flavor::NUM_SUBRELATIONS - 1; ++i) {
            alphas[i] = alphas[i - 1] * alpha;
        }

        RelationParameters<FF> relation_parameters{
            .beta = FF(2),
            .gamma = FF(3),
            .public_input_delta = FF::one(),
        };

        return SumcheckSetup{
            .relation_parameters = relation_parameters,
            .gate_challenges = gate_challenges,
            .gate_separators = gate_separators,
            .alphas = alphas,
            .alpha = alpha,
        };
    }
};

/**
 * @brief Test that RowDisablingPolynomial correctly remove the contribution of random padding rows in ZK sumcheck
 * @details This test verifies that when random elements are added to the last rows of witness polynomials,
 * the sumcheck protocol still succeeds because RowDisablingPolynomial disables those rows.
 *
 * The test:
 * 1. Creates a valid circuit with relations satisfied up to row (n - NUM_DISABLED_ROWS)
 * 2. Adds random values to the last NUM_DISABLED_ROWS rows (would break relations)
 * 3. Runs ZK sumcheck which multiplies relations by (1 - L_{n-1} - L_{n-2} - L_{n-3} - L_{n-4})
 * 4. Verifies that sumcheck succeeds despite the random padding
 */
TEST(RowDisablingPolynomial, MasksRandomPaddingRows)
{
    using Flavor = SumcheckTestFlavorZK;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using ZKData = ZKSumcheckData<Flavor>;

    // Use same circuit size as existing ZK tests
    const size_t multivariate_d = 3; // log2(circuit_size) = 3 → 8 rows
    const size_t multivariate_n = 1 << multivariate_d;
    const size_t virtual_log_n = multivariate_d; // No padding rounds
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    // Setup: Create polynomials following the pattern from existing ZK tests
    // Valid relations in first few rows, random values in last 4 rows (indices 4-7)

    // Start with the same non-trivial circuit as existing tests
    std::array<FF, multivariate_n> w_l = { 0, 1, 2, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> w_r = { 0, 1, 2, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> w_o = { 0, 2, 4, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> w_4 = { 0, 0, 0, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_m = { 0, 0, 1, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_l = { 0, 1, 0, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_r = { 0, 1, 0, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_o = { 0, -1, -1, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_c = { 0, 0, 0, 0, 0, 0, 0, 0 };
    std::array<FF, multivariate_n> q_arith = { 0, 1, 1, 0, 0, 0, 0, 0 };

    // Critical: Add RANDOM values to the last 4 rows (indices 4-7)
    // These would normally break sumcheck, but RowDisablingPolynomial disable their contribution

    for (size_t i = 4; i < multivariate_n; i++) {
        w_l[i] = FF::random_element();
        w_r[i] = FF::random_element();
        w_o[i] = FF::random_element();
        w_4[i] = FF::random_element();
        q_m[i] = FF::random_element();
        q_l[i] = FF::random_element();
        q_r[i] = FF::random_element();
        q_o[i] = FF::random_element();
        q_c[i] = FF::random_element();
        q_arith[i] = FF(1); // Enable arithmetic relation
    }

    // Setup z_perm, lookup_inverses with random values in disabled rows
    // SumcheckTestFlavor doesn't need z_perm, lookup_inverses, lookup_read_counts
    // Random values in witness polynomials are sufficient for testing row disabling

    // Create zero polynomials for all entities
    std::vector<bb::Polynomial<FF>> zero_polynomials(NUM_POLYNOMIALS);
    for (auto& poly : zero_polynomials) {
        poly = bb::Polynomial<FF>(multivariate_n);
    }

    // Assign to ProverPolynomials
    ProverPolynomials full_polynomials;
    for (auto [full_poly, zero_poly] : zip_view(full_polynomials.get_all(), zero_polynomials)) {
        full_poly = zero_poly.share();
    }

    // Override with our constructed polynomials
    full_polynomials.w_l = bb::Polynomial<FF>(w_l);
    full_polynomials.w_r = bb::Polynomial<FF>(w_r);
    full_polynomials.w_o = bb::Polynomial<FF>(w_o);
    full_polynomials.w_4 = bb::Polynomial<FF>(w_4);
    full_polynomials.q_m = bb::Polynomial<FF>(q_m);
    full_polynomials.q_l = bb::Polynomial<FF>(q_l);
    full_polynomials.q_r = bb::Polynomial<FF>(q_r);
    full_polynomials.q_o = bb::Polynomial<FF>(q_o);
    full_polynomials.q_c = bb::Polynomial<FF>(q_c);
    full_polynomials.q_arith = bb::Polynomial<FF>(q_arith);

    // SumcheckTestFlavor doesn't have z_perm, lookup_inverses, lookup_read_counts
    // The row disabling mechanism will handle the random values in witness polynomials

    // Set relation parameters (SumcheckTestFlavor doesn't need beta/gamma)
    RelationParameters<FF> relation_parameters{};

    // Prover: Run ZK Sumcheck with RowDisablingPolynomial
    auto prover_transcript = Flavor::Transcript::prover_init_empty();
    FF prover_alpha = prover_transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> prover_gate_challenges(virtual_log_n);
    for (size_t idx = 0; idx < virtual_log_n; idx++) {
        prover_gate_challenges[idx] =
            prover_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    SumcheckProver<Flavor> sumcheck_prover(multivariate_n,
                                           full_polynomials,
                                           prover_transcript,
                                           prover_alpha,
                                           prover_gate_challenges,
                                           relation_parameters,
                                           virtual_log_n);

    // ZK Sumcheck: this will use RowDisablingPolynomial to mask the last 4 rows
    ZKData zk_sumcheck_data = ZKData(multivariate_d, prover_transcript);
    SumcheckOutput<Flavor> prover_output = sumcheck_prover.prove(zk_sumcheck_data);

    // Verifier: Verify with padding_indicator_array
    auto verifier_transcript = Flavor::Transcript::verifier_init_empty(prover_transcript);

    // Extract challenges from verifier transcript (must match prover)
    FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> verifier_gate_challenges(virtual_log_n);
    for (size_t idx = 0; idx < virtual_log_n; idx++) {
        verifier_gate_challenges[idx] =
            verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    auto sumcheck_verifier = SumcheckVerifier<Flavor>(verifier_transcript, verifier_alpha, virtual_log_n);

    // Construct padding indicator array (all 1s since we're not using padding rounds)
    std::vector<FF> padding_indicator_array(virtual_log_n, FF(1));

    auto verifier_output =
        sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges, padding_indicator_array);

    // Verification: Despite random values in last 4 rows, sumcheck succeeds
    EXPECT_TRUE(verifier_output.verified)
        << "ZK Sumcheck should succeed with RowDisablingPolynomial masking random padding rows";

    // Verify challenges match
    EXPECT_EQ(prover_output.challenge.size(), verifier_output.challenge.size());
    for (size_t i = 0; i < prover_output.challenge.size(); i++) {
        EXPECT_EQ(prover_output.challenge[i], verifier_output.challenge[i]);
    }
}

/**
 * @brief Test that RowDisablingPolynomial update eval and evaluate at challenge
 * Details, check that evaluate_at_challenge returns u_2u_3...u_{d-1}
 * Checks that update_evaluation works as expected in the first 2 rounds
 */
TEST(RowDisablingPolynomial, ComputeDisabledContribution)
{
    using Flavor = SumcheckTestFlavorZK;
    using TestFixture = RowDisablingPolynomialTest<Flavor>;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using SumcheckRound = typename TestFixture::SumcheckRound;

    const size_t multivariate_d = 4; // 16 rows
    const size_t multivariate_n = 1 << multivariate_d;
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    const size_t NUM_DISABLED_ROWS = 4;

    // Create simple test polynomials with known values in the last 4 rows
    std::vector<bb::Polynomial<FF>> test_polynomials(NUM_POLYNOMIALS);
    for (auto& poly : test_polynomials) {
        poly = bb::Polynomial<FF>(multivariate_n);
        // Set specific values in the disabled rows (12-15) for easier verification
        for (size_t i = multivariate_n - NUM_DISABLED_ROWS; i < multivariate_n; i++) {
            poly.at(i) = FF(i + 1); // Non-zero, predictable values
        }
    }

    ProverPolynomials full_polynomials;
    for (auto [full_poly, test_poly] : zip_view(full_polynomials.get_all(), test_polynomials)) {
        full_poly = test_poly.share();
    }

    // Use fixture to create standard sumcheck setup
    auto setup = TestFixture::create_sumcheck_setup(multivariate_d);

    // Initialize row disabling polynomial
    RowDisablingPolynomial<FF> row_disabling_polynomial; // Default constructor

    // Test Round 1: After partially evaluating with u_0
    {
        FF u_0 = FF::random_element();

        // Create partially evaluated polynomials (simplified for test)
        typename Flavor::PartiallyEvaluatedMultivariates partially_evaluated;
        for (auto [pe_poly, full_poly] : zip_view(partially_evaluated.get_all(), full_polynomials.get_all())) {
            // Simulate partial evaluation: P(u_0, X_1, ...)
            pe_poly = bb::Polynomial<FF>(multivariate_n / 2);
            for (size_t i = 0; i < multivariate_n / 2; i++) {
                // P(u_0, i_1, i_2, ...) = P(0, i_1, ...) + u_0 * (P(1, i_1, ...) - P(0, i_1, ...))
                pe_poly.at(i) = full_poly[2 * i] + (u_0 * (full_poly[(2 * i) + 1] - full_poly[2 * i]));
            }
        }

        SumcheckRound round(multivariate_n / 2);

        // Update row disabling polynomial after round 0 with challenge u_0
        row_disabling_polynomial.update_evaluations(u_0, 0);
        // At this point (round_idx=0), eval_at_0 and eval_at_1 should still be 1
        EXPECT_EQ(row_disabling_polynomial.eval_at_0, FF(1));
        EXPECT_EQ(row_disabling_polynomial.eval_at_1, FF(1));

        // Now update for round 1
        FF u_1 = FF::random_element();
        row_disabling_polynomial.update_evaluations(u_1, 1);
        // After round 1, eval_at_0 should be 0
        EXPECT_EQ(row_disabling_polynomial.eval_at_0, FF(0));
        EXPECT_EQ(row_disabling_polynomial.eval_at_1, FF(1));
    }

    // Test that row disabling factor equals X_2 × X_3 × ... × X_{d-1}
    {
        std::vector<FF> challenges(multivariate_d);
        for (auto& c : challenges) {
            c = FF::random_element();
        }

        // Compute using the optimized method
        FF eval = RowDisablingPolynomial<FF>::evaluate_at_challenge(challenges, multivariate_d);

        // Manually compute: should be (1 - X_0*X_1 - (1-X_0)*X_1 - X_0*(1-X_1) - (1-X_0)*(1-X_1)) * X_2 * ... * X_{d-1}
        // Which simplifies to: (1 - X_1 - (1-X_1)) * X_2 * ... * X_{d-1} = 0 * X_2 * ... = 0?
        // Wait, let me reconsider...

        // L_{n-1} + L_{n-2} + L_{n-3} + L_{n-4} where:
        // L_{n-1} = X_0 * X_1 * X_2 * ... * X_{d-1}
        // L_{n-2} = (1-X_0) * X_1 * X_2 * ... * X_{d-1}
        // L_{n-3} = X_0 * (1-X_1) * X_2 * ... * X_{d-1}
        // L_{n-4} = (1-X_0) * (1-X_1) * X_2 * ... * X_{d-1}
        // Sum = X_2 * ... * X_{d-1} * [X_0*X_1 + (1-X_0)*X_1 + X_0*(1-X_1) + (1-X_0)*(1-X_1)]
        //     = X_2 * ... * X_{d-1} * [X_1 + (1-X_1)] = X_2 * ... * X_{d-1}

        FF expected_sum_lagranges = FF(1);
        for (size_t i = 2; i < multivariate_d; i++) {
            expected_sum_lagranges *= challenges[i];
        }

        FF expected_eval = FF(1) - expected_sum_lagranges;

        EXPECT_EQ(eval, expected_eval) << "Row disabling polynomial should equal (1 - X_2 * X_3 * ... * X_{d-1})";

        info("Verified: L_{n-1} + L_{n-2} + L_{n-3} + L_{n-4} = X_2 × X_3 × ... × X_{d-1}");
    }
}

/**
 * @brief Test that sumcheck FAILS when random padding is added WITHOUT RowDisablingPolynomial
 * @details This test uses a non-ZK flavor to show that random padding breaks sumcheck when row disabling is not used
 */
TEST(RowDisablingPolynomial, FailsWithoutRowDisabling)
{
    using Flavor = SumcheckTestFlavor; // Non-ZK flavor (no RowDisablingPolynomial)
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    const size_t NUM_RANDOM_ROWS = 4;
    const size_t multivariate_d = 4;
    const size_t multivariate_n = 1 << multivariate_d;
    const size_t virtual_log_n = multivariate_d;
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    const size_t valid_rows = multivariate_n - NUM_RANDOM_ROWS;

    // Create arrays for polynomial coefficients
    std::vector<FF> w_l(multivariate_n);
    std::vector<FF> w_r(multivariate_n);
    std::vector<FF> w_o(multivariate_n);
    std::vector<FF> w_4(multivariate_n);
    std::vector<FF> q_m(multivariate_n);
    std::vector<FF> q_l(multivariate_n);
    std::vector<FF> q_r(multivariate_n);
    std::vector<FF> q_o(multivariate_n);
    std::vector<FF> q_c(multivariate_n);
    std::vector<FF> q_arith(multivariate_n);

    // Setup valid circuit in first rows
    for (size_t i = 0; i < valid_rows; i++) {
        w_l[i] = FF(i);
        w_r[i] = FF(i + 1);
        w_o[i] = -FF((2 * i) + 1);
        w_4[i] = FF(0);
        q_m[i] = FF(0);
        q_l[i] = FF(1);
        q_r[i] = FF(1);
        q_o[i] = FF(1);
        q_c[i] = FF(0);
        q_arith[i] = FF(1);
    }

    // Add random values to last rows (this WILL break sumcheck for non-ZK flavor)
    for (size_t i = valid_rows; i < multivariate_n; i++) {
        w_l[i] = FF::random_element();
        w_r[i] = FF::random_element();
        w_o[i] = FF::random_element();
        w_4[i] = FF::random_element();
        q_m[i] = FF::random_element();
        q_l[i] = FF::random_element();
        q_r[i] = FF::random_element();
        q_o[i] = FF::random_element();
        q_c[i] = FF::random_element();
        q_arith[i] = FF(1); // Keep enabled
    }

    // SumcheckTestFlavor doesn't need z_perm, lookup_inverses, lookup_read_counts

    // Create random polynomials for remaining entities
    std::vector<bb::Polynomial<FF>> random_polynomials(NUM_POLYNOMIALS);
    for (auto& poly : random_polynomials) {
        poly = bb::Polynomial<FF>(multivariate_n);
        for (size_t i = 0; i < multivariate_n; i++) {
            poly.at(i) = FF::random_element();
        }
    }

    ProverPolynomials full_polynomials;
    for (auto [full_poly, random_poly] : zip_view(full_polynomials.get_all(), random_polynomials)) {
        full_poly = random_poly.share();
    }

    // Override with our constructed polynomials
    full_polynomials.w_l = bb::Polynomial<FF>(w_l);
    full_polynomials.w_r = bb::Polynomial<FF>(w_r);
    full_polynomials.w_o = bb::Polynomial<FF>(w_o);
    full_polynomials.w_4 = bb::Polynomial<FF>(w_4);
    full_polynomials.q_m = bb::Polynomial<FF>(q_m);
    full_polynomials.q_l = bb::Polynomial<FF>(q_l);
    full_polynomials.q_r = bb::Polynomial<FF>(q_r);
    full_polynomials.q_o = bb::Polynomial<FF>(q_o);
    full_polynomials.q_c = bb::Polynomial<FF>(q_c);
    full_polynomials.q_arith = bb::Polynomial<FF>(q_arith);

    // SumcheckTestFlavor doesn't have z_perm, lookup_inverses, lookup_read_counts

    // Set relation parameters (SumcheckTestFlavor doesn't need beta/gamma)
    RelationParameters<FF> relation_parameters{};

    auto prover_transcript = Flavor::Transcript::prover_init_empty();
    FF prover_alpha = prover_transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> prover_gate_challenges(virtual_log_n);
    for (size_t idx = 0; idx < virtual_log_n; idx++) {
        prover_gate_challenges[idx] =
            prover_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    SumcheckProver<Flavor> sumcheck_prover(multivariate_n,
                                           full_polynomials,
                                           prover_transcript,
                                           prover_alpha,
                                           prover_gate_challenges,
                                           relation_parameters,
                                           virtual_log_n);

    // Non-ZK Sumcheck (no RowDisablingPolynomial)
    SumcheckOutput<Flavor> prover_output = sumcheck_prover.prove();

    auto verifier_transcript = Flavor::Transcript::verifier_init_empty(prover_transcript);

    // Extract challenges from verifier transcript (must match prover)
    FF verifier_alpha = verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> verifier_gate_challenges(virtual_log_n);
    for (size_t idx = 0; idx < virtual_log_n; idx++) {
        verifier_gate_challenges[idx] =
            verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    auto sumcheck_verifier = SumcheckVerifier<Flavor>(verifier_transcript, verifier_alpha, virtual_log_n);

    std::vector<FF> padding_indicator_array(virtual_log_n, FF(1));

    auto verifier_output =
        sumcheck_verifier.verify(relation_parameters, verifier_gate_challenges, padding_indicator_array);

    // Without RowDisablingPolynomial, sumcheck should FAIL with random padding
    EXPECT_FALSE(verifier_output.verified)
        << "Non-ZK Sumcheck should FAIL when random values break relations (no RowDisablingPolynomial)";
}
