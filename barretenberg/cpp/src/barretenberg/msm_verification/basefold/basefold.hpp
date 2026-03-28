#pragma once
/**
 * @file basefold.hpp
 * @brief Group-valued BaseFold: FRI-based MSM verification over Grumpkin.
 *
 * Reference: "Revisiting the IPA-sumcheck connection", eprint 2025/1325, Section 7.
 *
 * # Templating on Curve
 *
 * The verifier is templated on `Curve`:
 *   - `curve::Grumpkin`              — native verification (bool return, early exit)
 *   - `stdlib::grumpkin<Builder>`    — in-circuit verification (constraints, no early exit)
 *
 * The prover is always native.
 *
 * See OPTIMIZATIONS.md for circuit cost analysis.
 */

#include "ecfft_domain.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
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

inline fr hash_group_element(const NativeCommitment& point)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ point.x, point.y });
}

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

    // Phase 1: Commit & fold
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

    // Phase 2: Query openings
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
// Native verifier
// ---------------------------------------------------------------------------

/**
 * @brief Native BaseFold verifier. Returns false on first failure.
 */
inline bool verify(const EcfftDomain& domain,
                   size_t degree_bound,
                   size_t num_queries,
                   const std::shared_ptr<NativeTranscript>& transcript)
{
    size_t num_rounds = domain.num_rounds;

    std::vector<fr> roots(num_rounds);
    std::vector<Fq> challenges(num_rounds);

    for (size_t round = 0; round < num_rounds; round++) {
        roots[round] = transcript->template receive_from_prover<fr>("basefold_root_" + std::to_string(round));
        challenges[round] = transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
    }

    // basefold_final is absorbed into Fiat-Shamir before the query seed is derived.
    // The verifier MUST check it matches the actual last-round fold result to prevent
    // the prover from manipulating query indices via a fake basefold_final.
    auto g_final = transcript->template receive_from_prover<NativeCommitment>("basefold_final");

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

            if (!verify_merkle_opening(roots[round], j, elem_0, path_0)) {
                return false;
            }
            if (!verify_merkle_opening(roots[round], j + half, elem_1, path_1)) {
                return false;
            }

            NativeGroupElement expected_fold = domain.fold_pair<NativeGroupElement>(
                round, current_d, j, NativeGroupElement(elem_0), NativeGroupElement(elem_1), challenges[round]);

            if (NativeCommitment(expected_fold.normalize()) != claimed_fold) {
                return false;
            }

            // At the last round, verify the fold result matches basefold_final.
            // This binds the committed final value to the actual fold computation,
            // preventing the prover from choosing a fake basefold_final to manipulate
            // the Fiat-Shamir-derived query indices.
            if (round == num_rounds - 1) {
                if (claimed_fold != g_final) {
                    return false;
                }
            }

            current_idx = j;
            current_d /= 2;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// Recursive (in-circuit) verifier
// ---------------------------------------------------------------------------

/**
 * @brief BaseFold recursive verifier — builds constraints in a UltraCircuitBuilder.
 *
 * Reads the proof from a stdlib transcript and adds constraints for:
 *   1. Merkle path verification via stdlib::poseidon2
 *   2. Fold consistency via cycle_group scalar multiplications
 *
 * The fold check per round uses 4 group operations (3 with constant scalars,
 * 1 with witness scalar), matching the native fold_pair formula.  No cross-query
 * batching is done — each query × round check is independent.
 *
 * @tparam Builder  The circuit builder type (e.g. UltraCircuitBuilder).
 */
template <typename Builder> class RecursiveBaseFoldVerifier {
  public:
    using Curve = bb::stdlib::grumpkin<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using witness_ct = bb::stdlib::witness_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using group_ct = bb::stdlib::cycle_group<Builder>;
    using bigfield_ct = typename Curve::ScalarField; // bigfield<Builder, Bn254FqParams>
    using Poseidon2 = bb::stdlib::poseidon2<Builder>;
    using StdlibTranscript = bb::StdlibTranscript<Builder>;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    /**
     * @brief Verify a BaseFold proof in-circuit.
     *
     * Uses a "native hint" approach: runs the native transcript to extract all
     * values and challenges, then brings them into the circuit as witnesses.
     * This avoids origin tag conflicts from the stdlib transcript codec while
     * producing an identical circuit.
     *
     * @param builder      The circuit builder.
     * @param domain       The ECFFT domain (native, known at compile/setup time).
     * @param degree_bound Initial degree bound.
     * @param num_queries  Number of queries.
     * @param native_proof The native proof data (vector of fr).
     */
    static void verify(Builder& builder,
                       const EcfftDomain& domain,
                       size_t degree_bound,
                       size_t num_queries,
                       const std::vector<fr>& native_proof)
    {
        size_t num_rounds = domain.num_rounds;

        // === Step 1: Run native transcript to extract all values and challenges ===
        auto native_transcript = std::make_shared<NativeTranscript>(native_proof);

        std::vector<fr> roots_native(num_rounds);
        std::vector<Fq> challenges_native(num_rounds);

        for (size_t round = 0; round < num_rounds; round++) {
            roots_native[round] =
                native_transcript->template receive_from_prover<fr>("basefold_root_" + std::to_string(round));
            challenges_native[round] =
                native_transcript->template get_challenge<Fq>("basefold_challenge_" + std::to_string(round));
        }

        auto g_final_native = native_transcript->template receive_from_prover<NativeCommitment>("basefold_final");

        fr query_seed_native = native_transcript->template get_challenge<fr>("basefold_query_seed");

        // === Step 2: Bring values into circuit as witnesses ===
        std::vector<field_ct> roots(num_rounds);
        std::vector<bigfield_ct> challenges_ct(num_rounds);

        for (size_t round = 0; round < num_rounds; round++) {
            roots[round] = witness_ct(&builder, roots_native[round]);
            challenges_ct[round] = bigfield_ct::from_witness(&builder, challenges_native[round]);
        }

        auto g_final = group_ct::from_witness(&builder, g_final_native);

        // === Step 3: Query phase ===
        for (size_t q = 0; q < num_queries; q++) {
            // Derive query index natively (deterministic)
            fr idx_field = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(
                { query_seed_native, fr(static_cast<uint64_t>(q)) });
            size_t idx = static_cast<size_t>(idx_field.reduce_once().data[0] % domain.levels[0].size());

            size_t current_idx = idx;
            size_t current_d = degree_bound;

            for (size_t round = 0; round < num_rounds; round++) {
                size_t m = domain.levels[round].size();
                size_t half = m / 2;
                size_t j = current_idx % half;

                size_t tree_depth = static_cast<size_t>(numeric::get_msb(static_cast<uint32_t>(m)));
                std::string prefix = "basefold_r" + std::to_string(round) + "_q" + std::to_string(q);

                // Read native values from transcript, bring into circuit as witnesses
                auto elem_0_native = native_transcript->template receive_from_prover<NativeCommitment>(prefix + "_e0");
                auto G0 = group_ct::from_witness(&builder, elem_0_native);

                std::vector<field_ct> path_0(tree_depth);
                for (size_t pi = 0; pi < tree_depth; pi++) {
                    auto p = native_transcript->template receive_from_prover<fr>(prefix + "_p0_" + std::to_string(pi));
                    path_0[pi] = witness_ct(&builder, p);
                }

                auto elem_1_native = native_transcript->template receive_from_prover<NativeCommitment>(prefix + "_e1");
                auto G1 = group_ct::from_witness(&builder, elem_1_native);

                std::vector<field_ct> path_1(tree_depth);
                for (size_t pi = 0; pi < tree_depth; pi++) {
                    auto p = native_transcript->template receive_from_prover<fr>(prefix + "_p1_" + std::to_string(pi));
                    path_1[pi] = witness_ct(&builder, p);
                }

                auto fold_native = native_transcript->template receive_from_prover<NativeCommitment>(prefix + "_fold");
                auto claimed_fold = group_ct::from_witness(&builder, fold_native);

                // Check 1: Merkle path verification (stdlib Poseidon2)
                verify_merkle_path_circuit(builder, roots[round], j, G0, path_0);
                verify_merkle_path_circuit(builder, roots[round], j + half, G1, path_1);

                // Check 2: Fold consistency (cycle_group scalar muls)
                auto expected_fold = fold_pair_circuit(domain, round, current_d, j, G0, G1, challenges_ct[round]);

                expected_fold.assert_equal(claimed_fold);

                // Check 3: At the last round, the fold result must match basefold_final
                if (round == num_rounds - 1) {
                    claimed_fold.assert_equal(g_final);
                }

                current_idx = j;
                current_d /= 2;
            }
        }
    }

  private:
    /**
     * @brief Verify a Merkle path in-circuit using stdlib Poseidon2.
     *
     * Hashes the leaf (group element coordinates), then walks up the path
     * hashing with siblings, and asserts the result equals the expected root.
     */
    static void verify_merkle_path_circuit(Builder& /*builder*/,
                                           const field_ct& root,
                                           size_t index,
                                           const group_ct& element,
                                           const std::vector<field_ct>& path)
    {
        // Leaf hash: Poseidon2(x, y) where x, y are the cycle_group coordinates
        field_ct current = Poseidon2::hash({ element.x(), element.y() });

        // Walk up the Merkle tree
        for (size_t i = 0; i < path.size(); i++) {
            if (index % 2 == 0) {
                current = Poseidon2::hash({ current, path[i] });
            } else {
                current = Poseidon2::hash({ path[i], current });
            }
            index >>= 1;
        }

        // Assert computed root matches expected root
        current.assert_equal(root);
    }

    /**
     * @brief Compute the fold formula in-circuit using cycle_group operations.
     *
     * Implements:
     *   a = G0 · s0^{-e}          (witness point × constant scalar)
     *   b = G1 · s1^{-e}          (witness point × constant scalar)
     *   slope = (b - a) · diff_inv (witness point × constant scalar)
     *   result = a + slope · (z - s0) (witness point × witness scalar)
     *
     * When e == 0:
     *   slope = (G1 - G0) · diff_inv  (witness point × constant scalar)
     *   result = G0 + slope · (z - s0) (witness point × witness scalar)
     *
     * The constant scalars are bigfield constants (no circuit cost).
     * The witness scalar (z - s0) involves one bigfield subtraction.
     */
    static group_ct fold_pair_circuit(const EcfftDomain& domain,
                                      size_t round_idx,
                                      size_t degree_bound,
                                      size_t j,
                                      const group_ct& G0,
                                      const group_ct& G1,
                                      const bigfield_ct& z_ct)
    {
        Builder* ctx = z_ct.get_context();
        const auto& level = domain.levels[round_idx];
        size_t half = level.size() / 2;
        size_t e = degree_bound / 2 - 1;

        Fq s0 = level.domain[j];
        Fq s1 = level.domain[j + half];
        Fq diff_inv = level.pair_diff_inv[j];

        // Constant bigfield values — constructed with builder context so their
        // internal field_t limbs have proper context (needed for origin tag checks).
        bigfield_ct diff_inv_ct(ctx, uint256_t(diff_inv));
        bigfield_ct s0_ct(ctx, uint256_t(s0));

        // (z - s0) is the only witness-dependent scalar
        bigfield_ct z_minus_s0 = z_ct - s0_ct;

        if (e == 0) {
            auto slope = (G1 - G0) * diff_inv_ct;
            return G0 + slope * z_minus_s0;
        }

        Fq s0_e_inv = s0.pow(e).invert();
        Fq s1_e_inv = s1.pow(e).invert();

        bigfield_ct s0_e_inv_ct(ctx, uint256_t(s0_e_inv));
        bigfield_ct s1_e_inv_ct(ctx, uint256_t(s1_e_inv));

        auto a = G0 * s0_e_inv_ct;
        auto b = G1 * s1_e_inv_ct;
        auto slope = (b - a) * diff_inv_ct;
        return a + slope * z_minus_s0;
    }
};

// ---------------------------------------------------------------------------
// SRS encoding (one-time precomputation, always native)
// ---------------------------------------------------------------------------

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
