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

    std::vector<Fr> unshifted_combined_evals;
    std::vector<Fr> shifted_combined_evals;

    std::vector<Fr> lagrange_coeffs = {};

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

    InstanceWitnessGenerator(const size_t num_polys_in_group,
                             const size_t n,
                             const size_t num_polynomials,
                             const size_t num_shiftable,
                             const std::vector<Fr>& mle_opening_point,
                             const std::vector<Fr>& extra_challenges,
                             std::shared_ptr<CommitmentKey>& commitment_key)
        : ck(commitment_key) // Initialize the commitment key
        , unshifted_polynomials(num_polynomials)
        , to_be_shifted_polynomials(num_shiftable)
        , lagrange_coeffs(populate_lagrange_coeffs(extra_challenges))

    {
        construct_multi_instance_and_witnesses(num_polys_in_group, n, mle_opening_point);

        evaluate_chunks();
    }

    void construct_multi_instance_and_witnesses(const size_t num_polys_in_group,
                                                const size_t n,
                                                std::vector<Fr>& mle_opening_point)
    {

        const size_t num_unshifted = unshifted_polynomials.size() - to_be_shifted_polynomials.size();

        // Constructs polynomials that are not shifted
        for (size_t idx = 0; idx < num_unshifted; idx++) {
            unshifted_polynomials[idx] = Polynomial::random(n * num_polys_in_group);
            unshifted_commitments.push_back(ck->commit(unshifted_polynomials[idx]));
            evaluate_chunks(unshifted_polynomials[idx], mle_opening_point, num_polys_in_group, n);
        }

        // Constructs polynomials that are being shifted
        size_t idx = num_unshifted;
        for (auto& poly : to_be_shifted_polynomials) {
            poly = Polynomial::random(n * num_polys_in_group, /*shiftable*/ 1);
            unshifted_polynomials[idx] = poly;
            const Commitment comm = this->ck->commit(poly);
            unshifted_commitments.push_back(comm);
            to_be_shifted_commitments.push_back(comm);
            evaluate_chunks(unshifted_polynomials[idx], mle_opening_point, num_polys_in_group, n, true);
            idx++;
        }
    }
    void evaluate_chunks(const auto& poly,
                         const std::vector<Fr>& mle_opening_point,
                         const size_t num_polys_in_group,
                         const size_t n,
                         const bool shifted = false)
    {

        for (size_t idx = 0; idx < num_polys_in_group; idx++) {
            size_t start_idx = poly.start_index() + idx * n;
            auto chunk = PolynomialSpan<Fr>(start_idx, poly.coeffs()).subspan(/*offset=*/n);
            unshifted_evals.push_back(chunk.evaluate_mle(mle_opening_point));
            if (shifted) {
                shifted_evals.push_back(chunk.evaluate_mle(mle_opening_point, shifted));
            }
        }
    }

    void verifier_combine_from_chunks(const size_t num_polys_in_group)
    {
        size_t num_unshifted_evals = unshifted_evals.size() / num_polys_in_group;

        for (size_t group_idx = 0; group_idx < num_unshifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval += unshifted_evals[chunk_idx * group_idx] * lagrange_coeffs[chunk_idx];
            }

            unshifted_combined_evals.push_back(combined_eval);
        }

        size_t num_shifted_evals = shifted_evals.size() / num_polys_in_group;

        for (size_t group_idx = 0; group_idx < num_shifted_evals; group_idx++) {
            Fr combined_eval = Fr{ 0 };
            for (size_t chunk_idx = 0; chunk_idx < num_polys_in_group; chunk_idx++) {
                combined_eval += unshifted_evals[chunk_idx * group_idx] * lagrange_coeffs[chunk_idx];
            }

            unshifted_combined_evals.push_back(combined_eval);
        }
    }

    void populate_lagrange_coeffs(std::vector<Fr>& extra_challenges)
    {
        // Start with a single element [1]
        lagrange_coeffs.push_back(Fr{ 1 });

        // Repeatedly "double" the vector by multiplying half by (1 - x_j) and half by x_j
        for (size_t j = 0; j < extra_challenges.size(); ++j) {
            Fr current_challenge = extra_challenges[j];
            size_t old_size = lagrange_coeffs.size();
            std::vector<Fr> lagrange_coeffs_next(old_size * 2);

            for (size_t i = 0; i < old_size; ++i) {
                lagrange_coeffs_next[i] = lagrange_coeffs[i] * (Fr(1) - current_challenge);
                lagrange_coeffs_next[i + old_size] = lagrange_coeffs[i] * current_challenge;
            }
            lagrange_coeffs = std::move(lagrange_coeffs_next);
        }
    }
};

} // namespace bb