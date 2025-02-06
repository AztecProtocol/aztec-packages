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

template <typename Curve> struct MockMultiClaimGenerator {
  public:
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using PolynomialBatcher = bb::GeminiProver_<Curve>::PolynomialBatcher;

    std::shared_ptr<CommitmentKey> ck;
    std::vector<Polynomial> unshifted_polynomials;
    std::vector<Polynomial> to_be_shifted_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments;
    std::vector<Commitment> to_be_shifted_commitments;
    std::vector<Fr> unshifted_evals;
    std::vector<Fr> shifted_evals;
    ClaimBatcher claim_batcher;
    PolynomialBatcher polynomial_batcher;

    Polynomial random_poly;

    std::vector<Fr> unshifted_combined_evals;
    std::vector<Fr> shifted_combined_evals;

    std::vector<Fr> extra_challenges;
    std::vector<Fr> lagrange_coeffs;

    MockMultiClaimGenerator(const size_t num_polys_in_group,
                            const size_t n,
                            const size_t num_polynomials,
                            const size_t num_shiftable,
                            std::vector<Fr>& mle_opening_point,
                            std::vector<Fr>& extra_challenges)
        : ck(create_commitment_key<CommitmentKey>(num_polys_in_group * n))
        , unshifted_polynomials(num_polynomials / num_polys_in_group)
        , to_be_shifted_polynomials(num_shiftable / num_polys_in_group)
        , polynomial_batcher(n * num_polys_in_group)
        , random_poly(n * num_polys_in_group) // Initialize the commitment key
        , extra_challenges(extra_challenges)
        , lagrange_coeffs(ClaimBatcher::compute_lagranges_for_multi_claim(extra_challenges))
    {

        construct_multi_instance_and_witnesses(
            num_polynomials, num_shiftable, num_polys_in_group, n, mle_opening_point);
    }

    void construct_multi_instance_and_witnesses(const size_t num_polys,
                                                const size_t num_shiftable,
                                                const size_t num_polys_in_group,
                                                const size_t n, /* max size of the polynomial in the group*/
                                                std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = (num_polys - num_shiftable) / num_polys_in_group;

        // Constructs polynomials that are not shifted
        for (size_t idx = 0; idx < num_unshifted; idx++) {
            // Create a concatenated polynomial that is not going to be shifted
            unshifted_polynomials[idx] = Polynomial::random(num_polys_in_group * n);
            // Commit using big srs
            const auto comm = ck->commit(unshifted_polynomials[idx]);
            unshifted_commitments.push_back(comm);

            // We are proving the evaluations of chunks - the sumcheck prover will submit a huge vector of claimed
            // evaluations, it's verifier's task to reconstruct the evaluations of concatenated polys
            evaluate_chunks(unshifted_polynomials[idx], mle_opening_point, num_polys_in_group, n);
        }

        // Construct polynomials that are being shifted
        for (size_t idx = 0; idx < num_shiftable / num_polys_in_group; idx++) {
            // Generate a big random polynomial to be treated as a concatenation of its chunks of size n, we assume that
            // both shifted and unshifted evaluation of a shiftable polynomial a being proved.
            Polynomial random_shifted_poly = Polynomial::random(n * num_polys_in_group);

            // Imitate a concatenation of `num_polys_in_group` shiftable polynomials - they all have to start with
            // zeroes.
            for (size_t idx = 0; idx < num_polys_in_group; idx++) {
                random_shifted_poly.at(idx * n) = Fr{ 0 };
            }
            unshifted_polynomials[idx + num_unshifted] = random_shifted_poly;
            to_be_shifted_polynomials[idx] = random_shifted_poly;

            const Commitment comm = this->ck->commit(random_shifted_poly);

            // Process commitments
            unshifted_commitments.push_back(comm);
            to_be_shifted_commitments.push_back(comm);

            // We are proving the evaluations of chunks! Evaluate each chunk and its shift
            evaluate_chunks(random_shifted_poly, mle_opening_point, num_polys_in_group, n, true);
        }

        // Here, we are using concatenated polynomials, the chunks are irrelevant at the stage of PCS
        polynomial_batcher.set_unshifted(RefVector(unshifted_polynomials));
        polynomial_batcher.set_to_be_shifted_by_one(RefVector(to_be_shifted_polynomials));

        // This must be a step after sumcheck - before Shplemini
        combine_from_chunks(num_polys_in_group, lagrange_coeffs);

        // The claim batcher simply accepts the **combined_evals**. After that everythings remains the same
        claim_batcher = ClaimBatcher{
            .unshifted = ClaimBatch{ RefVector(unshifted_commitments), RefVector(unshifted_combined_evals) },
            .shifted = ClaimBatch{ RefVector(to_be_shifted_commitments), RefVector(shifted_combined_evals) }
        };
    }
    /**
     * @brief Each big polynomial is split into `num_polys_in_group` chunks of size `n`. In practice, the chunks are
     * polynomials evaluated in sumcheck.
     *
     * @param poly
     * @param mle_opening_point
     * @param num_polys_in_group
     * @param n
     * @param shifted
     */
    void evaluate_chunks(PolynomialSpan<Fr> poly,
                         const std::vector<Fr>& mle_opening_point,
                         const size_t num_polys_in_group,
                         const size_t n,
                         const bool shifted = false)
    {

        for (size_t idx = 0; idx < num_polys_in_group; idx++) {

            size_t start_idx = idx * n;
            // Get a slice of coefficients (idx*n, (idx+1)n -1)
            std::span<Fr> chunk = poly.subspan(start_idx, n).span;
            // Created a redundant poly, because evaluate_mle is static in Polynomial class, this could def be fixed by
            // by separating evaluate_mle from Polynomial class.
            Polynomial chunk_poly = Polynomial(chunk);
            unshifted_evals.push_back(chunk_poly.evaluate_mle(mle_opening_point));

            if (shifted) {
                //  Doing smth sacrilegious here to evaluate a shift of a given slice. In practice the evaluation
                //  happens inside Sumcheck, but we need to decide how to access these chunks efficiently in the first
                //  round.
                Polynomial chunk_shifted = Polynomial(n - 1, n, 1);
                for (size_t idx = 1; idx < n; idx++) {
                    chunk_shifted.at(idx) = chunk_poly.at(idx);
                }

                shifted_evals.push_back(chunk_shifted.evaluate_mle(mle_opening_point, true));
            }
        }
    }
    /**
     * @brief The verifier needs to `parse` prover's claimed evaluations by grouping them by 2^{num_polys_in_group} and
     * taking the sums of elements in each group multiplied by the corresponding Lagrange coefficient. I.e. the
     * evaluation of the i'th poly in a group is multiplied by L_i evaluated at the `extra_challenges`.
     *
     * @param num_polys_in_group
     * @param lagrange_coeffs
     */
    void combine_from_chunks(const size_t num_polys_in_group, auto& lagrange_coeffs)
    {
        size_t num_concatenated_unshifted_evals = unshifted_evals.size() / num_polys_in_group;

        for (size_t group_idx = 0; group_idx < num_concatenated_unshifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval +=
                    unshifted_evals[chunk_idx + num_polys_in_group * group_idx] * lagrange_coeffs[chunk_idx];
            }
            unshifted_combined_evals.push_back(combined_eval);
        }

        const size_t num_concatenated_shifted_evals = shifted_evals.size() / num_polys_in_group;

        for (size_t group_idx = 0; group_idx < num_concatenated_shifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };

            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval += shifted_evals[chunk_idx + num_polys_in_group * group_idx] * lagrange_coeffs[chunk_idx];
            }
            shifted_combined_evals.push_back(combined_eval);
        }
    }
};
} // namespace bb