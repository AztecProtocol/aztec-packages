#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
/**
 * @brief Constructs random polynomials, computes commitments and corresponding evaluations.
 *
 * @tparam Curve
 */
template <typename Curve> struct InstanceWitnessGenerator {
  public:
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

    std::shared_ptr<CommitmentKey> ck;
    std::vector<Polynomial> unshifted_polynomials;
    std::vector<Polynomial> to_be_shifted_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments;
    std::vector<Commitment> to_be_shifted_commitments;
    std::vector<Fr> unshifted_evals;
    std::vector<Fr> shifted_evals;

    InstanceWitnessGenerator(const size_t n,
                             const size_t num_polynomials,
                             const size_t num_shiftable,
                             const std::vector<Fr>& mle_opening_point,
                             std::shared_ptr<CommitmentKey>& commitment_key)
        : ck(commitment_key) // Initialize the commitment key
        , unshifted_polynomials(num_polynomials)
        , to_be_shifted_polynomials(num_shiftable)

    {
        construct_instance_and_witnesses(n, mle_opening_point);
    }

    void construct_instance_and_witnesses(size_t n, const std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = unshifted_polynomials.size() - to_be_shifted_polynomials.size();

        // Constructs polynomials that are not shifted
        for (size_t idx = 0; idx < num_unshifted; idx++) {
            unshifted_polynomials[idx] = Polynomial::random(n);
            unshifted_commitments.push_back(ck->commit(unshifted_polynomials[idx]));
            unshifted_evals.push_back(unshifted_polynomials[idx].evaluate_mle(mle_opening_point));
        }

        // Constructs polynomials that are being shifted
        size_t idx = num_unshifted;
        for (auto& poly : to_be_shifted_polynomials) {
            poly = Polynomial::random(n, /*shiftable*/ 1);
            unshifted_polynomials[idx] = poly;
            const Commitment comm = this->ck->commit(poly);
            unshifted_commitments.push_back(comm);
            to_be_shifted_commitments.push_back(comm);
            unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
            shifted_evals.push_back(poly.evaluate_mle(mle_opening_point, true));
            idx++;
        }
    }

    // Generate zero polynomials to test edge cases in PCS
    InstanceWitnessGenerator(const size_t n, const size_t num_zero_polynomials)
        : unshifted_polynomials(num_zero_polynomials)
    {
        for (size_t idx = 0; idx < num_zero_polynomials; idx++) {
            unshifted_polynomials[idx] = Polynomial(n);
            unshifted_commitments.push_back(Commitment::infinity());
            unshifted_evals.push_back(Fr(0));
        }
    }

    template <typename Flavor>
    void compute_sumcheck_opening_data(const size_t log_n,
                                       const size_t sumcheck_univariate_length,
                                       std::vector<bb::Polynomial<Fr>>& round_univariates,
                                       std::vector<Commitment>& sumcheck_commitments,
                                       std::vector<std::array<Fr, 3>>& sumcheck_evaluations,
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
        auto round_univariate = bb::Polynomial<Fr>(this->n);
        for (size_t idx = this->log_n; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            round_univariates.push_back(round_univariate);
            sumcheck_commitments.push_back(ck->commit(round_univariate));
            sumcheck_evaluations.push_back({ Fr(0), Fr(0), Fr(0) });
        }
    }
};

} // namespace bb