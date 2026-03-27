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
 * group elements, reducing the verification cost.
 *
 * # Protocol overview
 *
 * The prover encodes the SRS generators onto an ECFFT domain L_0 of size |L_0| = n · ρ
 * (where ρ is the blowup factor, typically 8 = 2^3):
 *
 *     g_0[j]  =  sum_{i=0}^{n-1}  L_0[j]^i · G_i       for j = 0, ..., |L_0|-1
 *
 * This is a "group-valued Reed-Solomon codeword": each entry is a Grumpkin point that
 * is a polynomial (in the exponent) evaluated at a domain point.
 *
 * The protocol then runs FRI folding over these group elements:
 *
 *   1. For round r = 0, ..., k-1  (where k = log2(|L_0|)):
 *        a. Prover commits g_r via a Merkle tree (leaves = Poseidon2(point.x, point.y)),
 *           sends the root to the verifier.
 *        b. Verifier sends a random fold challenge z_r ∈ Fq.
 *        c. Prover folds: g_{r+1}[j] = fold(g_r[j], g_r[j + m/2], z_r, d_r)
 *           using the ECFFT Part II pointwise hash formula (see ecfft_domain.hpp).
 *           The degree bound d_r halves each round.
 *
 *   2. Prover sends g_final (a single Grumpkin point after all folds).
 *
 *   3. Verifier picks ~λ random query indices and checks fold consistency:
 *      for each query, for each round, opens the pair (g_r[j], g_r[j+m/2]) via
 *      Merkle paths and verifies that the fold formula reproduces g_{r+1}[j].
 *
 * # Cost summary (for 2^15 MSM, blowup 8, 43 queries)
 *
 *   - Fold rounds: 18  (from 2^18 down to 2^0)
 *   - Fold check per query per round: 4 Grumpkin scalar muls (when e > 0) ≈ 6,500 gates
 *   - Merkle check per query per round: 2 paths × ~74 gates/hash ≈ 1,400 gates (depth 18)
 *   - Total: ~6.2M gates  (vs ~12M for a raw batch_mul MSM)
 *   - Native proof size: ~605 KiB
 *
 * # Curve types
 *
 *   - Group elements: Grumpkin (cycle curve for BN254)
 *   - Domain field (Fq): BN254 base field = Grumpkin scalar field (bb::fq)
 *   - Merkle hashes: Poseidon2 over BN254 scalar field (bb::fr)
 *   - Grumpkin point coordinates: bb::fr (BN254 scalar field = Grumpkin base field)
 *
 * # Files in this module
 *
 *   - ecfft_domain.hpp/cpp: Domain structure, fold_pair<T> template, deserialization
 *   - ecfft_precompute.py: Python script to generate domain data from ECFFT parameters
 *   - ecfft_domain_data_2_8.hpp: Auto-generated hex data for log_n=8 test domain
 *   - basefold.hpp (this file): Native prover, verifier, Merkle helpers
 *   - basefold.test.cpp: Correctness tests (fold, Merkle, prover-verifier round trip)
 *   - basefold_circuit_cost.test.cpp: Gate count estimation for the recursive verifier
 *
 * ============================================================================
 * POTENTIAL OPTIMIZATION: batched scalar multiplication
 * ============================================================================
 *
 * The dominant cost is the fold consistency check: 4 Grumpkin scalar muls per
 * query per round.  With 43 queries × 18 rounds = 774 fold checks, that's
 * 3,096 scalar muls total.
 *
 * Currently measured as isolated muls (~6,500 gates each = ~6.2M total for fold).
 * The cycle_group::batch_mul Straus algorithm amortizes the 256 doublings (64 windows
 * × 4 doublings/window) across all muls in a batch.  Per-mul marginal cost is ~1,900
 * gates (ROM table build + lookups + additions), vs ~3,500 for an isolated mul.
 *
 * However, the fold formula has data dependencies that prevent a single giant batch:
 *
 *   a     = G_0 · s0^{-e}           ┐ independent, can batch across all queries
 *   b     = G_1 · s1^{-e}           ┘   → "Batch A": 2 × 43 = 86 muls
 *   slope = (b - a) · diff_inv      ← depends on a, b; can batch across queries
 *                                        → "Batch B": 43 muls
 *   result = a + slope · (z - s0)   ← depends on slope; can batch across queries
 *                                        → "Batch C": 43 muls
 *
 * So per round we'd have 3 sequential batch_muls of size 86, 43, 43 (= 172 muls/round).
 * Over 18 rounds: 18 × 3 = 54 batch_mul calls, each amortizing 256 doublings.
 *
 * Estimated savings from batching:
 *   - Isolated: 3,096 × 256 = 792,576 doubling gates
 *   - Batched:  54 × 256    =  13,824 doubling gates
 *   - Savings: ~780K gates (~12% of total fold cost)
 *
 * The per-mul marginal cost (~1,900 gates) stays the same, giving:
 *   - Batched fold: 13,824 + 3,096 × 1,900 ≈ 5.9M gates  (vs 6.2M isolated)
 *   - Full verifier: ~5.9M + 0.8M Merkle ≈ ~6.7M... wait, this doesn't save much.
 *
 * Actually, the isolated measurement already partially amortizes because cycle_group
 * delegates single muls to batch_mul internally.  The real savings would come from
 * reducing ROM table construction: in the isolated case, each mul builds its own 16-entry
 * ROM table (~370 gates).  In a batch, tables for the SAME base point could be reused
 * if a point appears in multiple muls — but our points are all distinct witnesses, so
 * there's no reuse opportunity.
 *
 * Bottom line: batching saves ~10-15% on the fold cost.  The real win would come from
 * reducing the number of scalar muls per fold check (e.g., algebraic reformulation)
 * or from a fundamentally different circuit-friendly fold formula.
 * ============================================================================
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

