/**
 * @file shplemini_concatenated.test.cpp
 * @brief Unit test for Shplemini with concatenated polynomial commitments
 *
 * Tests the case where we have 16 minicircuit polynomials committed using concatenation,
 * representing F(X) where F is laid out in 16 sequential blocks (lanes).
 *
 * Mimics the flow in TranslatorProver/Verifier where:
 * - Prover commits to concatenated polynomial
 * - Sumcheck produces individual polynomial evaluations
 * - Verifier reconstructs batched evaluation using Lagrange decomposition with padding factor
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

class ShpleminiConcatenatedTest : public CommitmentTest<curve::BN254> {
  public:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;

    static constexpr size_t mini_log_n = 8;                // log of minicircuit size
    static constexpr size_t MINI = 1UL << mini_log_n;      // minicircuit size (256)
    static constexpr size_t CONCATENATION_GROUP_SIZE = 16; // number of wires per group
    static constexpr size_t log_n = mini_log_n + 4;        // log of concatenated size (8 + 4 = 12)
    static constexpr size_t n = 1UL << log_n;              // concatenated size (4096)
    static constexpr size_t k = 4; // log₂(CONCATENATION_GROUP_SIZE) = extra challenges for concatenation

    /**
     * @brief Create 16 minicircuit-sized random polynomials (not shiftable)
     */
    std::array<Polynomial, CONCATENATION_GROUP_SIZE> create_random_minicircuit_polynomials()
    {
        std::array<Polynomial, CONCATENATION_GROUP_SIZE> polys;
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            // Minicircuit size, embedded in full space
            polys[j] = Polynomial(MINI - 1, n, 1);
            for (size_t k = 1; k < MINI; ++k) {
                polys[j].at(k) = Fr::random_element();
            }
        }
        return polys;
    }

    /**
     * @brief Create 16 minicircuit-sized shiftable polynomials
     */
    std::array<Polynomial, CONCATENATION_GROUP_SIZE> create_shiftable_minicircuit_polynomials()
    {
        std::array<Polynomial, CONCATENATION_GROUP_SIZE> polys;
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            polys[j] = Polynomial(MINI - 1, n, 1);
            // Start from 1 (index 0 is implicitly 0 due to start_index=1)
            for (size_t k = 1; k < MINI; ++k) {
                polys[j].at(k) = Fr::random_element();
            }
        }
        return polys;
    }

    /**
     * @brief Concatenate 16 minicircuit polynomials: concat[j*MINI + k] = wire[j][k]
     * @details Wires occupy sequential blocks (lanes), not interleaved
     */
    Polynomial concatenate_polynomials(const std::array<Polynomial, CONCATENATION_GROUP_SIZE>& polys)
    {
        Polynomial concatenated(n - 1, n, 1);
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            for (size_t k = 1; k < MINI; ++k) {
                concatenated.at(j * MINI + k) = polys[j][k];
            }
        }
        return concatenated;
    }

    /**
     * @brief Compute Lagrange basis for concatenation with little-endian bit ordering
     * @details L₀ = (1-u₀)(1-u₁)(1-u₂)(1-u₃), L₁ = u₀(1-u₁)(1-u₂)(1-u₃), etc.
     * Little-endian: bit i of j corresponds to challenge u[i]
     */
    std::array<Fr, CONCATENATION_GROUP_SIZE> compute_lagrange_basis(const std::array<Fr, k>& u_top)
    {
        std::array<Fr, CONCATENATION_GROUP_SIZE> lagrange_basis;
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            lagrange_basis[j] = Fr::one();
            for (size_t bit = 0; bit < k; ++bit) {
                // Little-endian: bit i of j corresponds to challenge u_top[i]
                bool bit_set = (j >> bit) & 1;
                lagrange_basis[j] *= bit_set ? u_top[bit] : (Fr::one() - u_top[bit]);
            }
        }
        return lagrange_basis;
    }

    /**
     * @brief Compute batched evaluation with padding factor
     * @details Wires have values in [1,MINI) embedded in full space, so wire_j(u_full) = L₀(u_top) * wire_j(u_mini)
     * Therefore: concat(u) = [1/L₀(u_top)] * Σⱼ Lⱼ(u_top) * wire_j(u_full)
     */
    Fr compute_batched_evaluation(const std::array<Fr, k>& u_top,
                                  const std::array<Fr, CONCATENATION_GROUP_SIZE>& lagrange_basis,
                                  const std::array<Fr, CONCATENATION_GROUP_SIZE>& individual_evals)
    {
        // Compute L₀(u_top) = (1-u₀)(1-u₁)(1-u₂)(1-u₃) - the padding factor
        Fr padding = Fr::one();
        for (size_t i = 0; i < k; ++i) {
            padding *= (Fr::one() - u_top[i]);
        }
        Fr padding_inv = padding.invert();

        Fr result = Fr::zero();
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            result += lagrange_basis[j] * individual_evals[j];
        }
        return result * padding_inv;
    }
};

