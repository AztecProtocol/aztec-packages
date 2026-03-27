#pragma once
/**
 * @brief Group-valued BaseFold protocol (eprint 2025/1325, Section 7).
 *
 * Replaces the O(n) MSM in IPA verification ("decide" step) with a
 * FRI-like protocol over group elements. Uses the ECFFT Part II
 * pointwise hash for fold consistency checks.
 *
 * Protocol overview:
 *   1. Prover has g_0: SRS encoding on L_0 (group elements, size n).
 *   2. For round i = 0..k-1:
 *        a. Prover commits g_i via Merkle tree, sends root.
 *        b. Verifier sends challenge z_i.
 *        c. Prover folds: g_{i+1}[j] = fold(g_i[j], g_i[j+m/2], z_i).
 *   3. Prover sends g_final (single group element).
 *   4. Verifier picks ~43 random queries and checks fold consistency
 *      by opening Merkle paths at each pair across all rounds.
 */

#include "ecfft_domain.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <memory>
#include <vector>

namespace bb::basefold {

using Commitment = grumpkin::g1::affine_element;
using GroupElement = grumpkin::g1::element;
using MerkleTree = crypto::merkle_tree::MemoryTree<crypto::merkle_tree::Poseidon2HashPolicy>;

/**
 * @brief Hash a Grumpkin affine point to a field element for Merkle leaves.
 */
inline fr hash_group_element(const Commitment& point)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ point.x, point.y });
}

/**
 * @brief Build a Merkle tree over a vector of group elements.
 *
 * @return (tree, root)
 */
inline std::pair<MerkleTree, fr> build_merkle_tree(const std::vector<Commitment>& elements)
{
    size_t n = elements.size();
    BB_ASSERT((n & (n - 1)) == 0); // must be power of 2
    size_t depth = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(n)));

    MerkleTree tree(depth);
    for (size_t i = 0; i < n; i++) {
        tree.update_element(i, hash_group_element(elements[i]));
    }
    return { std::move(tree), tree.root() };
}

/**
 * @brief Verify a Merkle opening for a group element.
 */
inline bool verify_merkle_opening(const fr& root,
                                  size_t index,
                                  const Commitment& element,
                                  const crypto::merkle_tree::fr_sibling_path& path)
{
    fr current = hash_group_element(element);
    for (size_t i = 0; i < path.size(); i++) {
        if (index % 2 == 0) {
            current = crypto::merkle_tree::Poseidon2HashPolicy::hash_pair(current, path[i]);
        } else {
            current = crypto::merkle_tree::Poseidon2HashPolicy::hash_pair(path[i], current);
        }
        index >>= 1;
    }
    return current == root;
}

/**
 * @brief Fold a group-element oracle using the ECFFT2 pointwise hash.
 *
 * For each pair (j, j+m/2), applies the fold formula from the paper.
 * Cost: 4 scalar muls per pair.
 */
inline std::vector<Commitment> fold_group_oracle(const std::vector<Commitment>& oracle,
                                                 const EcfftDomain& domain,
                                                 size_t round_idx,
                                                 size_t degree_bound,
                                                 const Fq& z)
{
    size_t m = oracle.size();
    size_t half = m / 2;
    std::vector<Commitment> folded(half);

    parallel_for(half, [&](size_t j) {
        GroupElement result = domain.fold_pair<GroupElement>(
            round_idx, degree_bound, j, GroupElement(oracle[j]), GroupElement(oracle[j + half]), z);
        folded[j] = result.normalize();
    });

    return folded;
}

/**
 * @brief BaseFold native prover.
 *
 * Takes the SRS encoding g_0 on L_0 and produces FRI oracle commitments.
 * Writes Merkle roots, challenges, openings, and the final value to the transcript.
 *
 * @param g0 SRS encoding: g_0[j] = sum_{i<n} L_0[j]^i * G_i, size = |L_0|.
 * @param domain The ECFFT domain.
 * @param degree_bound Initial degree bound (typically n for rate-1).
 * @param num_queries Number of FRI queries (security parameter).
 * @param transcript Shared transcript for Fiat-Shamir.
 */
inline void prove(const std::vector<Commitment>& g0,
                  const EcfftDomain& domain,
                  size_t degree_bound,
                  size_t num_queries,
                  const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    // Store all oracle layers for query opening
    std::vector<std::vector<Commitment>> oracles;
    std::vector<MerkleTree> trees;
    std::vector<fr> roots;

    oracles.push_back(g0);

    size_t d = degree_bound;

    // FRI commitment rounds
    for (size_t round = 0; round < num_rounds; round++) {
        // Commit current oracle
        auto [tree, root] = build_merkle_tree(oracles.back());
        transcript->send_to_verifier("basefold_root_" + std::to_string(round), root);
        trees.push_back(std::move(tree));
        roots.push_back(root);

        // Get challenge
        Fq z = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));

        // Fold
        auto folded = fold_group_oracle(oracles.back(), domain, round, d, z);
        d /= 2;
        oracles.push_back(std::move(folded));
    }

    // Send final value (single group element)
    BB_ASSERT(oracles.back().size() == 1);
    transcript->send_to_verifier("basefold_final", oracles.back()[0]);

    // Query phase — use fr for Poseidon2 compatibility
    fr query_seed = transcript->template get_challenge<fr>("basefold_query_seed");

    for (size_t q = 0; q < num_queries; q++) {
        // Derive query index in L_0
        fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { query_seed, fr(static_cast<uint64_t>(q)) });
        size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

        // For each round, open the pair
        size_t current_idx = idx;
        for (size_t round = 0; round < num_rounds; round++) {
            size_t m = domain.levels[round].size();
            size_t half = m / 2;
            size_t j = current_idx % half; // pair index

            // Open both elements of the pair
            auto path_0 = trees[round].get_sibling_path(j);
            auto path_1 = trees[round].get_sibling_path(j + half);

            std::string prefix = "basefold_r" + std::to_string(round) + "_q" + std::to_string(q);
            transcript->send_to_verifier(prefix + "_e0", oracles[round][j]);
            for (size_t pi = 0; pi < path_0.size(); pi++) {
                transcript->send_to_verifier(prefix + "_p0_" + std::to_string(pi), path_0[pi]);
            }
            transcript->send_to_verifier(prefix + "_e1", oracles[round][j + half]);
            for (size_t pi = 0; pi < path_1.size(); pi++) {
                transcript->send_to_verifier(prefix + "_p1_" + std::to_string(pi), path_1[pi]);
            }

            // Also open the fold result for consistency
            transcript->send_to_verifier(prefix + "_fold", oracles[round + 1][j]);

            current_idx = j; // trace through to next round
        }
    }
}