// Grumpkin types for the group-valued oracle.
// Commitment = affine point (for storage/Merkle), GroupElement = projective (for arithmetic).
using Commitment = grumpkin::g1::affine_element;
using GroupElement = grumpkin::g1::element;
using MerkleTree = crypto::merkle_tree::MemoryTree<crypto::merkle_tree::Poseidon2HashPolicy>;

// ---------------------------------------------------------------------------
// Merkle tree helpers
// ---------------------------------------------------------------------------

/**
 * @brief Hash a Grumpkin affine point to an fr element for use as a Merkle leaf.
 *
 * Uses Poseidon2 over BN254 scalar field: hash(point.x, point.y).
 * The coordinates (x, y) are in bb::fr (Grumpkin base field = BN254 scalar field),
 * which is the native field for Poseidon2Bn254ScalarFieldParams.
 */
inline fr hash_group_element(const Commitment& point)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ point.x, point.y });
}

/**
 * @brief Build a Poseidon2 Merkle tree over group elements.
 *
 * Each leaf is hash_group_element(elements[i]).  The tree depth is log2(n).
 * Returns both the tree (for path extraction) and the root hash.
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
 * @brief Verify a Merkle opening: check that `element` at `index` is consistent with `root`.
 *
 * Recomputes the root from the leaf hash and sibling path, then compares with the
 * expected root.  Each level hashes two siblings with Poseidon2.
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

// ---------------------------------------------------------------------------
// Prover-side fold
// ---------------------------------------------------------------------------

/**
 * @brief Fold an entire group-element oracle to half its size.
 *
 * For each pair index j in [0, m/2), computes:
 *     g_{r+1}[j] = fold_pair(g_r[j], g_r[j + m/2], z, d)
 *
 * using the ECFFT Part II pointwise hash (see ecfft_domain.hpp for the formula).
 *
 * Cost: 4 Grumpkin scalar multiplications per pair (when e > 0).
 * This is embarrassingly parallel over pairs.
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

// ---------------------------------------------------------------------------
// Native prover
// ---------------------------------------------------------------------------

/**
 * @brief BaseFold native prover.
 *
 * Runs the full FRI protocol over group elements:
 *   Phase 1 (commitment): for each round, Merkle-commit the current oracle, receive
 *     a fold challenge from the transcript, fold the oracle to half size.
 *   Phase 2 (query): for each random query index, open the pair at every round via
 *     Merkle paths and send the fold result for consistency checking.
 *
 * @param g0           The initial group-valued oracle on L_0.
 *                     g0[j] = sum_{i<n} L_0[j]^i · G_i  (the SRS encoding).
 *                     Size = |L_0| = n · blowup_factor.
 * @param domain       The ECFFT domain hierarchy (L_0, L_1, ..., L_k).
 * @param degree_bound Initial degree bound (= |L_0| for rate-1 encoding, or n for rate-ρ).
 * @param num_queries  Number of random queries (~43 for 128-bit security with blowup 8).
 * @param transcript   Fiat-Shamir transcript (Poseidon2-based).
 */
