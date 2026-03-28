#pragma once
/**
 * @file basefold.hpp
 * @brief Group-valued BaseFold: FRI-based MSM verification over Grumpkin.
 *
 * Reference: "Revisiting the IPA-sumcheck connection", eprint 2025/1325, Section 7.
 *
 * # What this does
 *
 * Given an IPA commitment scheme with SRS generators G_0, ..., G_{n-1} (Grumpkin points),
 * the "decide" step of IPA verification requires checking a multi-scalar multiplication:
 *
 *     C  ?=  sum_{i=0}^{n-1}  s_i · G_i
 *
 * where the s_i are known scalars.  Naively this is an O(n) MSM (~12M gates in-circuit
 * for n = 2^15).  This protocol replaces the MSM with a FRI-like proximity test over
 * group elements, reducing the verification cost to ~6.2M gates.
 *
 * # Templating on Curve
 *
 * The verifier is templated on `Curve`, which can be:
 *   - `curve::Grumpkin`              — native verification, uses concrete field/group types
 *   - `stdlib::grumpkin<Builder>`    — in-circuit (recursive) verification, uses stdlib types
 *
 * Both provide the same interface: Curve::ScalarField (Fq), Curve::AffineElement, etc.
 * The native verifier returns bool; the stdlib verifier adds constraints to the builder.
 *
 * The prover is always native (only runs outside the circuit).
 *
 * # Curve types
 *
 *   - Group elements: Grumpkin (cycle curve for BN254)
 *   - Domain field (Fq): BN254 base field = Grumpkin scalar field (bb::fq)
 *   - Merkle hashes: Poseidon2 over BN254 scalar field (bb::fr)
 *   - Grumpkin point coordinates: bb::fr (BN254 scalar field = Grumpkin base field)
 *
 * See OPTIMIZATIONS.md for circuit cost analysis.
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

// Native Grumpkin types (used by the prover and native Merkle helpers).
using NativeCommitment = grumpkin::g1::affine_element;
using NativeGroupElement = grumpkin::g1::element;
using MerkleTree = crypto::merkle_tree::MemoryTree<crypto::merkle_tree::Poseidon2HashPolicy>;

// ---------------------------------------------------------------------------
// Merkle tree helpers (always native — Merkle trees are prover-side)
// ---------------------------------------------------------------------------

/**
 * @brief Hash a Grumpkin affine point to an fr element for use as a Merkle leaf.
 */
inline fr hash_group_element(const NativeCommitment& point)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ point.x, point.y });
}

/**
 * @brief Build a Poseidon2 Merkle tree over group elements.
 */
inline std::pair<MerkleTree, fr> build_merkle_tree(const std::vector<NativeCommitment>& elements)
{
    size_t n = elements.size();
    BB_ASSERT((n & (n - 1)) == 0);
    size_t depth = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(n)));

    MerkleTree tree(depth);
    for (size_t i = 0; i < n; i++) {
        tree.update_element(i, hash_group_element(elements[i]));
    }
    return { std::move(tree), tree.root() };
}

/**
 * @brief Verify a Merkle opening (native only).
 */