/**
 * @brief Basic test: open a single concatenated polynomial (unshifted only)
 *
 * Flow:
 * 1. Create 16 minicircuit polynomials (wires)
 * 2. Concatenate into single polynomial: concat[j*MINI + k] = wire[j][k]
 * 3. Commit to concatenated polynomial
 * 4. Generate challenge point u = (u₀, ..., u_{log_n-1})
 * 5. Evaluate each wire at u (17-dimensional)
 * 6. Extract top 4 challenges u_top for Lagrange basis
 * 7. Compute batched eval = [1/L₀(u_top)] * Σⱼ Lⱼ(u_top) * wire_j(u)
 * 8. Verify with Shplemini
 */
TEST_F(ShpleminiConcatenatedTest, UnshiftedOnly)
{
    // Create 16 minicircuit polynomials
    auto wires = create_random_minicircuit_polynomials();

    // Concatenate into single polynomial
    Polynomial concat_poly = concatenate_polynomials(wires);

    // Commit
    CK ck(n);
    Commitment concat_commitment = ck.commit(concat_poly);

    // Generate challenge point (full dimension)
    std::vector<Fr> challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        challenge[i] = Fr::random_element();
    }

    // Extract top 4 challenges
    std::array<Fr, k> u_top;
    for (size_t i = 0; i < k; ++i) {
        u_top[i] = challenge[log_n - k + i];
    }

    // Evaluate each wire at full challenge
    std::array<Fr, CONCATENATION_GROUP_SIZE> wire_evals;
    for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
        wire_evals[j] = wires[j].evaluate_mle(challenge);
    }

    // Compute Lagrange basis and batched evaluation
    auto lagrange_basis = compute_lagrange_basis(u_top);
    Fr batched_eval = compute_batched_evaluation(u_top, lagrange_basis, wire_evals);

    // Ground truth: evaluate concatenated polynomial directly
    Fr ground_truth = concat_poly.evaluate_mle(challenge);
    EXPECT_EQ(batched_eval, ground_truth) << "Batched eval should match direct concatenated eval";

    // --- Prover ---
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(n);
    polynomial_batcher.set_unshifted(RefVector<Polynomial>{ concat_poly });

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(n, polynomial_batcher, challenge, ck, prover_transcript);

    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // --- Verifier ---
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, 1> commitments = { concat_commitment };
    std::array<Fr, 1> evals = { batched_eval };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted =
                                    ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(evals) } };

    std::vector<Fr> padding_indicator(challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, challenge, Commitment::one(), verifier_transcript);

    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);
    EXPECT_TRUE(verified) << "Unshifted concatenated opening should verify";
}

/**
 * @brief Test with shiftable concatenated polynomials (both unshifted and shifted)
 *
 * Flow similar to UnshiftedOnly but with shifted evaluations as well
 */
TEST_F(ShpleminiConcatenatedTest, ConcatenatedShiftablePolynomials)
{
    // Create 16 shiftable minicircuit polynomials
    auto wires = create_shiftable_minicircuit_polynomials();

    // Concatenate
    Polynomial concat_poly = concatenate_polynomials(wires);

    // Commit
    CK ck(n);
    Commitment concat_commitment = ck.commit(concat_poly);

    // Generate challenge
    std::vector<Fr> challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        challenge[i] = Fr::random_element();
    }

    // Extract top 4 challenges
    std::array<Fr, k> u_top;
    for (size_t i = 0; i < k; ++i) {
        u_top[i] = challenge[log_n - k + i];
    }

    // Evaluate wires and their shifts
    std::array<Fr, CONCATENATION_GROUP_SIZE> wire_evals;
    std::array<Fr, CONCATENATION_GROUP_SIZE> wire_shift_evals;

    for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
        wire_evals[j] = wires[j].evaluate_mle(challenge);
        wire_shift_evals[j] = wires[j].shifted().evaluate_mle(challenge);
    }

    // Compute Lagrange basis
    auto lagrange_basis = compute_lagrange_basis(u_top);

    // Compute batched evaluations
    Fr batched_eval_unshifted = compute_batched_evaluation(u_top, lagrange_basis, wire_evals);
    Fr batched_eval_shifted = compute_batched_evaluation(u_top, lagrange_basis, wire_shift_evals);

    // Ground truth
    Fr ground_truth_unshifted = concat_poly.evaluate_mle(challenge);
    Fr ground_truth_shifted = concat_poly.shifted().evaluate_mle(challenge);

    EXPECT_EQ(batched_eval_unshifted, ground_truth_unshifted) << "Unshifted batched eval should match direct eval";
    EXPECT_EQ(batched_eval_shifted, ground_truth_shifted) << "Shifted batched eval should match direct shifted eval";

    // --- Prover ---
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(n);

    polynomial_batcher.set_unshifted(RefVector<Polynomial>{ concat_poly });
    polynomial_batcher.set_to_be_shifted_by_one(RefVector<Polynomial>{ concat_poly });

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(n, polynomial_batcher, challenge, ck, prover_transcript);

    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // --- Verifier ---
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, 1> commitments = { concat_commitment };
    std::array<Fr, 1> unshifted_evals_arr = { batched_eval_unshifted };
    std::array<Fr, 1> shifted_evals_arr = { batched_eval_shifted };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(unshifted_evals_arr) },
        .shifted = ClaimBatch{ RefArray<Commitment, 1>(commitments), RefArray<Fr, 1>(shifted_evals_arr) }
    };

    std::vector<Fr> padding_indicator(challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, challenge, Commitment::one(), verifier_transcript);

    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);
    EXPECT_TRUE(verified) << "Shiftable concatenated opening should verify";
}

