#pragma once

#include "barretenberg/polynomials/polynomial.hpp"
#include <memory>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief Generate batching challenges for interleaved polynomial groups.
 * @details Generates N-1 random challenges from transcript for batching N polynomials.
 * The first polynomial uses implicit coefficient 1, so we prepend FF(1) to create full N-length challenge vectors.
 */
template <typename FF, typename Transcript>
std::pair<std::vector<FF>, std::vector<FF>> get_interleaved_batching_challenges(
    const std::shared_ptr<Transcript>& transcript, size_t num_unshifted, size_t num_shifted)
{
    std::vector<std::string> labels_unshifted(num_unshifted - 1);
    std::vector<std::string> labels_shifted(num_shifted - 1);

    for (size_t idx = 0; idx < num_unshifted - 1; idx++) {
        labels_unshifted[idx] = "unshifted_challenge_" + std::to_string(idx);
    }
    for (size_t idx = 0; idx < num_shifted - 1; idx++) {
        labels_shifted[idx] = "shifted_challenge_" + std::to_string(idx);
    }

    auto unshifted_challenges = transcript->template get_challenges<FF>(labels_unshifted);
    auto shifted_challenges = transcript->template get_challenges<FF>(labels_shifted);

    // Prepend implicit coefficient 1 for the first polynomial
    unshifted_challenges.insert(unshifted_challenges.begin(), FF(1));
    shifted_challenges.insert(shifted_challenges.begin(), FF(1));

    return { unshifted_challenges, shifted_challenges };
}

/**
 * @brief Batch interleaved polynomial groups using the batch-then-interleave pattern.
 *
 * @details For each chunk position j in [0, batch_size), computes
 *     batched_chunk[j] = Σ_i challenge_i * group_i[j]
 * then interleaves: result[batch_size * i + j] = batched_chunk[j][i].
 *
 * Processes shifted groups first (they share polynomials with the last unshifted groups),
 * then unshifted groups with greedy freeing: after consuming each unshifted group,
 * its source polynomials are reset to free memory.
 *
 * @param unshifted_groups Mutable groups (non-const pointers) for greedy freeing
 * @param shifted_groups Const groups (read-only)
 * @param unshifted_challenges One scalar per unshifted group
 * @param shifted_challenges One scalar per shifted group
 * @param component_size Size of individual polynomials (n)
 * @param batch_size Interleaving batch size (k), output size = n * k
 * @return {batched_unshifted, batched_to_be_shifted}
 */
template <typename FF>
std::pair<Polynomial<FF>, Polynomial<FF>> batch_interleaved_polynomial_groups(
    std::vector<std::vector<Polynomial<FF>*>>& unshifted_groups,
    const std::vector<std::vector<Polynomial<FF> const*>>& shifted_groups,
    const std::vector<FF>& unshifted_challenges,
    const std::vector<FF>& shifted_challenges,
    size_t component_size,
    size_t batch_size)
{
    const size_t interleaved_size = component_size * batch_size;

    // Process shifted groups FIRST (they share polynomials with the last unshifted groups,
    // so must be consumed before those polynomials are freed during unshifted iteration)
    Polynomial<FF> batched_to_be_shifted = Polynomial<FF>::shiftable(interleaved_size, interleaved_size, batch_size);
    {
        std::vector<Polynomial<FF>> batched_shifted_chunks(batch_size, Polynomial<FF>(component_size));
        for (size_t i = 0; i < shifted_groups.size(); i++) {
            for (size_t j = 0; j < batch_size; j++) {
                if (j < shifted_groups[i].size() && shifted_groups[i][j] != nullptr) {
                    batched_shifted_chunks[j].add_scaled(*shifted_groups[i][j], shifted_challenges[i]);
                }
            }
        }
        // Interleave shifted chunks. Skip i=0 since shifted polys have 0 at index 0.
        for (size_t i = 1; i < component_size; i++) {
            for (size_t j = 0; j < batch_size; j++) {
                batched_to_be_shifted.at(batch_size * i + j) += batched_shifted_chunks[j][i];
            }
        }
    }

    // Process unshifted groups, freeing each group's source polynomials after consumption
    Polynomial<FF> batched_unshifted(interleaved_size);
    {
        std::vector<Polynomial<FF>> batched_unshifted_chunks(batch_size, Polynomial<FF>(component_size));
        for (size_t i = 0; i < unshifted_groups.size(); i++) {
            for (size_t j = 0; j < batch_size; j++) {
                if (j < unshifted_groups[i].size() && unshifted_groups[i][j] != nullptr) {
                    batched_unshifted_chunks[j].add_scaled(*unshifted_groups[i][j], unshifted_challenges[i]);
                }
            }
            // Free consumed polynomials to reduce peak memory
            for (auto* ptr : unshifted_groups[i]) {
                if (ptr != nullptr) {
                    *ptr = Polynomial<FF>();
                }
            }
        }
        // Interleave unshifted chunks
        for (size_t i = 0; i < component_size; i++) {
            for (size_t j = 0; j < batch_size; j++) {
                batched_unshifted.at(batch_size * i + j) += batched_unshifted_chunks[j][i];
            }
        }
    }

    return { std::move(batched_unshifted), std::move(batched_to_be_shifted) };
}