inline void prove(const std::vector<Commitment>& g0,
                  const EcfftDomain& domain,
                  size_t degree_bound,
                  size_t num_queries,
                  const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    // oracles[r] = the group-valued oracle at round r.  oracles[0] = g0.
    // trees[r] = Merkle tree over oracles[r].
    std::vector<std::vector<Commitment>> oracles;
    std::vector<MerkleTree> trees;
    std::vector<fr> roots;

    oracles.push_back(g0);

    size_t d = degree_bound;

    // === Phase 1: Commit & fold ===
    for (size_t round = 0; round < num_rounds; round++) {
        // Commit current oracle via Merkle tree
        auto [tree, root] = build_merkle_tree(oracles.back());
        transcript->send_to_verifier("basefold_root_" + std::to_string(round), root);
        trees.push_back(std::move(tree));
        roots.push_back(root);

        // Receive fold challenge
        Fq z = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));

        // Fold oracle: g_{r+1}[j] = fold(g_r[j], g_r[j+m/2], z, d)
        auto folded = fold_group_oracle(oracles.back(), domain, round, d, z);
        d /= 2;
        oracles.push_back(std::move(folded));
    }

    // After all rounds, the oracle has been reduced to a single group element.
    BB_ASSERT(oracles.back().size() == 1);
    transcript->send_to_verifier("basefold_final", oracles.back()[0]);

    // === Phase 2: Query openings ===
    // Derive query indices from a single seed (to avoid sending indices explicitly).
    fr query_seed = transcript->template get_challenge<fr>("basefold_query_seed");

    for (size_t q = 0; q < num_queries; q++) {
        // Deterministic query index: hash(seed, q) mod |L_0|
        fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { query_seed, fr(static_cast<uint64_t>(q)) });
        size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

        // Trace the query through all rounds, opening the pair at each level.
        size_t current_idx = idx;
        for (size_t round = 0; round < num_rounds; round++) {
            size_t m = domain.levels[round].size();
            size_t half = m / 2;
            size_t j = current_idx % half; // pair index within this round

            // Get Merkle paths for both elements of the pair
            auto path_0 = trees[round].get_sibling_path(j);
            auto path_1 = trees[round].get_sibling_path(j + half);

            // Send: two group elements, their Merkle paths, and the claimed fold result
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

            current_idx = j; // the fold output lands at index j in the next round
        }
    }
}

// ---------------------------------------------------------------------------
// Native verifier
// ---------------------------------------------------------------------------

/**
 * @brief BaseFold native verifier.
 *
 * Reads the prover's transcript and checks every query:
 *   1. Merkle paths: the opened pair values are consistent with the committed root.
 *   2. Fold consistency: applying fold_pair to the opened pair reproduces the claimed
 *      fold result.
 *
 * @param domain       The ECFFT domain (same as prover used).
 * @param degree_bound Initial degree bound.
 * @param num_queries  Number of queries (must match prover).
 * @param transcript   Transcript loaded with the prover's proof data.
 * @return true iff all checks pass.
 */
inline bool verify(const EcfftDomain& domain,
                   size_t degree_bound,
                   size_t num_queries,
                   const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    // === Read all roots and derive challenges (mirrors the prover's Phase 1) ===
    std::vector<fr> roots(num_rounds);
    std::vector<Fq> challenges(num_rounds);

    for (size_t round = 0; round < num_rounds; round++) {
        roots[round] = transcript->template receive_from_prover<fr>("basefold_root_" + std::to_string(round));
        challenges[round] = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
    }

    // The final group element (after all folds). Not checked here — will be compared
    // against the expected value derived from the IPA claim in the integration layer.
    [[maybe_unused]] auto g_final = transcript->template receive_from_prover<Commitment>("basefold_final");

    // === Check each query ===
    fr query_seed = transcript->template get_challenge<fr>("basefold_query_seed");

    for (size_t q = 0; q < num_queries; q++) {
        // Derive the same query index as the prover
        fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
            { query_seed, fr(static_cast<uint64_t>(q)) });
        size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

        size_t current_idx = idx;
        size_t current_d = degree_bound;

        for (size_t round = 0; round < num_rounds; round++) {
            size_t m = domain.levels[round].size();
            size_t half = m / 2;
            size_t j = current_idx % half;

            // Read the pair openings and Merkle paths from the transcript
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

            // Check 1: Merkle paths authenticate the opened values against the round's root
            if (!verify_merkle_opening(roots[round], j, elem_0, path_0)) {
                return false;
            }
            if (!verify_merkle_opening(roots[round], j + half, elem_1, path_1)) {
                return false;
            }

            // Check 2: Fold consistency — the fold formula applied to the opened pair
            // must reproduce the claimed fold result.
            GroupElement expected_fold = domain.fold_pair<GroupElement>(
                round, current_d, j, GroupElement(elem_0), GroupElement(elem_1), challenges[round]);

            if (Commitment(expected_fold.normalize()) != claimed_fold) {
                return false;
            }

            current_idx = j;
            current_d /= 2;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// SRS encoding (one-time precomputation)
// ---------------------------------------------------------------------------

/**
 * @brief Compute the initial group-valued oracle from SRS generators.
 *
 * For each domain point x = L_0[j], computes:
 *
 *     g_0[j]  =  sum_{i=0}^{n-1}  x^i · G_i
 *
 * This evaluates the "polynomial in the exponent" P(X) = sum_i X^i · G_i at each
 * domain point.  The result is a group-valued Reed-Solomon codeword over L_0.
 *
 * Complexity: O(n · |L_0|) scalar muls, embarrassingly parallel over j.
 * This is a one-time cost paid at setup (not part of the prover's per-proof work,
 * since the SRS encoding depends only on the SRS and the domain, not the witness).
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
