/**
 * @file shplemini_interleaved.test.cpp
 * @brief Unit test for Shplemini with interleaved polynomial commitments
 *
 * Tests the case where we have 4 shiftable polynomials committed using interleaved Pippenger,
 * representing F(X) = f₀(X⁴) + X·f₁(X⁴) + X²·f₂(X⁴) + X³·f₃(X⁴), and opening both
 * F(u) and F_shifted(u) with shift_exponent=4.
 *
 * Mimics the flow in MultiMegaProver/Verifier where:
 * - Prover commits to interleaved polynomial
 * - Sumcheck produces individual polynomial evaluations
 * - Verifier reconstructs batched evaluation using Lagrange basis
 */

#include "../gemini/gemini.hpp"
#include "../kzg/kzg.hpp"
#include "../pcs_test_utils.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "shplemini.hpp"

#include <gtest/gtest.h>

namespace bb {

class ShpleminiInterleavedTest : public CommitmentTest<curve::BN254> {
  public:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;

    static constexpr size_t log_n = 8;        // log of polynomial size
    static constexpr size_t n = 1UL << log_n; // polynomial size (256)
    static constexpr size_t BATCH_SIZE = 4;   // interleaving batch size
    static constexpr size_t interleaved_size = n * BATCH_SIZE;
    static constexpr size_t k = 2; // log₂(BATCH_SIZE) = extra challenges for interleaving

    /**
     * @brief Create 4 random polynomials (not shiftable)
     */
    std::array<Polynomial, BATCH_SIZE> create_random_polynomials()
    {
        std::array<Polynomial, BATCH_SIZE> polys;
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            polys[j] = Polynomial(n);
            for (size_t i = 0; i < n; ++i) {
                polys[j].at(i) = Fr::random_element();
            }
        }
        return polys;
    }

    /**
     * @brief Create 4 shiftable polynomials (f[0] = 0)
     */
    std::array<Polynomial, BATCH_SIZE> create_shiftable_polynomials()
    {
        std::array<Polynomial, BATCH_SIZE> polys;
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            polys[j] = Polynomial(n);
            polys[j].at(0) = Fr::zero();
            for (size_t i = 1; i < n; ++i) {
                polys[j].at(i) = Fr::random_element();
            }
        }
        return polys;
    }

    /**
     * @brief Interleave 4 polynomials: F[4i+j] = f_j[i]
     * @details Creates F(X) = f₀(X⁴) + X·f₁(X⁴) + X²·f₂(X⁴) + X³·f₃(X⁴)
     */
    Polynomial interleave_polynomials(const std::array<Polynomial, BATCH_SIZE>& polys)
    {
        Polynomial interleaved(interleaved_size);
        for (size_t i = 0; i < n; ++i) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                interleaved.at(4 * i + j) = polys[j][i];
            }
        }
        return interleaved;
    }

    /**
     * @brief Compute Lagrange basis for interleaving (same as MultiMegaVerifier)
     * @details L₀ = (1-u₀)(1-u₁), L₁ = u₀(1-u₁), L₂ = (1-u₀)u₁, L₃ = u₀·u₁
     */
    std::array<Fr, BATCH_SIZE> compute_lagrange_basis(const Fr& u0, const Fr& u1)
    {
        Fr one_minus_u0 = Fr::one() - u0;
        Fr one_minus_u1 = Fr::one() - u1;
        return { one_minus_u0 * one_minus_u1, // L₀
                 u0 * one_minus_u1,           // L₁
                 one_minus_u0 * u1,           // L₂
                 u0 * u1 };                   // L₃
    }

    /**
     * @brief Compute batched evaluation (same as MultiMegaVerifier::compute_batched_evaluation)
     * @details F(u) = Σⱼ fⱼ(u) · Lⱼ(u₀,u₁)
     */
    Fr compute_batched_evaluation(const std::array<Fr, BATCH_SIZE>& lagrange_basis,
                                  const std::array<Fr, BATCH_SIZE>& individual_evals)
    {
        Fr result = Fr::zero();
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            result += individual_evals[j] * lagrange_basis[j];
        }
        return result;
    }
};