/**
 * @brief Test with multiple concatenated groups (mimics translator with 5 concatenated polynomials)
 */
TEST_F(ShpleminiConcatenatedTest, MultipleGroups)
{
    constexpr size_t NUM_GROUPS = 5;

    // Create 5 groups of 16 wires each
    std::array<std::array<Polynomial, CONCATENATION_GROUP_SIZE>, NUM_GROUPS> all_groups;
    std::array<Polynomial, NUM_GROUPS> concat_polys;
    std::array<Commitment, NUM_GROUPS> commitments;

    CK ck(n);

    for (size_t g = 0; g < NUM_GROUPS; ++g) {
        all_groups[g] = create_shiftable_minicircuit_polynomials();
        concat_polys[g] = concatenate_polynomials(all_groups[g]);
        commitments[g] = ck.commit(concat_polys[g]);
    }

    // Generate challenge
    std::vector<Fr> challenge(log_n);
    for (size_t i = 0; i < log_n; ++i) {
        challenge[i] = Fr::random_element();
    }

    // Extract top 4 challenges
    std::array<Fr, k> u_top;
    for (size_t i = 0; i < k; ++i) {
        u_top[i] = challenge[log_n - k + i];
    }

    // Compute Lagrange basis once
    auto lagrange_basis = compute_lagrange_basis(u_top);

    // Evaluate all groups
    std::array<Fr, NUM_GROUPS> batched_evals_unshifted;
    std::array<Fr, NUM_GROUPS> batched_evals_shifted;

    for (size_t g = 0; g < NUM_GROUPS; ++g) {
        std::array<Fr, CONCATENATION_GROUP_SIZE> wire_evals;
        std::array<Fr, CONCATENATION_GROUP_SIZE> wire_shift_evals;

        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            wire_evals[j] = all_groups[g][j].evaluate_mle(challenge);
            wire_shift_evals[j] = all_groups[g][j].shifted().evaluate_mle(challenge);
        }

        batched_evals_unshifted[g] = compute_batched_evaluation(u_top, lagrange_basis, wire_evals);
        batched_evals_shifted[g] = compute_batched_evaluation(u_top, lagrange_basis, wire_shift_evals);

        // Verify against ground truth
        EXPECT_EQ(batched_evals_unshifted[g], concat_polys[g].evaluate_mle(challenge))
            << "Group " << g << " unshifted batched eval mismatch";
        EXPECT_EQ(batched_evals_shifted[g], concat_polys[g].shifted().evaluate_mle(challenge))
            << "Group " << g << " shifted batched eval mismatch";
    }

    // --- Prover ---
    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    PolynomialBatcher polynomial_batcher(n);

    // Convert array to vector for RefVector
    std::vector<Polynomial> concat_polys_vec(concat_polys.begin(), concat_polys.end());
    polynomial_batcher.set_unshifted(RefVector<Polynomial>(concat_polys_vec));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector<Polynomial>(concat_polys_vec));

    using OpeningClaim = ProverOpeningClaim<Curve>;
    OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(n, polynomial_batcher, challenge, ck, prover_transcript);

    KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

    // --- Verifier ---
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefArray<Commitment, NUM_GROUPS>(commitments),
                                                         RefArray<Fr, NUM_GROUPS>(batched_evals_unshifted) },
                                .shifted = ClaimBatch{ RefArray<Commitment, NUM_GROUPS>(commitments),
                                                       RefArray<Fr, NUM_GROUPS>(batched_evals_shifted) } };

    std::vector<Fr> padding_indicator(challenge.size(), Fr{ 1 });

    auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
        padding_indicator, claim_batcher, challenge, Commitment::one(), verifier_transcript);

    auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(std::move(shplemini_output.batch_opening_claim),
                                                                        verifier_transcript);

    VK vk;
    bool verified = vk.pairing_check(pairing_points[0], pairing_points[1]);
    EXPECT_TRUE(verified) << "Multiple concatenated groups should verify";
}

} // namespace bb
