#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "commitment_key.test.hpp"

namespace bb {

template <typename Curve> struct PCSInstanceWitnessGenerator {
  public:
    using CommitmentKey = CommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

    std::shared_ptr<CommitmentKey> ck;
    std::vector<Polynomial> polynomials;
    std::vector<Polynomial> shiftable_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments;
    std::vector<Commitment> shifted_commitments;
    std::vector<Fr> unshifted_evals;
    std::vector<Fr> shifted_evals;

    PCSInstanceWitnessGenerator(const size_t n,
                                const size_t num_polynomials,
                                const size_t num_shiftable,
                                const std::vector<Fr>& mle_opening_point,
                                std::shared_ptr<CommitmentKey>& commitment_key)
        : ck(commitment_key) // Initialize the commitment key
        , polynomials(num_polynomials)
        , shiftable_polynomials(num_shiftable)

    {
        construct_instance_and_witnesses(n, mle_opening_point);
    }

    void construct_instance_and_witnesses(size_t n, const std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = polynomials.size() - shiftable_polynomials.size();

        for (size_t idx = 0; idx < num_unshifted; idx++) {
            polynomials[idx] = Polynomial::random(n);
            unshifted_commitments.push_back(ck->commit(polynomials[idx]));
            unshifted_evals.push_back(polynomials[idx].evaluate_mle(mle_opening_point));
        }

        size_t idx = num_unshifted;
        for (auto& poly : shiftable_polynomials) {
            poly = Polynomial::random(n, /*shiftable*/ 1);
            polynomials[idx] = poly;
            auto comm = this->ck->commit(poly);
            unshifted_commitments.push_back(comm);
            shifted_commitments.push_back(comm);
            unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
            shifted_evals.push_back(poly.evaluate_mle(mle_opening_point, true));
            idx++;
        }
    }
};

} // namespace bb