/**
 * @brief Basic test: open a single interleaved polynomial (unshifted only, no shift)
 *
 * Flow:
 * 1. Create 4 random polynomials f₀, f₁, f₂, f₃
 * 2. Commit using interleaved Pippenger: C = commit_interleaved([f₀, f₁, f₂, f₃])
 * 3. Generate challenge point u = (u₂, ..., u_{log_n+1})
 * 4. Evaluate each fⱼ(u) individually
 * 5. Get interleaving challenges u₀, u₁
 * 6. Compute batched eval = Σⱼ fⱼ(u) · Lⱼ(u₀,u₁)
 * 7. Open with Shplemini (unshifted only)
 */
TEST_F(ShpleminiInterleavedTest, UnshiftedOnly)
{
    // Create 4 random polynomials (not shiftable - no shift needed)
    auto polys = create_random_polynomials();

    // Commit using interleaved Pippenger
    CK ck(interleaved_size);
    std::array<PolynomialSpan<const Fr>, BATCH_SIZE> poly_spans = { PolynomialSpan<const Fr>(polys[0]),
                                                                    PolynomialSpan<const Fr>(polys[1]),
                                                                    PolynomialSpan<const Fr>(polys[2]),
                                                                    PolynomialSpan<const Fr>(polys[3]) };
    Commitment interleaved_commitment = ck.commit_interleaved<BATCH_SIZE>(poly_spans);

    // Generate sumcheck challenge
    std::vector<Fr> sumcheck_challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        sumcheck_challenge[i] = Fr::random_element();
    }

    // Evaluate each polynomial at sumcheck challenge
    std::array<Fr, BATCH_SIZE> individual_evals;
    for (size_t j = 0; j < BATCH_SIZE; ++j) {
        individual_evals[j] = polys[j].evaluate_mle(sumcheck_challenge);
    }

    // Get interleaving challenges
    Fr u0 = Fr::random_element();
    Fr u1 = Fr::random_element();

    // Compute Lagrange basis and batched evaluation
    auto lagrange_basis = compute_lagrange_basis(u0, u1);
    Fr batched_eval = compute_batched_evaluation(lagrange_basis, individual_evals);

    // Build full challenge: prepend interleaving challenges to sumcheck challenge
    std::vector<Fr> full_challenge;
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_challenge.begin(), sumcheck_challenge.end());

    // Ground truth: evaluate the interleaved polynomial directly
    Polynomial interleaved_poly = interleave_polynomials(polys);
    Fr ground_truth = interleaved_poly.evaluate_mle(full_challenge);
    EXPECT_EQ(batched_eval, ground_truth) << "Batched eval should match direct interleaved eval";

    // --- Prover ---
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(interleaved_size);
    polynomial_batcher.set_unshifted(RefVector<Polynomial>{ interleaved_poly });

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(interleaved_size, polynomial_batcher, full_challenge, ck, prover_transcript);

    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // --- Verifier ---
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, 1> commitments = { interleaved_commitment };
    std::array<Fr, 1> evals = { batched_eval };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted =
                                    ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(evals) } };

    std::vector<Fr> padding_indicator(full_challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, full_challenge, Commitment::one(), verifier_transcript);

    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);
    EXPECT_TRUE(verified) << "Unshifted interleaved opening should verify";
}

