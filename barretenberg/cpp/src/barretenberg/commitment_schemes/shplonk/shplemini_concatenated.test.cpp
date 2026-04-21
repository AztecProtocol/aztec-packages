/**
 * @file shplemini_concatenated.test.cpp
 * @brief Unit test for Shplemini with concatenated polynomial commitments
 *
 * Tests the case where minicircuit polynomials are committed using concatenation,
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
     * @brief Create 16 minicircuit-sized random polynomials with values in [1, MINI)
     */
    std::array<Polynomial, CONCATENATION_GROUP_SIZE> create_minicircuit_polynomials()
    {
        std::array<Polynomial, CONCATENATION_GROUP_SIZE> polys;
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            polys[j] = Polynomial(MINI - 1, n, 1);
            for (size_t idx = 1; idx < MINI; ++idx) {
                polys[j].at(idx) = Fr::random_element();
            }
        }
        return polys;
    }

    /**
     * @brief Concatenate 16 minicircuit polynomials: concat[j*MINI + idx] = wire[j][idx]
     */
    Polynomial concatenate_polynomials(const std::array<Polynomial, CONCATENATION_GROUP_SIZE>& polys)
    {
        Polynomial concatenated(n - 1, n, 1);
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            for (size_t idx = 1; idx < MINI; ++idx) {
                concatenated.at(j * MINI + idx) = polys[j][idx];
            }
        }
        return concatenated;
    }

    /**
     * @brief Compute batched evaluation = [1/L₀(u_top)] * Σⱼ Lⱼ(u_top) * eval_j
     * @details Uses little-endian Lagrange basis: L₀ = Π(1-uᵢ), L₁ = u₀·Π_{i>0}(1-uᵢ), etc.
     */
    Fr compute_batched_evaluation(const std::vector<Fr>& challenge,
                                  const std::array<Fr, CONCATENATION_GROUP_SIZE>& individual_evals)
    {
        Fr padding = Fr::one();
        for (size_t i = 0; i < k; ++i) {
            padding *= (Fr::one() - challenge[log_n - k + i]);
        }

        Fr result = Fr::zero();
        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            Fr lagrange_j = Fr::one();
            for (size_t bit = 0; bit < k; ++bit) {
                bool bit_set = (j >> bit) & 1;
                lagrange_j *= bit_set ? challenge[log_n - k + bit] : (Fr::one() - challenge[log_n - k + bit]);
            }
            result += lagrange_j * individual_evals[j];
        }
        return result * padding.invert();
    }

    /**
     * @brief Compute batched evaluations (unshifted + shifted) for a group of wires at a challenge point,
     * and verify them against direct evaluation of the concatenated polynomial.
     */
    std::pair<Fr, Fr> evaluate_concatenation_group(const std::array<Polynomial, CONCATENATION_GROUP_SIZE>& wires,
                                                   const Polynomial& concat_poly,
                                                   const std::vector<Fr>& challenge)
    {
        std::array<Fr, CONCATENATION_GROUP_SIZE> wire_evals;
        std::array<Fr, CONCATENATION_GROUP_SIZE> wire_shift_evals;

        for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; ++j) {
            wire_evals[j] = wires[j].evaluate_mle(challenge);
            wire_shift_evals[j] = wires[j].shifted().evaluate_mle(challenge);
        }

        Fr batched_unshifted = compute_batched_evaluation(challenge, wire_evals);
        Fr batched_shifted = compute_batched_evaluation(challenge, wire_shift_evals);

        EXPECT_EQ(batched_unshifted, concat_poly.evaluate_mle(challenge));
        EXPECT_EQ(batched_shifted, concat_poly.shifted().evaluate_mle(challenge));

        return { batched_unshifted, batched_shifted };
    }

    /**
     * @brief Run Shplemini prove-and-verify for N concatenated polynomials (unshifted + shifted).
     */
    template <size_t N>
    bool prove_and_verify(std::array<Polynomial, N>& concat_polys,
                          std::array<Commitment, N>& commitments,
                          std::array<Fr, N>& unshifted_evals,
                          std::array<Fr, N>& shifted_evals,
                          std::vector<Fr>& challenge)
    {
        CK ck(n);

        // --- Prover ---
        auto prover_transcript = NativeTranscript::test_prover_init_empty();

        using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
        PolynomialBatcher polynomial_batcher(n);

        std::vector<Polynomial> polys_vec(concat_polys.begin(), concat_polys.end());
        polynomial_batcher.set_unshifted(RefVector<Polynomial>(polys_vec));
        polynomial_batcher.set_to_be_shifted_by_one(RefVector<Polynomial>(polys_vec));

        auto prover_opening_claim =
            ShpleminiProver_<Curve>::prove(n, polynomial_batcher, challenge, ck, prover_transcript);
        KZG<Curve>::compute_opening_proof(ck, prover_opening_claim, prover_transcript);

        // --- Verifier ---
        auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

        using ClaimBatcher = ClaimBatcher_<Curve>;
        using ClaimBatch = ClaimBatcher::Batch;

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefArray<Commitment, N>(commitments), RefArray<Fr, N>(unshifted_evals) },
            .shifted = ClaimBatch{ RefArray<Commitment, N>(commitments), RefArray<Fr, N>(shifted_evals) }
        };

        auto shplemini_output = ShpleminiVerifier_<Curve>::compute_batch_opening_claim(
            claim_batcher, challenge, Commitment::one(), verifier_transcript);

        auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(
            std::move(shplemini_output.batch_opening_claim), verifier_transcript);

        return pairing_points.check();
    }
};