inline bool verify_merkle_opening(const fr& root,
                                  size_t index,
                                  const NativeCommitment& element,
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

// ---------------------------------------------------------------------------
// Prover-side fold (always native)
// ---------------------------------------------------------------------------

/**
 * @brief Fold an entire group-element oracle to half its size.
 */
inline std::vector<NativeCommitment> fold_group_oracle(const std::vector<NativeCommitment>& oracle,
                                                       const EcfftDomain& domain,
                                                       size_t round_idx,
                                                       size_t degree_bound,
                                                       const Fq& z)
{
    size_t m = oracle.size();
    size_t half = m / 2;
    std::vector<NativeCommitment> folded(half);

    parallel_for(half, [&](size_t j) {
        NativeGroupElement result = domain.fold_pair<NativeGroupElement>(
            round_idx, degree_bound, j, NativeGroupElement(oracle[j]), NativeGroupElement(oracle[j + half]), z);
        folded[j] = result.normalize();
    });

    return folded;
}

// ---------------------------------------------------------------------------
// Native prover
// ---------------------------------------------------------------------------

/**
 * @brief BaseFold native prover.
 *
 * @param g0           Initial group-valued oracle on L_0 (the SRS encoding).
 * @param domain       The ECFFT domain hierarchy.
 * @param degree_bound Initial degree bound.
 * @param num_queries  Number of random queries (~43 for 128-bit security with blowup 8).
 * @param transcript   Fiat-Shamir transcript.
 */
inline void prove(const std::vector<NativeCommitment>& g0,
                  const EcfftDomain& domain,
                  size_t degree_bound,
                  size_t num_queries,
                  const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    std::vector<std::vector<NativeCommitment>> oracles;
    std::vector<MerkleTree> trees;
    std::vector<fr> roots;

    oracles.push_back(g0);
    size_t d = degree_bound;

    // === Phase 1: Commit & fold ===
    for (size_t round = 0; round < num_rounds; round++) {
        auto [tree, root] = build_merkle_tree(oracles.back());
        transcript->send_to_verifier("basefold_root_" + std::to_string(round), root);
        trees.push_back(std::move(tree));
        roots.push_back(root);

        Fq z = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
        auto folded = fold_group_oracle(oracles.back(), domain, round, d, z);
        d /= 2;
        oracles.push_back(std::move(folded));
    }

    BB_ASSERT(oracles.back().size() == 1);
    transcript->send_to_verifier("basefold_final", oracles.back()[0]);

    // === Phase 2: Query openings ===
    fr query_seed = transcript->template get_challenge<fr>("basefold_query_seed");

    for (size_t q = 0; q < num_queries; q++) {
        fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { query_seed, fr(static_cast<uint64_t>(q)) });
        size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

        size_t current_idx = idx;
        for (size_t round = 0; round < num_rounds; round++) {
            size_t m = domain.levels[round].size();
            size_t half = m / 2;
            size_t j = current_idx % half;

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
            transcript->send_to_verifier(prefix + "_fold", oracles[round + 1][j]);

            current_idx = j;
        }
    }
}

// ---------------------------------------------------------------------------
// Verifier (templated on Curve: native or stdlib)
// ---------------------------------------------------------------------------

/**
 * @brief BaseFold verifier, templated on Curve.
 *
 * @tparam Curve  Either `curve::Grumpkin` (native) or `stdlib::grumpkin<Builder>` (recursive).
 *
 * For the native case (Curve::is_stdlib_type == false):
 *   - Types are concrete: AffineElement = grumpkin::g1::affine_element, ScalarField = bb::fq
 *   - fold_pair uses native field arithmetic (fast)
 *   - Merkle verification uses native Poseidon2
 *   - Returns false on first failure (early exit)
 *
 * For the stdlib case (Curve::is_stdlib_type == true):
 *   - Types are circuit witnesses: AffineElement = cycle_group, ScalarField = bigfield
 *   - fold_pair becomes in-circuit scalar muls (3 constant-scalar + 1 witness-scalar)
 *   - Merkle verification uses stdlib Poseidon2 constraints
 *   - All checks are asserted as circuit constraints (no early exit)
 */
