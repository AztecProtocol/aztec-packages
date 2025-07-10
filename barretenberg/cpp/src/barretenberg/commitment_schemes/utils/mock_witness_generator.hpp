// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/test_utils.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
/**
 * @brief Constructs random polynomials, computes commitments and corresponding evaluations.
 *
 * @tparam Curve
 */
template <typename Curve> struct MockClaimGenerator {
  public:
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using PolynomialBatcher = bb::GeminiProver_<Curve>::PolynomialBatcher;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using InterleavedBatch = ClaimBatcher::InterleavedBatch;

    std::shared_ptr<CommitmentKey> ck;

    struct ClaimData {
        std::vector<Polynomial> polys;
        std::vector<Commitment> commitments;
        std::vector<Fr> evals;
    };

    ClaimData unshifted;
    ClaimData to_be_shifted;
    ClaimData to_be_right_shifted_by_k;

    std::vector<Fr> const_size_mle_opening_point;

    PolynomialBatcher polynomial_batcher;
    ClaimBatcher claim_batcher;

    // Containers for mock Sumcheck data
    std::vector<bb::Polynomial<Fr>> round_univariates;
    std::vector<Commitment> sumcheck_commitments;
    std::vector<std::array<Fr, 3>> sumcheck_evaluations;

    struct InterleaveData {
        std::vector<std::vector<Polynomial>> groups;
        std::vector<Polynomial> polys;
        std::vector<Fr> evaluations;
        std::vector<std::vector<Commitment>> group_commitments;
    };
    InterleaveData interleave_data;

    static constexpr size_t k_magnitude = 6; // mock shift magnitude for right-shift-by-k (assumed even)

    /**
     * @brief Construct claim data for a set of random polynomials with the specified type
     * @note All to-be-shifted polynomials have an unshifted counterpart so the total number of claims is
     * num_polynomials + num_to_be_shifted
     *
     * @param poly_size size of mock polynomials
     * @param num_polynomials total number of unique polynomials
     * @param num_to_be_shifted number of polynomials to-be-shifted
     * @param mle_opening_point
     * @param commitment_key
     */
    MockClaimGenerator(const size_t poly_size,
                       const size_t num_polynomials,
                       const size_t num_to_be_shifted,
                       const size_t num_to_be_right_shifted_by_k,
                       const std::vector<Fr>& mle_opening_point,
                       std::shared_ptr<CommitmentKey>& commitment_key,
                       size_t num_interleaved = 0,
                       size_t num_to_be_interleaved = 0)

        : ck(commitment_key) // Initialize the commitment key
        , polynomial_batcher(poly_size)

    {
        const size_t total_num_to_be_shifted = num_to_be_shifted + num_to_be_right_shifted_by_k;
        BB_ASSERT_GTE(num_polynomials, total_num_to_be_shifted);
        const size_t num_not_to_be_shifted = num_polynomials - total_num_to_be_shifted;

        // Construct claim data for polynomials that are NOT to be shifted
        for (size_t idx = 0; idx < 1; idx++) {
            Polynomial poly = Polynomial::random(poly_size);
            for (size_t i = 0; i < poly_size; ++i) {
                poly.at(i) = 0;
            }
            unshifted.commitments.push_back(ck->commit(poly));
            unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
            unshifted.polys.push_back(std::move(poly));
        }
        for (size_t idx = 1; idx < num_not_to_be_shifted; idx++) {
            Polynomial poly = Polynomial::random(poly_size);
            unshifted.commitments.push_back(ck->commit(poly));
            unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
            unshifted.polys.push_back(std::move(poly));
        }

        if (num_to_be_shifted > 3) {
            for (size_t idx = 0; idx < 1; idx++) {
                Polynomial poly = Polynomial::random(poly_size, /*shiftable*/ 1);
                Commitment commitment = ck->commit(poly);
                to_be_shifted.commitments.push_back(commitment);
                to_be_shifted.evals.push_back(poly.shifted().evaluate_mle(mle_opening_point));
                to_be_shifted.polys.push_back(poly.share());
                // Populate the unshifted counterpart in the unshifted claims
                unshifted.commitments.push_back(commitment);
                unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
                unshifted.polys.push_back(std::move(poly));
            }
            for (size_t idx = 1; idx < 2; idx++) {
                Polynomial poly = Polynomial::random(poly_size, /*shiftable*/ 1);
                for (size_t i = 0; i < poly_size; ++i) {
                    poly.at(i) = 0;
                }
                Commitment commitment = ck->commit(poly);
                to_be_shifted.commitments.push_back(commitment);
                to_be_shifted.evals.push_back(poly.shifted().evaluate_mle(mle_opening_point));
                to_be_shifted.polys.push_back(poly.share());
                // Populate the unshifted counterpart in the unshifted claims
                unshifted.commitments.push_back(commitment);
                unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
                unshifted.polys.push_back(std::move(poly));
            }

            // Construct claim data for polynomials that are to-be-shifted
            for (size_t idx = 2; idx < num_to_be_shifted; idx++) {
                Polynomial poly = Polynomial::random(poly_size, /*shiftable*/ 1);
                Commitment commitment = ck->commit(poly);
                to_be_shifted.commitments.push_back(commitment);
                to_be_shifted.evals.push_back(poly.shifted().evaluate_mle(mle_opening_point));
                to_be_shifted.polys.push_back(poly.share());
                // Populate the unshifted counterpart in the unshifted claims
                unshifted.commitments.push_back(commitment);
                unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
                unshifted.polys.push_back(std::move(poly));
            }
        } else {
            // Construct claim data for polynomials that are to-be-shifted
            for (size_t idx = 0; idx < num_to_be_shifted; idx++) {
                Polynomial poly = Polynomial::random(poly_size, /*shiftable*/ 1);
                Commitment commitment = ck->commit(poly);
                to_be_shifted.commitments.push_back(commitment);
                to_be_shifted.evals.push_back(poly.shifted().evaluate_mle(mle_opening_point));
                to_be_shifted.polys.push_back(poly.share());
                // Populate the unshifted counterpart in the unshifted claims
                unshifted.commitments.push_back(commitment);
                unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
                unshifted.polys.push_back(std::move(poly));
            }
        }

        // Construct claim data for polynomials that are to-be-right-shifted-by-k
        for (size_t idx = 0; idx < num_to_be_right_shifted_by_k; idx++) {
            Polynomial poly = Polynomial::random(poly_size - k_magnitude, poly_size, 0);
            Commitment commitment = ck->commit(poly);
            to_be_right_shifted_by_k.commitments.push_back(commitment);
            to_be_right_shifted_by_k.evals.push_back(poly.right_shifted(k_magnitude).evaluate_mle(mle_opening_point));
            to_be_right_shifted_by_k.polys.push_back(poly.share());
            // Populate the unshifted counterpart in the unshifted claims
            unshifted.commitments.push_back(commitment);
            unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
            unshifted.polys.push_back(std::move(poly));
        }

        polynomial_batcher.set_unshifted(RefVector(unshifted.polys));
        polynomial_batcher.set_to_be_shifted_by_one(RefVector(to_be_shifted.polys));
        polynomial_batcher.set_to_be_shifted_by_k(RefVector(to_be_right_shifted_by_k.polys), k_magnitude);

        claim_batcher =
            ClaimBatcher{ .unshifted = ClaimBatch{ RefVector(unshifted.commitments), RefVector(unshifted.evals) },
                          .shifted = ClaimBatch{ RefVector(to_be_shifted.commitments), RefVector(to_be_shifted.evals) },
                          .right_shifted_by_k = ClaimBatch{ RefVector(to_be_right_shifted_by_k.commitments),
                                                            RefVector(to_be_right_shifted_by_k.evals) },
                          .k_shift_magnitude = k_magnitude };
        if (num_interleaved > 0) {
            interleave_data =
                generate_interleaving_inputs(mle_opening_point, num_interleaved, num_to_be_interleaved, ck);
            polynomial_batcher.set_interleaved(RefVector(interleave_data.polys),
                                               to_vector_of_ref_vectors(interleave_data.groups));

            claim_batcher.interleaved =
                InterleavedBatch{ .commitments_groups = to_vector_of_ref_vectors(interleave_data.group_commitments),
                                  .evaluations = RefVector(interleave_data.evaluations) };
        }
    }

    // Generate zero polynomials to test edge cases in PCS
    MockClaimGenerator(const size_t n, const size_t num_zero_polynomials)
        : polynomial_batcher(n)
    {
        for (size_t idx = 0; idx < num_zero_polynomials; idx++) {
            unshifted.polys.emplace_back(n);
            unshifted.commitments.push_back(Commitment::infinity());
            unshifted.evals.push_back(Fr(0));
        }

        polynomial_batcher.set_unshifted(RefVector(unshifted.polys));

        claim_batcher =
            ClaimBatcher{ .unshifted = ClaimBatch{ RefVector(unshifted.commitments), RefVector(unshifted.evals) } };
    }

    InterleaveData generate_interleaving_inputs(const std::vector<Fr>& u_challenge,
                                                const size_t num_interleaved,
                                                const size_t group_size,
                                                const std::shared_ptr<CommitmentKey>& ck)
    {

        size_t N = 1 << u_challenge.size();
        size_t MINI_CIRCUIT_N = N / group_size; // size of chunks

        // Polynomials "chunks" that are interleaved in the PCS
        std::vector<std::vector<Polynomial>> groups;

        // Concatenated polynomials
        std::vector<Polynomial> interleaved_polynomials;

        // Evaluations of interleaved polynomials
        std::vector<Fr> c_evaluations;

        // For each polynomial to be interleaved
        for (size_t i = 0; i < num_interleaved; ++i) {
            std::vector<Polynomial> group;
            Polynomial interleaved_polynomial(N);
            for (size_t j = 0; j < group_size; j++) {
                Polynomial chunk_polynomial(N);
                // Fill the chunk polynomial with random values and appropriately fill the space in
                // interleaved_polynomial
                for (size_t k = 0; k < MINI_CIRCUIT_N; k++) {
                    // Chunks should be shiftable
                    auto tmp = Fr(0);
                    if (k > 0) {
                        tmp = Fr::random_element();
                    }
                    chunk_polynomial.at(k) = tmp;
                    interleaved_polynomial.at(k * group_size + j) = tmp;
                }
                group.emplace_back(chunk_polynomial);
            }
            // Store chunks
            groups.emplace_back(group);
            // Store interleaved polynomial
            interleaved_polynomials.emplace_back(interleaved_polynomial);
            // Get evaluation
            c_evaluations.emplace_back(interleaved_polynomial.evaluate_mle(u_challenge));
        }

        // Compute commitments of all polynomial chunks
        std::vector<std::vector<Commitment>> groups_commitments;
        for (size_t i = 0; i < num_interleaved; ++i) {
            std::vector<Commitment> group_commitment;
            for (size_t j = 0; j < group_size; j++) {
                group_commitment.emplace_back(ck->commit(groups[i][j]));
            }
            groups_commitments.emplace_back(group_commitment);
        }

        return { groups, interleaved_polynomials, c_evaluations, groups_commitments };
    }

    template <typename Flavor>
    void compute_sumcheck_opening_data(const size_t log_n,
                                       const size_t sumcheck_univariate_length,
                                       std::vector<Fr>& challenge,
                                       std::shared_ptr<CommitmentKey>& ck)
    {
        // Generate valid sumcheck polynomials of given length
        auto mock_sumcheck_polynomials = ZKSumcheckData<Flavor>(log_n, sumcheck_univariate_length);

        for (size_t idx = 0; idx < log_n; idx++) {
            bb::Polynomial<Fr> round_univariate = mock_sumcheck_polynomials.libra_univariates[idx];

            round_univariate.at(0) += mock_sumcheck_polynomials.libra_running_sum;

            sumcheck_commitments.push_back(ck->commit(round_univariate));

            sumcheck_evaluations.push_back({ round_univariate.at(0),
                                             round_univariate.evaluate(Fr(1)),
                                             round_univariate.evaluate(challenge[idx]) });

            mock_sumcheck_polynomials.update_zk_sumcheck_data(challenge[idx], idx);
            round_univariates.push_back(round_univariate);
        }
    }
};

} // namespace bb
