#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <vector>

namespace bb {
/**
 * @brief Generate the tuple of concatenation inputs used for testing the opening protocol when used for Translator VM.
 */
template <typename Curve>
static std::tuple<std::vector<std::vector<bb::Polynomial<typename Curve::ScalarField>>>,
                  std::vector<bb::Polynomial<typename Curve::ScalarField>>,
                  std::vector<typename Curve::ScalarField>,
                  std::vector<std::vector<typename Curve::AffineElement>>>
generate_concatenation_inputs(std::vector<typename Curve::ScalarField>& u_challenge,
                              const size_t num_concatenated,
                              const size_t concatenation_index,
                              const std::shared_ptr<CommitmentKey<Curve>> ck)
{
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

    size_t N = 1 << u_challenge.size();
    size_t MINI_CIRCUIT_N = N / concatenation_index;

    // Polynomials "chunks" that are concatenated in the PCS
    std::vector<std::vector<Polynomial>> concatenation_groups;

    // Concatenated polynomials
    std::vector<Polynomial> concatenated_polynomials;

    // Evaluations of concatenated polynomials
    std::vector<Fr> c_evaluations;

    // For each polynomial to be concatenated
    for (size_t i = 0; i < num_concatenated; ++i) {
        std::vector<Polynomial> concatenation_group;
        Polynomial concatenated_polynomial(N);
        // For each chunk
        for (size_t j = 0; j < concatenation_index; j++) {
            Polynomial chunk_polynomial(N);
            // Fill the chunk polynomial with random values and appropriately fill the space in
            // concatenated_polynomial
            for (size_t k = 0; k < MINI_CIRCUIT_N; k++) {
                // Chunks should be shiftable
                auto tmp = Fr(0);
                if (k > 0) {
                    tmp = Fr::random_element();
                }
                chunk_polynomial.at(k) = tmp;
                concatenated_polynomial.at(j * MINI_CIRCUIT_N + k) = tmp;
            }
            concatenation_group.emplace_back(chunk_polynomial);
        }
        // Store chunks
        concatenation_groups.emplace_back(concatenation_group);
        // Store concatenated polynomial
        concatenated_polynomials.emplace_back(concatenated_polynomial);
        // Get evaluation
        c_evaluations.emplace_back(concatenated_polynomial.evaluate_mle(u_challenge));
    }

    // Compute commitments of all polynomial chunks
    std::vector<std::vector<Commitment>> concatenation_groups_commitments;
    for (size_t i = 0; i < num_concatenated; ++i) {
        std::vector<Commitment> concatenation_group_commitment;
        for (size_t j = 0; j < concatenation_index; j++) {
            concatenation_group_commitment.emplace_back(ck->commit(concatenation_groups[i][j]));
        }
        concatenation_groups_commitments.emplace_back(concatenation_group_commitment);
    }

    return { concatenation_groups, concatenated_polynomials, c_evaluations, concatenation_groups_commitments };
};
} // namespace bb