TEST_F(ShpleminiConcatenatedTest, SingleGroup)
{
    auto wires = create_minicircuit_polynomials();
    std::array<Polynomial, 1> concat_polys = { concatenate_polynomials(wires) };

    CK ck(n);
    std::array<Commitment, 1> commitments = { ck.commit(concat_polys[0]) };

    std::vector<Fr> challenge(log_n);
    for (auto& u : challenge) {
        u = Fr::random_element();
    }

    auto [unshifted, shifted] = evaluate_concatenation_group(wires, concat_polys[0], challenge);
    std::array<Fr, 1> unshifted_evals = { unshifted };
    std::array<Fr, 1> shifted_evals = { shifted };

    EXPECT_TRUE(prove_and_verify(concat_polys, commitments, unshifted_evals, shifted_evals, challenge));
}

TEST_F(ShpleminiConcatenatedTest, MultipleGroups)
{
    constexpr size_t NUM_GROUPS = 5;

    CK ck(n);

    std::array<std::array<Polynomial, CONCATENATION_GROUP_SIZE>, NUM_GROUPS> all_groups;
    std::array<Polynomial, NUM_GROUPS> concat_polys;
    std::array<Commitment, NUM_GROUPS> commitments;

    for (size_t g = 0; g < NUM_GROUPS; ++g) {
        all_groups[g] = create_minicircuit_polynomials();
        concat_polys[g] = concatenate_polynomials(all_groups[g]);
        commitments[g] = ck.commit(concat_polys[g]);
    }

    std::vector<Fr> challenge(log_n);
    for (auto& u : challenge) {
        u = Fr::random_element();
    }

    std::array<Fr, NUM_GROUPS> unshifted_evals;
    std::array<Fr, NUM_GROUPS> shifted_evals;

    for (size_t g = 0; g < NUM_GROUPS; ++g) {
        auto [u, s] = evaluate_concatenation_group(all_groups[g], concat_polys[g], challenge);
        unshifted_evals[g] = u;
        shifted_evals[g] = s;
    }

    EXPECT_TRUE(prove_and_verify(concat_polys, commitments, unshifted_evals, shifted_evals, challenge));
}

} // namespace bb
