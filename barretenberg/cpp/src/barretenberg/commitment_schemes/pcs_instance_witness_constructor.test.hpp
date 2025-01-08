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

    std::vector<Polynomial> non_shiftable_polynomials;
    std::vector<Polynomial> shiftable_polynomials;
    std::vector<Fr> const_size_mle_opening_point;
    std::vector<Commitment> unshifted_commitments;
    std::vector<Commitment> shifted_commitments;
    std::vector<Fr> unshifted_evals;
    std::vector<Fr> shifted_evals;

    PCSInstanceWitnessGenerator(size_t n,
                                size_t num_unshiftable,
                                size_t num_shiftable,
                                std::vector<Fr>& const_size_mle_opening_point)
        : non_shiftable_polynomials(num_unshiftable)
        , shiftable_polynomials(num_shiftable)

    {
        construct_instance_and_witnesses(n, const_size_mle_opening_point);
    }

    void construct_instance_and_witnesses(size_t n, std::vector<Fr>& const_size_mle_opening_point)
    {
        std::vector<Fr> mle_opening_point(const_size_mle_opening_point.begin(),
                                          const_size_mle_opening_point.begin() + this->log_n);

        for (auto& poly : non_shiftable_polynomials) {
            poly = Polynomial::random(n);
            unshifted_commitments.push_back(this->commit(poly));
            unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
        }

        for (auto& poly : shiftable_polynomials) {
            poly = Polynomial::random(n, /*shiftable*/ 1);
            shifted_commitments.push_back(this->commit(poly));
            unshifted_evals.push_back(poly.evaluate_mle(mle_opening_point));
            shifted_evals.push_back(poly.evaluate_mle(mle_opening_point, true));
        }
    }
};

} // namespace bb
