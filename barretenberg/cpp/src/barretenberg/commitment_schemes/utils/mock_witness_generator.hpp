#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
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
                       std::shared_ptr<CommitmentKey>& commitment_key)
        : ck(commitment_key) // Initialize the commitment key
        , polynomial_batcher(poly_size)

    {
        const size_t total_num_to_be_shifted = num_to_be_shifted + num_to_be_right_shifted_by_k;
        ASSERT(num_polynomials >= total_num_to_be_shifted);
        const size_t num_not_to_be_shifted = num_polynomials - total_num_to_be_shifted;

        // Construct claim data for polynomials that are NOT to be shifted
        for (size_t idx = 0; idx < num_not_to_be_shifted; idx++) {
            Polynomial poly = Polynomial::random(poly_size);
            unshifted.commitments.push_back(ck->commit(poly));
            unshifted.evals.push_back(poly.evaluate_mle(mle_opening_point));
            unshifted.polys.push_back(std::move(poly));
        }

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
    }

    template <typename Flavor>
    void compute_sumcheck_opening_data(const size_t n,
                                       const size_t log_n,
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

        // Simulate the `const proof size` logic
        auto round_univariate = bb::Polynomial<Fr>(n);
        for (size_t idx = log_n; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            round_univariates.push_back(round_univariate);
            sumcheck_commitments.push_back(ck->commit(round_univariate));
            sumcheck_evaluations.push_back({ Fr(0), Fr(0), Fr(0) });
        }
    }
};

} // namespace bb