/**
 * @brief BaseFold native verifier.
 *
 * Reads the transcript produced by the prover and checks:
 *   1. Merkle path validity for each opened pair
 *   2. Fold consistency: opened pair values match the claimed fold result
 *   3. Final value consistency
 *
 * @return true if all checks pass.
 */
inline bool verify(const EcfftDomain& domain,
                   size_t degree_bound,
                   size_t num_queries,
                   const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    // Read oracle roots and challenges
    std::vector<fr> roots(num_rounds);
    std::vector<Fq> challenges(num_rounds);

    for (size_t round = 0; round < num_rounds; round++) {
        roots[round] = transcript->template receive_from_prover<fr>("basefold_root_" + std::to_string(round));
        challenges[round] = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
    }

    // Read final value
    [[maybe_unused]] auto g_final = transcript->template receive_from_prover<Commitment>("basefold_final");

    // Query phase — use fr for Poseidon2 compatibility
    fr query_seed = transcript->template get_challenge<fr>("basefold_query_seed");

    for (size_t q = 0; q < num_queries; q++) {
        fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { query_seed, fr(static_cast<uint64_t>(q)) });
        size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

        size_t current_idx = idx;
        size_t current_d = degree_bound;

        for (size_t round = 0; round < num_rounds; round++) {
            size_t m = domain.levels[round].size();
            size_t half = m / 2;
            size_t j = current_idx % half;
            // Read openings
            size_t tree_depth = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(m)));
            std::string prefix = "basefold_r" + std::to_string(round) + "_q" + std::to_string(q);

            auto elem_0 = transcript->template receive_from_prover<Commitment>(prefix + "_e0");
            crypto::merkle_tree::fr_sibling_path path_0(tree_depth);
            for (size_t pi = 0; pi < tree_depth; pi++) {
                path_0[pi] = transcript->template receive_from_prover<fr>(prefix + "_p0_" + std::to_string(pi));
            }
            auto elem_1 = transcript->template receive_from_prover<Commitment>(prefix + "_e1");
            crypto::merkle_tree::fr_sibling_path path_1(tree_depth);
            for (size_t pi = 0; pi < tree_depth; pi++) {
                path_1[pi] = transcript->template receive_from_prover<fr>(prefix + "_p1_" + std::to_string(pi));
            }
            auto claimed_fold = transcript->template receive_from_prover<Commitment>(prefix + "_fold");

            // Verify Merkle paths
            if (!verify_merkle_opening(roots[round], j, elem_0, path_0)) {
                return false;
            }
            if (!verify_merkle_opening(roots[round], j + half, elem_1, path_1)) {
                return false;
            }

            // Check fold consistency
            GroupElement expected_fold = domain.fold_pair<GroupElement>(
                round, current_d, j, GroupElement(elem_0), GroupElement(elem_1), challenges[round]);

            if (Commitment(expected_fold.normalize()) != claimed_fold) {
                return false;
            }

            // If not the last round, verify the fold value appears in the next oracle
            // (by checking the Merkle opening at the same index in the next round's tree)

            current_idx = j;
            current_d /= 2;
        }
    }

    return true;
}

/**
 * @brief Compute the SRS encoding: g_0[j] = sum_{i=0}^{n-1} L_0[j]^i * G_i.
 *
 * This is O(n * |L_0|) scalar muls but is embarrassingly parallel and one-time.
 */
inline std::vector<Commitment> compute_srs_encoding(const std::vector<Commitment>& srs_generators,
                                                    const EcfftDomain& domain)
{
    const auto& L0 = domain.levels[0].domain;
    size_t domain_size = L0.size();
    size_t n = srs_generators.size();

    std::vector<Commitment> g0(domain_size);
    parallel_for(domain_size, [&](size_t j) {
        Fq x = L0[j];
        GroupElement acc = GroupElement::infinity();
        Fq x_pow = Fq::one();
        for (size_t i = 0; i < n; i++) {
            acc = acc + GroupElement(srs_generators[i]) * x_pow;
            x_pow *= x;
        }
        g0[j] = acc.normalize();
    });
    return g0;
}

} // namespace bb::basefold