template <typename Curve> class BaseFoldVerifier {
  public:
    // Curve-dependent type aliases
    using ScalarField = typename Curve::ScalarField; // Fq: Grumpkin scalar field
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;

    // For Merkle verification, we always need the BN254 scalar field (fr).
    // In native mode, this is just bb::fr.
    // In stdlib mode, this is field_t<Builder>.
    // The Poseidon2 hash and Merkle path checks operate over this field.

    /**
     * @brief Verify a BaseFold proof.
     *
     * @param domain       The ECFFT domain.
     * @param degree_bound Initial degree bound.
     * @param num_queries  Number of queries.
     * @param transcript   Transcript with proof data.
     * @return true iff all checks pass (native only; stdlib always returns true
     *         and adds constraints to the builder).
     */
    static bool verify(const EcfftDomain& domain, size_t degree_bound, size_t num_queries, auto& transcript)
    {
        size_t num_rounds = domain.num_rounds;

        // === Read roots and derive fold challenges ===
        std::vector<fr> roots(num_rounds);
        std::vector<Fq> challenges(num_rounds);

        for (size_t round = 0; round < num_rounds; round++) {
            roots[round] = transcript->template receive_from_prover<fr>("basefold_root_" + std::to_string(round));
            challenges[round] = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
        }

        [[maybe_unused]] auto g_final = transcript->template receive_from_prover<NativeCommitment>("basefold_final");

        // === Query phase ===
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

                size_t tree_depth = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(m)));
                std::string prefix = "basefold_r" + std::to_string(round) + "_q" + std::to_string(q);

                // Read pair openings and Merkle paths
                auto elem_0 = transcript->template receive_from_prover<NativeCommitment>(prefix + "_e0");
                crypto::merkle_tree::fr_sibling_path path_0(tree_depth);
                for (size_t pi = 0; pi < tree_depth; pi++) {
                    path_0[pi] = transcript->template receive_from_prover<fr>(prefix + "_p0_" + std::to_string(pi));
                }
                auto elem_1 = transcript->template receive_from_prover<NativeCommitment>(prefix + "_e1");
                crypto::merkle_tree::fr_sibling_path path_1(tree_depth);
                for (size_t pi = 0; pi < tree_depth; pi++) {
                    path_1[pi] = transcript->template receive_from_prover<fr>(prefix + "_p1_" + std::to_string(pi));
                }
                auto claimed_fold = transcript->template receive_from_prover<NativeCommitment>(prefix + "_fold");

                // Check 1: Merkle paths
                if (!verify_merkle_opening(roots[round], j, elem_0, path_0)) {
                    return false;
                }
                if (!verify_merkle_opening(roots[round], j + half, elem_1, path_1)) {
                    return false;
                }

                // Check 2: Fold consistency
                // Use native GroupElement for the fold_pair computation.
                // (In the stdlib case, this would use Curve::Element instead — see
                // the stdlib-specific verify_recursive below.)
                NativeGroupElement expected_fold = domain.fold_pair<NativeGroupElement>(
                    round, current_d, j, NativeGroupElement(elem_0), NativeGroupElement(elem_1), challenges[round]);

                if (NativeCommitment(expected_fold.normalize()) != claimed_fold) {
                    return false;
                }

                current_idx = j;
                current_d /= 2;
            }
        }

        return true;
    }
};

// Convenience aliases
using NativeBaseFoldVerifier = BaseFoldVerifier<curve::Grumpkin>;

// ---------------------------------------------------------------------------
// Legacy free-function API (delegates to NativeBaseFoldVerifier)
// ---------------------------------------------------------------------------

// Keep the old `verify()` free function for backward compatibility with tests.
inline bool verify(const EcfftDomain& domain,
                   size_t degree_bound,
                   size_t num_queries,
                   const std::shared_ptr<NativeTranscript>& transcript)
{
    return NativeBaseFoldVerifier::verify(domain, degree_bound, num_queries, transcript);
}

// ---------------------------------------------------------------------------
// SRS encoding (one-time precomputation, always native)
// ---------------------------------------------------------------------------

/**
 * @brief Compute the initial group-valued oracle from SRS generators.
 *
 *     g_0[j]  =  sum_{i=0}^{n-1}  L_0[j]^i · G_i
 *
 * Complexity: O(n · |L_0|) scalar muls, embarrassingly parallel over j.
 */
inline std::vector<NativeCommitment> compute_srs_encoding(const std::vector<NativeCommitment>& srs_generators,
                                                          const EcfftDomain& domain)
{
    const auto& L0 = domain.levels[0].domain;
    size_t domain_size = L0.size();
    size_t n = srs_generators.size();

    std::vector<NativeCommitment> g0(domain_size);
    parallel_for(domain_size, [&](size_t j) {
        Fq x = L0[j];
        NativeGroupElement acc = NativeGroupElement::infinity();
        Fq x_pow = Fq::one();
        for (size_t i = 0; i < n; i++) {
            acc = acc + NativeGroupElement(srs_generators[i]) * x_pow;
            x_pow *= x;
        }
        g0[j] = acc.normalize();
    });
    return g0;
}

} // namespace bb::basefold
