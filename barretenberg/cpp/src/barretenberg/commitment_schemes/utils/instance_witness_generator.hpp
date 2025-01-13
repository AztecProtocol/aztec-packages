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
    std::vector<Polynomial> unshifted_polynomials = {};
    std::vector<Polynomial> to_be_shifted_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments = {};
    std::vector<Commitment> to_be_shifted_commitments;
    std::vector<Fr> unshifted_evals = {};
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
        if (!unshifted_polynomials.empty()) {
            for (size_t idx = 0; idx < num_unshifted; idx++) {
                unshifted_polynomials[idx] = Polynomial::random(n);
                unshifted_commitments.push_back(ck->commit(unshifted_polynomials[idx]));
                unshifted_evals.push_back(unshifted_polynomials[idx].evaluate_mle(mle_opening_point));
            }
        }

        // Constructs polynomials that are being shifted
        for (auto& poly : to_be_shifted_polynomials) {
            poly = Polynomial::random(n, /*shiftable*/ 1);
            const Commitment comm = this->ck->commit(poly);
            to_be_shifted_commitments.push_back(comm);
            shifted_evals.push_back(poly.evaluate_mle(mle_opening_point, true));
        }

        size_t idx = num_unshifted;

        // Add unshifted evaluations of shiftable polynomials
        if (!unshifted_polynomials.empty()) {
            for (const auto& [poly, comm] : zip_view(to_be_shifted_polynomials, to_be_shifted_commitments)) {
                unshifted_polynomials[idx] = poly;
                unshifted_commitments.push_back(comm);
                unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
                idx++;
            }
        }
    }
};

} // namespace bb