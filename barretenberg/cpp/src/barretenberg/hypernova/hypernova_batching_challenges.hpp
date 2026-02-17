// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <memory>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief Generate batching challenges for HyperNova folding.
 *
 * @details Generates N-1 random challenges from transcript for batching N polynomials.
 * The first polynomial uses implicit coefficient 1, so we prepend FF(1) to create
 * full N-length challenge vectors.
 *
 * @tparam FF Field type
 * @tparam Transcript Transcript type
 * @param transcript Shared transcript for Fiat-Shamir
 * @param num_unshifted Number of unshifted entities (N)
 * @param num_shifted Number of shifted entities (M)
 * @return Pair of challenge vectors: (unshifted_challenges, shifted_challenges)
 */
template <typename FF, typename Transcript>
std::pair<std::vector<FF>, std::vector<FF>> get_hypernova_batching_challenges(
    const std::shared_ptr<Transcript>& transcript, size_t num_unshifted, size_t num_shifted)
{
    // Generate N-1 random challenges from transcript (first polynomial uses implicit coefficient 1)
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

} // namespace bb