/**
 * @brief Result of batching interleaved verifier claims (commitments + evaluations).
 */
template <typename Commitment, typename FF> struct InterleavedBatchResult {
    Commitment unshifted_commitment;
    Commitment shifted_commitment;
    FF unshifted_evaluation;
    FF shifted_evaluation;
};

/**
 * @brief Batch interleaved commitments and evaluations for verification.
 * @details Shared by MultiMega and HyperNova verifiers to pre-batch interleaved groups
 * into single unshifted/shifted commitment-evaluation pairs.
 *
 * Note: batch_mul supports a max_num_bits parameter for circuit efficiency with short scalars.
 */
template <typename Commitment, typename FF>
InterleavedBatchResult<Commitment, FF> batch_interleaved_verifier_claims(
    const std::vector<Commitment>& unshifted_comms,
    const std::vector<Commitment>& shifted_comms,
    const std::vector<std::vector<FF const*>>& unshifted_eval_groups,
    const std::vector<std::vector<FF const*>>& shifted_eval_groups,
    const std::vector<FF>& unshifted_challenges,
    const std::vector<FF>& shifted_challenges,
    const std::array<FF, 4>& lagrange_basis)
{
    // Compute batched evaluations from individual evaluation groups via Lagrange basis
    auto compute_group_eval = [&lagrange_basis](const std::vector<FF const*>& group) -> FF {
        FF result(0);
        for (size_t j = 0; j < 4; ++j) {
            FF val = (j < group.size() && group[j] != nullptr) ? *group[j] : FF(0);
            result += val * lagrange_basis[j];
        }
        return result;
    };

    FF batched_unshifted_eval(0);
    for (size_t i = 0; i < unshifted_eval_groups.size(); i++) {
        batched_unshifted_eval += compute_group_eval(unshifted_eval_groups[i]) * unshifted_challenges[i];
    }

    FF batched_shifted_eval(0);
    for (size_t i = 0; i < shifted_eval_groups.size(); i++) {
        batched_shifted_eval += compute_group_eval(shifted_eval_groups[i]) * shifted_challenges[i];
    }

    // Batch commitments via MSM (short scalars can be used here for circuit efficiency)
    // ???
    Commitment batched_unshifted_comm = Commitment::batch_mul(unshifted_comms, unshifted_challenges, 127);
    Commitment batched_shifted_comm = Commitment::batch_mul(shifted_comms, shifted_challenges, 127);

    return { batched_unshifted_comm, batched_shifted_comm, batched_unshifted_eval, batched_shifted_eval };
}

/**
 * @brief Batch interleaved evaluations for verification. Commitments are batched all in one go.
 */
template <typename FF>
std::pair<FF, FF> batch_interleaved_evals(const std::vector<std::vector<FF const*>>& unshifted_eval_groups,
                                          const std::vector<std::vector<FF const*>>& shifted_eval_groups,
                                          const std::vector<FF>& unshifted_challenges,
                                          const std::vector<FF>& shifted_challenges,
                                          const std::array<FF, 4>& lagrange_basis)
{
    // Compute batched evaluations from individual evaluation groups via Lagrange basis
    auto compute_group_eval = [&lagrange_basis](const std::vector<FF const*>& group) -> FF {
        FF result(0);
        for (size_t j = 0; j < 4; ++j) {
            FF val = (j < group.size() && group[j] != nullptr) ? *group[j] : FF(0);
            result += val * lagrange_basis[j];
        }
        return result;
    };

    FF batched_unshifted_eval(0);
    for (size_t i = 0; i < unshifted_eval_groups.size(); i++) {
        batched_unshifted_eval += compute_group_eval(unshifted_eval_groups[i]) * unshifted_challenges[i];
    }

    FF batched_shifted_eval(0);
    for (size_t i = 0; i < shifted_eval_groups.size(); i++) {
        batched_shifted_eval += compute_group_eval(shifted_eval_groups[i]) * shifted_challenges[i];
    }

    return { batched_unshifted_eval, batched_shifted_eval };
}

} // namespace bb