/**
 * @brief Test Shplemini with 4 interleaved shiftable polynomials
 *
 * Flow:
 * 1. Prover: Create 4 shiftable polynomials f₀, f₁, f₂, f₃
 * 2. Prover: Commit using interleaved Pippenger: C = commit_interleaved([f₀, f₁, f₂, f₃])
 * 3. Generate challenge point u = (u₂, ..., u_{log_n+1}) [simulates sumcheck]
 * 4. Prover: Evaluate each fⱼ(u) and fⱼ_shift(u)
 * 5. Prover/Verifier: Get interleaving challenges u₀, u₁ from transcript
 * 6. Verifier: Compute Lagrange basis Lⱼ(u₀, u₁)
 * 7. Verifier: Reconstruct F(u₀,u₁,u) = Σⱼ fⱼ(u) · Lⱼ(u₀,u₁)
 * 8. Verifier: Verify opening with Shplemini
 */
TEST_F(ShpleminiInterleavedTest, InterleavedShiftablePolynomials)
{
    // Step 1: Create 4 shiftable polynomials
    auto polys = create_shiftable_polynomials();

    // Verify they're shiftable
    for (size_t j = 0; j < BATCH_SIZE; ++j) {
        EXPECT_EQ(polys[j][0], Fr::zero()) << "Polynomial " << j << " should be shiftable (first coeff = 0)";
    }

    // Step 2: Commit using interleaved Pippenger
    CK ck(interleaved_size);

    std::array<PolynomialSpan<const Fr>, BATCH_SIZE> poly_spans = { PolynomialSpan<const Fr>(polys[0]),
                                                                    PolynomialSpan<const Fr>(polys[1]),
                                                                    PolynomialSpan<const Fr>(polys[2]),
                                                                    PolynomialSpan<const Fr>(polys[3]) };

    Commitment interleaved_commitment = ck.commit_interleaved<BATCH_SIZE>(poly_spans);

    // Step 3: Generate "sumcheck" challenge point (without u₀, u₁ - those come later)
    std::vector<Fr> sumcheck_challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        sumcheck_challenge[i] = Fr::random_element();
    }
    // Step 4: Prover evaluates each polynomial at sumcheck challenge
    std::array<Fr, BATCH_SIZE> individual_evals;
    std::array<Fr, BATCH_SIZE> individual_shifted_evals;

    for (size_t j = 0; j < BATCH_SIZE; ++j) {
        individual_evals[j] = polys[j].evaluate_mle(sumcheck_challenge);
        // Shifted evaluation: evaluate the polynomial left-shifted by 1
        // f_shift[i] = f[i+1], so f_shift(u) is just f(u) evaluated on the shifted polynomial
        Polynomial poly_shifted(n);
        for (size_t i = 0; i + 1 < n; ++i) {
            poly_shifted.at(i) = polys[j][i + 1];
        }
        individual_shifted_evals[j] = poly_shifted.evaluate_mle(sumcheck_challenge);
    }
    info("Individual polynomial evaluations computed");

    // Step 5: Get interleaving challenges
    // For this test, generate them as random elements (in real protocol they come from transcript after sumcheck)
    Fr u0 = Fr::random_element();
    Fr u1 = Fr::random_element();
    info("Interleaving challenges: u₀=", u0, ", u₁=", u1);

    // Step 6: Verifier computes Lagrange basis
    auto lagrange_basis = compute_lagrange_basis(u0, u1);

    // Step 7: Verifier reconstructs batched evaluations
    Fr batched_eval_unshifted = compute_batched_evaluation(lagrange_basis, individual_evals);
    Fr batched_eval_shifted = compute_batched_evaluation(lagrange_basis, individual_shifted_evals);
    info("Batched evaluations: unshifted=", batched_eval_unshifted, ", shifted=", batched_eval_shifted);

    // Ground truth: evaluate the interleaved polynomial directly
    std::vector<Fr> full_challenge;
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_challenge.begin(), sumcheck_challenge.end());

    Polynomial interleaved_poly = interleave_polynomials(polys);
    Fr ground_truth_unshifted = interleaved_poly.evaluate_mle(full_challenge);

    EXPECT_EQ(batched_eval_unshifted, ground_truth_unshifted)
        << "Verifier's batched eval should match direct interleaved eval";

    // Ground truth for shifted: F_shifted[i] = F[i + BATCH_SIZE]
    Polynomial shifted_ground_truth_poly(interleaved_size);
    for (size_t i = 0; i + BATCH_SIZE < interleaved_size; ++i) {
        shifted_ground_truth_poly.at(i) = interleaved_poly[i + BATCH_SIZE];
    }
    Fr ground_truth_shifted = shifted_ground_truth_poly.evaluate_mle(full_challenge);

    EXPECT_EQ(batched_eval_shifted, ground_truth_shifted)
        << "Verifier's shifted batched eval should match direct shifted eval";

    // Step 8: Prover runs Shplemini
    // Create prover transcript using test initialization
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // The interleaved poly is shiftable-by-4 since all f_j[0] = 0, making indices 0-3 all zero.
    // Re-create as shiftable so the batcher can call .shifted(4).
    Polynomial interleaved_shiftable = Polynomial::shiftable(interleaved_size, interleaved_size, BATCH_SIZE);
    for (size_t i = 1; i < n; ++i) {
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            interleaved_shiftable.at(4 * i + j) = polys[j][i];
        }
    }

    // Set up PolynomialBatcher with the interleaved polynomial
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(interleaved_size, BATCH_SIZE);

    polynomial_batcher.set_unshifted(RefVector<Polynomial>{ interleaved_poly });
    polynomial_batcher.set_to_be_shifted(RefVector<Polynomial>{ interleaved_shiftable });

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(interleaved_size, polynomial_batcher, full_challenge, ck, prover_transcript);

    info("Prover opening claim computed");

    // Compute KZG opening proof (final step)
    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // Step 9: Verifier verifies
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    // Verifier uses the same interleaving challenges (in real protocol these come from transcript after sumcheck)
    // For this test, we already have them from step 5
    // Note: The commitment is not in the transcript - it's passed directly to ClaimBatcher

    // Build claim batcher for verifier (using reconstructed batched evaluations)
    std::array<Commitment, 1> commitments = { interleaved_commitment };
    std::array<Fr, 1> evals = { batched_eval_unshifted };
    std::array<Fr, 1> shifted_evals = { batched_eval_shifted };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(evals) },
                                .shifted =
                                    ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(shifted_evals) },
                                .shift_exponent = BATCH_SIZE };

    // Padding indicator: size = virtual_log_n (size of full_challenge)
    std::vector<Fr> padding_indicator(full_challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, full_challenge, Commitment::one(), verifier_transcript);

    info("Verifier batch opening claim computed");

    // Verify the opening proof using KZG
    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    // Verify the pairing
    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);

    EXPECT_TRUE(verified) << "Shplemini interleaved opening should verify";
}

/**
 * @brief Test with a mix of unshiftable and shiftable interleaved polynomials
 *
 * @details Opens two interleaved polynomials:
 *  - P_unshiftable: opened only as unshifted
 *  - P_shiftable: opened both as unshifted and as shift-by-4
 *
 * This mimics the real multi_mega flow where some polynomials are witness-only (unshifted)
 * and others need both unshifted and shifted openings.
 *
 * @note For even shift exponent k, the partially evaluated polynomials satisfy A₀₊ = A₀₋
 * since (-r)^k = r^k. This is correct but means the prover redundantly computes the same
 * polynomial twice. See the note in PolynomialBatcher::compute_partially_evaluated_batch_polynomials.
 */
TEST_F(ShpleminiInterleavedTest, MixedUnshiftedAndShifted)
{
    // Create two sets of component polynomials
    auto unshiftable_polys = create_random_polynomials();
    auto shiftable_polys = create_shiftable_polynomials();

    // Interleave both sets
    Polynomial unshiftable_interleaved = interleave_polynomials(unshiftable_polys);
    Polynomial shiftable_interleaved = interleave_polynomials(shiftable_polys);

    // Commit using direct commitment (commit_interleaved has a known issue with start_index > 0)
    CK ck(interleaved_size);
    Commitment C_unshiftable = ck.commit(unshiftable_interleaved);
    Commitment C_shiftable = ck.commit(shiftable_interleaved);

    // Generate sumcheck challenge
    std::vector<Fr> sumcheck_challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        sumcheck_challenge[i] = Fr::random_element();
    }

    // Evaluate each component polynomial at sumcheck challenge
    std::array<Fr, BATCH_SIZE> unshiftable_evals;
    std::array<Fr, BATCH_SIZE> shiftable_evals;
    std::array<Fr, BATCH_SIZE> shiftable_shifted_evals;

    for (size_t j = 0; j < BATCH_SIZE; ++j) {
        unshiftable_evals[j] = unshiftable_polys[j].evaluate_mle(sumcheck_challenge);
        shiftable_evals[j] = shiftable_polys[j].evaluate_mle(sumcheck_challenge);
        // Shifted evaluation: f_shift[i] = f[i+1]
        Polynomial poly_shifted(n);
        for (size_t i = 0; i + 1 < n; ++i) {
            poly_shifted.at(i) = shiftable_polys[j][i + 1];
        }
        shiftable_shifted_evals[j] = poly_shifted.evaluate_mle(sumcheck_challenge);
    }

    // Get interleaving challenges
    Fr u0 = Fr::random_element();
    Fr u1 = Fr::random_element();
    auto lagrange_basis = compute_lagrange_basis(u0, u1);

    // Verifier reconstructs batched evaluations
    Fr batched_eval_unshiftable = compute_batched_evaluation(lagrange_basis, unshiftable_evals);
    Fr batched_eval_shiftable = compute_batched_evaluation(lagrange_basis, shiftable_evals);
    Fr batched_eval_shifted = compute_batched_evaluation(lagrange_basis, shiftable_shifted_evals);

    // Build full challenge
    std::vector<Fr> full_challenge;
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_challenge.begin(), sumcheck_challenge.end());

    // --- Prover ---
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // Create shiftable-by-4 version for the to-be-shifted slot
    Polynomial shiftable_for_shift = Polynomial::shiftable(interleaved_size, interleaved_size, BATCH_SIZE);
    for (size_t i = 1; i < n; ++i) {
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            shiftable_for_shift.at(4 * i + j) = shiftable_polys[j][i];
        }
    }

    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(interleaved_size, BATCH_SIZE);

    // Two unshifted polys, one to-be-shifted
    polynomial_batcher.set_unshifted(RefVector<Polynomial>{ unshiftable_interleaved, shiftable_interleaved });
    polynomial_batcher.set_to_be_shifted(RefVector<Polynomial>{ shiftable_for_shift });

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(interleaved_size, polynomial_batcher, full_challenge, ck, prover_transcript);

    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // --- Verifier ---
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    // Unshifted: [C_unshiftable, C_shiftable], evals: [batched_eval_unshiftable, batched_eval_shiftable]
    // Shifted:   [C_shiftable], evals: [batched_eval_shifted]
    std::array<Commitment, 2> unshifted_commitments = { C_unshiftable, C_shiftable };
    std::array<Fr, 2> unshifted_evals_arr = { batched_eval_unshiftable, batched_eval_shiftable };
    std::array<Commitment, 1> shifted_commitments = { C_shiftable };
    std::array<Fr, 1> shifted_evals_arr = { batched_eval_shifted };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ RefArray<Commitment, 2>(unshifted_commitments), RefArray<Fr, 2>(unshifted_evals_arr) },
        .shifted = ClaimBatch{ RefArray<Commitment, 1>(shifted_commitments), RefArray<Fr, 1>(shifted_evals_arr) },
        .shift_exponent = BATCH_SIZE
    };

    std::vector<Fr> padding_indicator(full_challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, full_challenge, Commitment::one(), verifier_transcript);

    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);
    EXPECT_TRUE(verified) << "Mixed unshifted + shifted interleaved opening should verify";
}

} // namespace bb
