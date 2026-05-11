#pragma once

/**
 * @file recursion_constraints_helper.hpp
 * @brief Helper functions and constants for recursion constraint validation in StaticAnalyzerAcir.
 *
 * Provides:
 *   - VK hash validation
 *   - Preamble num_public_inputs assertion check
 *   - Block size validation (delta_range constant, q_m gate count formula)
 *   - Selector hash validation for commitment deserialization blocks
 *   - Discovery/diagnostic printing
 */

#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"

namespace recursion_helpers {

// Per-commitment NNF selector hash: hash of NNF gate selectors anchored from
// the commitment's ACIR witnesses via decompose gate limb tracing.
// Each commitment's 4 fr witnesses produce 16 NNF range-constraint gates
// (4 frs × 2 limbs each × 2 NNF gates per limb from range_constrain_two_limbs).
// Discovered via OinkCommitmentHashDiscovery test.
static constexpr size_t COMMITMENT_NNF_SELECTOR_HASH = 0xc1a6844b2411792bULL;

// Expected number of NNF gates per commitment (found via decompose gate limb tracing).
static constexpr size_t EXPECTED_NNF_GATES_PER_COMMITMENT = 16;
static constexpr size_t COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES = 58;
static constexpr size_t COMPUTE_PADDING_INDICATOR_ARRAY_SELECTORS_HASH = 0xbfbd88904266e6d5;

// Compute selector hash over an arithmetic block range, skipping fix_witness gates for
// constants (those produce spurious entries that vary with witness layout).
template <typename CircuitBuilder>
size_t calculate_hash_arithmetic_block(CircuitBuilder& builder, size_t start, size_t finish)
{
    auto& arith = builder.blocks.arithmetic;
    size_t hash = 0;

    for (size_t index = start; index < finish; ++index) {
        bool is_fix_witness_pattern = (arith.q_arith()[index] == bb::fr::one()) &&
                                      (arith.q_1()[index] == bb::fr::one()) && arith.q_2()[index].is_zero() &&
                                      arith.q_4()[index].is_zero() && !arith.q_c()[index].is_zero();

        if (is_fix_witness_pattern) {
            uint32_t w_l_var = arith.w_l()[index];
            uint32_t real_w_l = builder.real_variable_index[w_l_var];

            bool is_constant = false;
            for (const auto& pair : builder.constant_variable_indices) {
                if (pair.second == real_w_l) {
                    is_constant = true;
                    break;
                }
            }
            if (is_constant) {
                continue;
            }
        }

        sha256_helpers::update_selector_hash(hash, arith, index);
    }

    return hash;
}

template <typename FF, typename CircuitBuilder>
uint32_t find_sqr_of(uint32_t w_real, CircuitBuilder& builder, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    auto& arith = builder.blocks.arithmetic;
    auto gates = analyzer.get_variable_gates(w_real);
    for (auto [blk_idx, g] : gates) {
        if (&builder.blocks.get()[blk_idx] != &arith) {
            continue;
        }
        bool correct_selectors =
            !arith.q_m()[g].is_zero() && arith.q_arith()[g] == FF::one() && arith.q_3()[g] == FF::neg_one();
        bool correct_wires = builder.real_variable_index[arith.w_l()[g]] == w_real &&
                             builder.real_variable_index[arith.w_r()[g]] == w_real;
        if (correct_wires && correct_selectors) {
            return analyzer.to_real(arith.w_o()[g]);
        }
    }
    return UINT32_MAX;
};

/**
 * @brief Find cube of a witness given its square: mul gate {w_l, w_r} = {w, w_sqr}, output w_o = w³.
 */
template <typename FF, typename CircuitBuilder>
uint32_t find_cube_of(uint32_t w_real,
                      uint32_t w_real_sqr,
                      CircuitBuilder& builder,
                      cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    auto& arith = builder.blocks.arithmetic;
    for (auto [blk, g] : analyzer.get_variable_gates(w_real_sqr)) {
        if (&builder.blocks.get()[blk] != &arith) {
            continue;
        }
        bool correct_selectors =
            !arith.q_m()[g].is_zero() && arith.q_arith()[g] == FF::one() && arith.q_3()[g] == FF::neg_one();
        uint32_t wl = builder.real_variable_index[arith.w_l()[g]];
        uint32_t wr = builder.real_variable_index[arith.w_r()[g]];
        bool correct_wires = (wl == w_real_sqr && wr == w_real) || (wl == w_real && wr == w_real_sqr);
        if (correct_wires && correct_selectors) {
            return analyzer.to_real(arith.w_o()[g]);
        }
    }
    return UINT32_MAX;
}

/**
 * @brief Find cube of a witness: locates square first, then cube.
 * @return real_idx of w³, or UINT32_MAX on failure.
 */
template <typename FF, typename CircuitBuilder>
uint32_t find_cube_of(uint32_t w_real, CircuitBuilder& builder, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    uint32_t w_sqr = find_sqr_of<FF>(w_real, builder, analyzer);
    if (w_sqr == UINT32_MAX) {
        return UINT32_MAX;
    }
    return find_cube_of<FF>(w_real, w_sqr, builder, analyzer);
}

/**
 * @brief Validate square + cube computation gates for a witness.
 *
 * Structural checks beyond "gate exists":
 *   - sqr gate: exactly ONE mul gate with w_l == w_r == base_real, selectors q_m=1, q_arith=1, q_3=-1,
 *     all other selectors zero.
 *   - cube gate: exactly ONE mul gate with {w_l, w_r} = {base, sqr}, selectors identical to sqr.
 *   - Value check: variable(w²) == variable(w)² and variable(w³) == variable(w²) * variable(w).
 *
 * @return true if both gates are uniquely identifiable and values consistent.
 */
template <typename FF, typename CircuitBuilder>
bool validate_square_and_cube(uint32_t base_real,
                              uint32_t sqr_real,
                              uint32_t cube_real,
                              CircuitBuilder& builder,
                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    if (base_real == UINT32_MAX || sqr_real == UINT32_MAX || cube_real == UINT32_MAX) {
        return false;
    }
    auto& arith = builder.blocks.arithmetic;

    auto is_pure_mul = [&](size_t g) {
        return arith.q_m()[g] == FF::one() && arith.q_arith()[g] == FF::one() && arith.q_3()[g] == FF::neg_one() &&
               arith.q_1()[g].is_zero() && arith.q_2()[g].is_zero() && arith.q_4()[g].is_zero() &&
               arith.q_c()[g].is_zero();
    };

    // Find unique sqr gate: w_l == w_r == base, w_o == sqr
    size_t sqr_gate_count = 0;
    for (auto [blk, g] : analyzer.get_variable_gates(base_real)) {
        if (&builder.blocks.get()[blk] != &arith) {
            continue;
        }
        uint32_t wl = builder.real_variable_index[arith.w_l()[g]];
        uint32_t wr = builder.real_variable_index[arith.w_r()[g]];
        uint32_t wo = builder.real_variable_index[arith.w_o()[g]];
        if (wl == base_real && wr == base_real && wo == sqr_real && is_pure_mul(g)) {
            sqr_gate_count++;
        }
    }
    if (sqr_gate_count != 1) {
        return false;
    }

    // Find unique cube gate: {w_l, w_r} = {base, sqr}, w_o == cube
    size_t cube_gate_count = 0;
    for (auto [blk, g] : analyzer.get_variable_gates(sqr_real)) {
        if (&builder.blocks.get()[blk] != &arith) {
            continue;
        }
        uint32_t wl = builder.real_variable_index[arith.w_l()[g]];
        uint32_t wr = builder.real_variable_index[arith.w_r()[g]];
        uint32_t wo = builder.real_variable_index[arith.w_o()[g]];
        bool wires_ok = ((wl == sqr_real && wr == base_real) || (wl == base_real && wr == sqr_real)) && wo == cube_real;
        if (wires_ok && is_pure_mul(g)) {
            cube_gate_count++;
        }
    }
    if (cube_gate_count != 1) {
        return false;
    }

    // Value consistency: variable(w²) == variable(w)² and variable(w³) == variable(w²)·variable(w)
    FF base_val = builder.get_variable(base_real);
    FF sqr_val = builder.get_variable(sqr_real);
    FF cube_val = builder.get_variable(cube_real);
    if (sqr_val != base_val * base_val) {
        return false;
    }
    if (cube_val != sqr_val * base_val) {
        return false;
    }
    return true;
}

/**
 * @brief Validate VK hash computation and copy constraint.
 *
 * Checks:
 *   1. Value: native Poseidon2 hash of key[] values matches key_hash witness value.
 *   2. Copy constraint: key_hash_real appears on a poseidon2_external gate.
 *      assert_equal merges real_variable_index so that key_hash_real inherits
 *      the Poseidon2 output's gate participation — proving the copy constraint
 *      links key_hash to the actual in-circuit Poseidon2 output.
 */
template <typename FF, typename CircuitBuilder>
bool validate_vk_hash(CircuitBuilder& builder,
                      cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                      const acir_format::RecursionConstraint* constraint)
{
    using Poseidon2Hash = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

    std::vector<FF> vk_field_values;
    vk_field_values.reserve(constraint->key.size());
    for (uint32_t idx : constraint->key) {
        vk_field_values.push_back(builder.get_variable(idx));
    }

    FF expected_vk_hash = Poseidon2Hash::hash(vk_field_values);
    if (expected_vk_hash != builder.get_variable(constraint->key_hash)) {
        return false;
    }

    uint32_t key_hash_real = builder.real_variable_index[constraint->key_hash];
    auto& pos2_ext = builder.blocks.poseidon2_external;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(key_hash_real)) {
        if (&builder.blocks.get()[blk] == &pos2_ext) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// Preamble validation
// ============================================================================

/**
 * @brief Validate num_public_inputs assertion from OinkVerifier preamble.
 *
 * OinkVerifier calls:
 *   vk->num_public_inputs.assert_equal(FF(num_public_inputs), ...)
 *
 * Checks:
 *   1. Value: key[1] witness value matches the expected num_public_inputs.
 *   2. Copy constraint: key[1]_real appears on at least one arithmetic gate.
 *      assert_equal merges equivalence classes so key[1]_real inherits gate
 *      participation from the expected constant — a variable with no gate
 *      participation would be unconstrained.
 */
template <typename FF, typename CircuitBuilder>
bool validate_num_pub_assertion(CircuitBuilder& builder,
                                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                const acir_format::RecursionConstraint* constraint)
{
    if (constraint->key.size() < 2) {
        return false;
    }
    uint32_t num_pub_idx = constraint->key[1];
    FF vk_num_pub = builder.get_variable(num_pub_idx);
    size_t total_pub_inputs = constraint->public_inputs.size() + acir_format::HIDING_KERNEL_PUBLIC_INPUTS_SIZE;
    if (vk_num_pub != FF(total_pub_inputs)) {
        return false;
    }

    uint32_t num_pub_real = builder.real_variable_index[num_pub_idx];
    auto& arith = builder.blocks.arithmetic;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(num_pub_real)) {
        if (&builder.blocks.get()[blk] == &arith) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// Commitment deserialization validation (nnf block)
// ============================================================================

/**
 * @brief Check if an arithmetic gate matches the decompose (evaluate_linear_identity) selector signature.
 *
 * The decompose gate encodes: input = limb_lo + 2^68 * limb_hi
 * with selectors: q_arith=1, q_1=1, q_2=-1, q_3=-(2^68), q_4=1
 */
template <typename FF, typename Block> bool is_decompose_gate(Block& arith, size_t gi)
{
    static const FF neg_one = -FF(1);
    static const FF neg_shift_68 = -FF(2).pow(68);
    return arith.q_arith()[gi] == FF(1) && arith.q_1()[gi] == FF(1) && arith.q_2()[gi] == neg_one &&
           arith.q_3()[gi] == neg_shift_68 && arith.q_4()[gi] == FF(1);
}

/**
 * @brief Check if an arithmetic gate matches the combine (bigfield limb pairing) selector signature.
 *
 * The combine gate encodes: output = lo + 2^136 * hi
 * with selectors: q_arith=1, q_1=1, q_2=2^136, q_3=-1
 */
template <typename FF, typename Block> bool is_combine_gate(Block& arith, size_t gi)
{
    static const FF shift_136 = FF(2).pow(136);
    static const FF neg_one = -FF(1);
    return arith.q_arith()[gi] == FF(1) && arith.q_1()[gi] == FF(1) && arith.q_2()[gi] == shift_136 &&
           arith.q_3()[gi] == neg_one;
}

/**
 * @brief Check if an arithmetic gate matches the accumulation (is_point_at_infinity) selector signature.
 *
 * The accumulation gate encodes: w_4 = w_l + w_r + w_o
 * with selectors: q_arith=2, q_1=1, q_2=1, q_3=1, q_4=-1, q_m=0
 */
template <typename FF, typename Block> bool is_accumulate_gate(Block& arith, size_t gi)
{
    static const FF neg_one = -FF(1);
    return arith.q_arith()[gi] == FF(2) && arith.q_1()[gi] == FF(1) && arith.q_2()[gi] == FF(1) &&
           arith.q_3()[gi] == FF(1) && arith.q_4()[gi] == neg_one && arith.q_m()[gi].is_zero();
}

/**
 * @brief Check if an arithmetic gate matches the transcript absorption selector signature.
 *
 * The transcript absorption gate encodes: w_o = w_l + w_r
 * (adds a commitment fr value to the running Poseidon2 sponge state)
 * with selectors: q_arith=1, q_1=1, q_2=1, q_3=-1, q_m=0
 * The fr witness appears on w_r.
 */
template <typename FF, typename Block> bool is_transcript_add_gate(Block& arith, size_t gi)
{
    static const FF neg_one = -FF(1);
    return arith.q_arith()[gi] == FF(1) && arith.q_1()[gi] == FF(1) && arith.q_2()[gi] == FF(1) &&
           arith.q_3()[gi] == neg_one && arith.q_m()[gi].is_zero();
}

/**
 * @brief Validate that each fr witness of a commitment is absorbed into the transcript.
 *
 * Each commitment fr value is added to the Poseidon2 sponge state through a transcript
 * absorption gate (q_arith=1, q_1=1, q_2=1, q_3=-1) where the fr appears on w_r.
 * This proves the commitment value enters the Fiat-Shamir transcript.
 */
template <typename FF, typename CircuitBuilder>
bool validate_commitment_transcript_absorption(CircuitBuilder& builder,
                                               cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                               uint32_t fr0_idx,
                                               uint32_t fr1_idx,
                                               uint32_t fr2_idx,
                                               uint32_t fr3_idx)
{
    auto& arith = builder.blocks.arithmetic;

    for (uint32_t fr_idx : { fr0_idx, fr1_idx, fr2_idx, fr3_idx }) {
        uint32_t fr_real = builder.real_variable_index[fr_idx];
        bool found = false;
        for (const auto& [blk, gi] : analyzer.get_variable_gates(fr_real)) {
            if (&builder.blocks.get()[blk] != &arith) {
                continue;
            }
            if (builder.real_variable_index[arith.w_r()[gi]] != fr_real) {
                continue;
            }
            if (!is_transcript_add_gate<FF>(arith, gi)) {
                continue;
            }
            found = true;
            break;
        }
        if (!found) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Return the w_o real_idx of the transcript absorption gate for a given fr witness.
 *
 * The absorption gate has pattern q_arith=1, q_1=1, q_2=1, q_3=-1 with the fr on w_r.
 * Its w_o = current_sponge_component + fr — i.e., the updated sponge state element after
 * absorbing this fr. Useful as an anchor for locating the next Poseidon2 permutation.
 *
 * @return real_idx of w_o, or UINT32_MAX if no matching gate found.
 */
template <typename FF, typename CircuitBuilder>
uint32_t find_absorption_gate_output(CircuitBuilder& builder,
                                     cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                     uint32_t fr_idx)
{
    auto& arith = builder.blocks.arithmetic;
    uint32_t fr_real = builder.real_variable_index[fr_idx];
    for (const auto& [blk, gi] : analyzer.get_variable_gates(fr_real)) {
        if (&builder.blocks.get()[blk] != &arith) {
            continue;
        }
        if (builder.real_variable_index[arith.w_r()[gi]] != fr_real) {
            continue;
        }
        if (!is_transcript_add_gate<FF>(arith, gi)) {
            continue;
        }
        return builder.real_variable_index[arith.w_o()[gi]];
    }
    return UINT32_MAX;
}

/**
 * @brief Find NNF gates belonging to a specific commitment by tracing from ACIR witnesses
 * through the decompose (evaluate_linear_identity) gate.
 *
 * For each fr witness in the commitment:
 *   1. Find the decompose gate: arithmetic gate with fr[k] on w_l and full
 *      selector signature (q_arith=1, q_1=1, q_2=-1, q_3=-(2^68), q_4=1).
 *   2. Extract limb variables from w_r (limb_0) and w_o (limb_1).
 *   3. For each limb, find NNF gates it participates in (range_constrain_two_limbs
 *      places limb variables at w_4 of NNF gates).
 *
 * @return Sorted set of NNF gate indices belonging to this commitment.
 */
template <typename FF, typename CircuitBuilder>
std::set<size_t> find_commitment_nnf_gates(CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                           uint32_t fr0_idx,
                                           uint32_t fr1_idx,
                                           uint32_t fr2_idx,
                                           uint32_t fr3_idx)
{
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    std::set<size_t> nnf_gates;

    for (uint32_t fr_idx : { fr0_idx, fr1_idx, fr2_idx, fr3_idx }) {
        uint32_t fr_real = builder.real_variable_index[fr_idx];

        for (const auto& [blk, gi] : analyzer.get_variable_gates(fr_real)) {
            if (&builder.blocks.get()[blk] != &arith) {
                continue;
            }
            if (builder.real_variable_index[arith.w_l()[gi]] != fr_real) {
                continue;
            }
            if (!is_decompose_gate<FF>(arith, gi)) {
                continue;
            }

            uint32_t limb_lo = builder.real_variable_index[arith.w_r()[gi]];
            uint32_t limb_hi = builder.real_variable_index[arith.w_o()[gi]];

            for (uint32_t lv : { limb_lo, limb_hi }) {
                for (const auto& [b, g] : analyzer.get_variable_gates(lv)) {
                    if (&builder.blocks.get()[b] == &nnf) {
                        nnf_gates.insert(g);
                    }
                }
            }
        }
    }
    return nnf_gates;
}

/**
 * @brief Compute selector hash over a set of non-contiguous gate indices in a block.
 */
template <typename Block>
size_t compute_gates_selector_hash(size_t initial_hash, Block& block, const std::set<size_t>& gate_indices)
{
    auto selectors = block.get_selectors();
    size_t h = initial_hash;
    for (size_t gate : gate_indices) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            auto reduced = selectors[s][gate].reduce_once();
            h = sha256_helpers::hash_combine(h, reduced.data[0]);
        }
    }
    return h;
}

// ============================================================================
// Discovery / diagnostics
// ============================================================================

/**
 * @brief Print block size diagnostics for constant discovery.
 */
template <typename FF, typename CircuitBuilder>
void print_block_diagnostics(CircuitBuilder& builder, size_t num_public_inputs)
{
    info("=== Block diagnostics for num_public_inputs = ", num_public_inputs, " ===");
    auto blocks = builder.blocks.get();
    for (size_t i = 0; i < blocks.size(); i++) {
        if (blocks[i].size() != 0) {
            info("  block[", i, "] size = ", blocks[i].size());
        }
    }
    info("  poseidon2_external: ", builder.blocks.poseidon2_external.size());
    info("  poseidon2_internal: ", builder.blocks.poseidon2_internal.size());
    info("  arithmetic: ", builder.blocks.arithmetic.size());
    info("");
}

// ============================================================================
// Per-block gate snapshot — captures sizes of all blocks at a point in time
// ============================================================================

struct BlockSnapshot {
    std::vector<size_t> sizes;

    template <typename CircuitBuilder> static BlockSnapshot capture(CircuitBuilder& builder)
    {
        BlockSnapshot snap;
        auto blocks = builder.blocks.get();
        snap.sizes.reserve(blocks.size());
        for (const auto& block : blocks) {
            snap.sizes.push_back(block.size());
        }
        return snap;
    }
};

/**
 * @brief Compute selector hash over all gates added AFTER a snapshot, across all blocks.
 * @details For each block, hashes selectors in the range [snapshot_size, current_size).
 * Gates added before the snapshot are excluded.
 */
template <typename CircuitBuilder>
size_t compute_post_snapshot_selector_hash(CircuitBuilder& builder, const BlockSnapshot& snapshot)
{
    auto blocks = builder.blocks.get();
    size_t combined_hash = 0;
    for (size_t b = 0; b < blocks.size(); b++) {
        size_t start = (b < snapshot.sizes.size()) ? snapshot.sizes[b] : 0;
        size_t end = blocks[b].size();
        if (end > start) {
            combined_hash = sha256_helpers::compute_selector_hash(combined_hash, blocks[b], start, end - 1);
        }
    }
    return combined_hash;
}

/**
 * @brief Compute selector hash over gates added BETWEEN two snapshots, across all blocks.
 * @details For each block, hashes selectors in the range [start_snapshot_size, end_snapshot_size).
 */
template <typename CircuitBuilder>
size_t compute_range_selector_hash(CircuitBuilder& builder,
                                   const BlockSnapshot& start_snap,
                                   const BlockSnapshot& end_snap)
{
    auto blocks = builder.blocks.get();
    size_t combined_hash = 0;
    for (size_t b = 0; b < blocks.size(); b++) {
        size_t start = (b < start_snap.sizes.size()) ? start_snap.sizes[b] : 0;
        size_t end = (b < end_snap.sizes.size()) ? end_snap.sizes[b] : blocks[b].size();
        if (end > start) {
            combined_hash = sha256_helpers::compute_selector_hash(combined_hash, blocks[b], start, end - 1);
        }
    }
    return combined_hash;
}

/**
 * Step 2 (padding indicator array + dyadic gate challenges) — locating builder variables.
 *
 * New UltraCircuitBuilder variables are allocated contiguously right after OinkVerifier:
 *   - step2_var_begin = builder.get_num_variables() immediately after step 1 (Oink only)
 *   - step2_var_end   = builder.get_num_variables() after step 2 (Oink + padding/challenges)
 *   - step2_var_end - step2_var_begin == MEGAZK_STEP2_NEW_BUILDER_VARIABLES (constant for MegaZK)
 *
 * The absolute indices shift with num_public_inputs (Oink grows); only the *count* is fixed.
 * To trace gates with StaticAnalyzer: for each idx in [step2_var_begin, step2_var_end),
 * call get_variable_gates(builder.real_variable_index[idx]).
 *
 * Gate ranges for step 2 use BlockSnapshot: hash gates in (post_oink_snapshot, post_step2_snapshot).
 * Discovered via MegaZkStep2BuilderVariableRange test.
 */
static constexpr size_t MEGAZK_STEP2_NEW_BUILDER_VARIABLES = 392;

// ============================================================================
// Per-step gate count helpers
// ============================================================================

/**
 * @brief Compute per-block gate deltas between two snapshots.
 * @return Vector of (block_index, block_name, delta) tuples for non-zero deltas.
 */
struct BlockDelta {
    size_t block_index;
    const char* block_name;
    size_t delta;
};

inline std::vector<BlockDelta> compute_block_deltas(const BlockSnapshot& before, const BlockSnapshot& after)
{
    static const std::array<const char*, 9> names = { "pub_inputs",  "lookup",        "arithmetic",
                                                      "delta_range", "elliptic",      "memory",
                                                      "nnf",         "poseidon2_ext", "poseidon2_int" };
    std::vector<BlockDelta> result;
    size_t max_blocks = std::max(before.sizes.size(), after.sizes.size());
    for (size_t b = 0; b < max_blocks; b++) {
        size_t s_before = (b < before.sizes.size()) ? before.sizes[b] : 0;
        size_t s_after = (b < after.sizes.size()) ? after.sizes[b] : 0;
        if (s_after > s_before) {
            const char* name = (b < names.size()) ? names[b] : "unknown";
            result.push_back({ b, name, s_after - s_before });
        }
    }
    return result;
}

/**
 * @brief Print formatted block deltas.
 */
inline void print_block_deltas(const std::string& label, const BlockSnapshot& before, const BlockSnapshot& after)
{
    auto deltas = compute_block_deltas(before, after);
    info("  ", label, ":");
    for (const auto& d : deltas) {
        info("    block[", d.block_index, "] (", d.block_name, "): +", d.delta);
    }
}

// ============================================================================
// Witness group classification
// ============================================================================

/**
 * @brief Classify MegaZK ACIR witnesses into semantic groups.
 */
enum class WitnessGroup : uint8_t {
    KEY_HASH,
    VK_FIELDS,
    MEGA_PUBLIC_INPUTS,
    MEGA_PROOF_BODY,
    GOBLIN_PROOF,
    ACIR_PUBLIC_INPUTS,
};

inline const char* witness_group_name(WitnessGroup g)
{
    switch (g) {
    case WitnessGroup::KEY_HASH:
        return "key_hash";
    case WitnessGroup::VK_FIELDS:
        return "vk_fields";
    case WitnessGroup::MEGA_PUBLIC_INPUTS:
        return "mega_pub_inputs";
    case WitnessGroup::MEGA_PROOF_BODY:
        return "mega_proof_body";
    case WitnessGroup::GOBLIN_PROOF:
        return "goblin_proof";
    case WitnessGroup::ACIR_PUBLIC_INPUTS:
        return "acir_pub_inputs";
    }
    return "unknown";
}

// ============================================================================
// OinkVerifier hybrid validation: selector hashing + wire tracing
// ============================================================================

static constexpr size_t FRS_PER_COMMITMENT = 4;

// Proof body commitment group layout for MegaZK (HasZK=true).
// Each commitment = 4 fr witnesses. Group index × FRS_PER_COMMITMENT = first fr offset in proof body.
// The proof body follows WitnessEntities column order, NOT transcript round order.
//
// Group  | Fr indices | Entity              | OinkVerifier Round
// -------|-----------|---------------------|-------------------
//  0     | 0-3       | w_l                 | wire (core)
//  1     | 4-7       | w_r                 | wire (core)
//  2     | 8-11      | w_o                 | wire (core)
//  3     | 12-15     | w_4                 | sorted_list
//  4     | 16-19     | z_perm              | grand_product
//  5     | 20-23     | lookup_inverses     | log_derivative (core)
//  6     | 24-27     | lookup_read_counts  | sorted_list
//  7     | 28-31     | lookup_read_tags    | sorted_list
//  8     | 32-35     | w_4_shift           | (shifted entity)
//  9-12  | 36-51     | ecc_op_wire_1..4    | wire (Goblin)
// 13     | 52-55     | calldata            | wire (Goblin)
// 14     | 56-59     | cd_read_counts      | wire (Goblin)
// 15     | 60-63     | cd_inverses         | log_derivative (Goblin)
// 16     | 64-67     | sec_calldata        | wire (Goblin)
// 17     | 68-71     | sec_cd_read_counts  | wire (Goblin)
// 18     | 72-75     | sec_cd_inverses     | log_derivative (Goblin)
// 19     | 76-79     | return_data         | wire (Goblin)
// 20     | 80-83     | ret_read_counts     | wire (Goblin)
// 21     | 84-87     | ret_inverses        | log_derivative (Goblin)
// 22     | 88-91     | databus_id          | (extra)
// 23     | 92-95     | ordered_range       | (extra)
// 24     | 96-99     | gemini_masking      | gemini masking (HasZK)

// Per-round group indices (non-contiguous in proof body due to column ordering).
static constexpr size_t WIRE_CORE_GROUPS[] = { 0, 1, 2 };   // w_l, w_r, w_o
static constexpr size_t SORTED_LIST_GROUPS[] = { 3, 6, 7 }; // w_4, lookup_counts, lookup_tags
static constexpr size_t LOG_DERIV_CORE_GROUPS[] = { 5 };    // lookup_inverses
static constexpr size_t GRAND_PRODUCT_GROUPS[] = { 4 };     // z_perm
static constexpr size_t GEMINI_MASKING_GROUP = 24;

static constexpr size_t OINK_PROOF_COMMITMENT_GROUPS = 25;
static constexpr size_t OINK_PROOF_COMMITMENT_WITNESSES = OINK_PROOF_COMMITMENT_GROUPS * FRS_PER_COMMITMENT;

/**
 * @brief Validate a single commitment deserialization via wire tracing.
 *
 * Each commitment = 4 fr witnesses (x_lo, x_hi, y_lo, y_hi).
 * Validates structural wire connections with full selector signatures:
 *   1. x-coordinate pairing: fr[0] and fr[1] share a combine gate
 *      (q_arith=1, q_1=1, q_2=2^136, q_3=-1)
 *   2. y-coordinate pairing: fr[2] and fr[3] share a combine gate
 *   3. Accumulation: fr[0], fr[1], fr[2] share an accumulate gate
 *      (q_arith=2, q_1=1, q_2=1, q_3=1, q_4=-1)
 *   4. NNF anchoring: decompose gates (q_arith=1, q_1=1, q_2=-1, q_3=-(2^68), q_4=1)
 *      connect limb variables to NNF range-constraint gates
 */
template <typename FF, typename CircuitBuilder>
bool validate_oink_commitment(CircuitBuilder& builder,
                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                              uint32_t fr0_idx,
                              uint32_t fr1_idx,
                              uint32_t fr2_idx,
                              uint32_t fr3_idx)
{
    auto& arith = builder.blocks.arithmetic;

    uint32_t real[4] = { builder.real_variable_index[fr0_idx],
                         builder.real_variable_index[fr1_idx],
                         builder.real_variable_index[fr2_idx],
                         builder.real_variable_index[fr3_idx] };

    // Helper: check if two witnesses share an arithmetic gate matching the
    // combine selector signature, with one on w_l and the other on w_r.
    auto find_combine_gate_fn = [&](uint32_t ra, uint32_t rb) -> bool {
        std::unordered_set<size_t> rb_gates;
        for (const auto& [blk, gi] : analyzer.get_variable_gates(rb)) {
            if (&builder.blocks.get()[blk] == &arith) {
                rb_gates.insert(gi);
            }
        }
        for (const auto& [blk, gi] : analyzer.get_variable_gates(ra)) {
            if (&builder.blocks.get()[blk] != &arith || rb_gates.count(gi) == 0) {
                continue;
            }
            if (!is_combine_gate<FF>(arith, gi)) {
                continue;
            }
            uint32_t wl = builder.real_variable_index[arith.w_l()[gi]];
            uint32_t wr = builder.real_variable_index[arith.w_r()[gi]];
            if ((wl == ra && wr == rb) || (wl == rb && wr == ra)) {
                return true;
            }
        }
        return false;
    };

    // Check 1: x-coordinate pairing
    if (!find_combine_gate_fn(real[0], real[1])) {
        return false;
    }

    // Check 2: y-coordinate pairing
    if (!find_combine_gate_fn(real[2], real[3])) {
        return false;
    }

    // Check 3: accumulation gate with full selector signature
    bool found_accum = false;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(real[0])) {
        if (&builder.blocks.get()[blk] != &arith || !is_accumulate_gate<FF>(arith, gi)) {
            continue;
        }
        uint32_t wl = builder.real_variable_index[arith.w_l()[gi]];
        uint32_t wr = builder.real_variable_index[arith.w_r()[gi]];
        uint32_t wo = builder.real_variable_index[arith.w_o()[gi]];
        if (wl == real[0] && wr == real[1] && wo == real[2]) {
            found_accum = true;
            break;
        }
    }
    if (!found_accum) {
        return false;
    }

    // Check 4: NNF anchoring — trace from ACIR witnesses through decompose gate
    // limb variables to NNF block, proving range constraints are applied.
    auto nnf_gates = find_commitment_nnf_gates<FF>(builder, analyzer, fr0_idx, fr1_idx, fr2_idx, fr3_idx);
    if (nnf_gates.empty()) {
        return false;
    }

    // Verify NNF gate count matches expected (if pinned)
    if (EXPECTED_NNF_GATES_PER_COMMITMENT != 0 && nnf_gates.size() != EXPECTED_NNF_GATES_PER_COMMITMENT) {
        return false;
    }

    // Verify NNF selector hash (if pinned)
    if (COMMITMENT_NNF_SELECTOR_HASH != 0) {
        size_t hash = compute_gates_selector_hash(0, builder.blocks.nnf, nnf_gates);
        if (hash != COMMITMENT_NNF_SELECTOR_HASH) {
            return false;
        }
    }

    return true;
}

/**
 * @brief Validate OinkVerifier preamble.
 *
 * Checks:
 *   1. VK hash: value + copy constraint + Poseidon2 gate connection.
 *   2. num_public_inputs: value + copy constraint (assert_equal).
 */
template <typename FF, typename CircuitBuilder>
bool validate_oink_preamble(CircuitBuilder& builder,
                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                            const acir_format::RecursionConstraint& constraint)
{
    if (!validate_vk_hash<FF>(builder, analyzer, &constraint)) {
        return false;
    }

    if (!validate_num_pub_assertion<FF>(builder, analyzer, &constraint)) {
        return false;
    }

    return true;
}

/**
 * @brief Validate a set of commitment groups: deserialization + transcript absorption.
 *
 * For each group index in the array, validates:
 *   1. Commitment deserialization (decompose + combine + accumulate + NNF range constraints)
 *   2. Transcript absorption (each fr witness is added to the Poseidon2 sponge state)
 */
template <typename FF, typename CircuitBuilder>
bool validate_commitment_groups(CircuitBuilder& builder,
                                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                const std::vector<uint32_t>& proof_body_witnesses,
                                const size_t* groups,
                                size_t group_count)
{
    for (size_t i = 0; i < group_count; i++) {
        size_t base = groups[i] * FRS_PER_COMMITMENT;
        if (base + 3 >= proof_body_witnesses.size()) {
            return false;
        }
        uint32_t fr0 = proof_body_witnesses[base];
        uint32_t fr1 = proof_body_witnesses[base + 1];
        uint32_t fr2 = proof_body_witnesses[base + 2];
        uint32_t fr3 = proof_body_witnesses[base + 3];

        if (!validate_oink_commitment<FF>(builder, analyzer, fr0, fr1, fr2, fr3)) {
            return false;
        }

        if (!validate_commitment_transcript_absorption<FF>(builder, analyzer, fr0, fr1, fr2, fr3)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Scan arithmetic block for the unique transcript squeeze decomposition pattern and
 *        extract all challenge witness indices in chronological order.
 *
 * Each transcript squeeze (`get_challenge` / `get_challenges`) creates a bigfield-limb combine
 * gate with selectors: q_arith=1, q_1=1, q_2=2^127, q_3=-1, q_4=1, q_m=0.
 * The low limb (w_l) is the first challenge; for pair-challenges, w_r is the second.
 *
 * For MegaZK oink+step2 (HasZK=true, USE_PADDING=true), exactly 4 such gates exist:
 *   [0] sorted_list_accumulator_round → eta (w_l); w_r discarded
 *   [1] log_derivative_inverse_round → beta (w_l), gamma (w_r)  [pair-challenge]
 *   [2] alpha_round → alpha (w_l); w_r discarded
 *   [3] step2 dyadic gate_challenge → gate_challenge[0] (w_l); w_r discarded
 */

/**
 * @brief Result of sorted_list_accumulator_round validation.
 */
struct SortedListAccumulatorResult {
    bool valid = false;
    uint32_t eta = UINT32_MAX;       // real_idx of eta challenge
    uint32_t eta_two = UINT32_MAX;   // real_idx of eta²
    uint32_t eta_three = UINT32_MAX; // real_idx of eta³
};

struct OinkTranscriptSqueezeChallenges {
    bool valid = false;
    uint32_t eta = UINT32_MAX; // real_idx
    uint32_t beta = UINT32_MAX;
    uint32_t gamma = UINT32_MAX;
    uint32_t alpha = UINT32_MAX;
    std::set<size_t> squeeze_gate_indices;
};

/**
 * @brief Return gate indices of ALL transcript squeeze decomposition gates in the arithmetic block.
 *
 * Pattern (q_arith=1, q_1=1, q_2=2^127, q_3=-1, q_4=1, q_m=0) is emitted once per `get_challenge`
 * squeeze, regardless of origin (oink / step2 / sumcheck / shplemini). Callers partition the result
 * by chronological index.
 *
 * MegaZK full recursive verification (steps 0..4) expected counts:
 *   - 3 oink (eta, beta/gamma pair, alpha)
 *   - 1 step2 gate_challenge[0]
 *   - 17 sumcheck (u_0..u_15 + 1 ZK correction)
 *   - 4 shplemini (rho, Gemini:r, Shplonk:nu, Shplonk:z)
 *   Total: 25
 */
template <typename CircuitBuilder> std::vector<size_t> find_all_transcript_squeeze_gates(CircuitBuilder& builder)
{
    using NativeFF = bb::fr;
    auto& arith = builder.blocks.arithmetic;
    const NativeFF two_127 = NativeFF(2).pow(127);
    std::vector<size_t> gates;
    for (size_t g = 0; g < arith.size(); g++) {
        if (arith.q_arith()[g] == NativeFF::one() && arith.q_1()[g] == NativeFF::one() && arith.q_2()[g] == two_127 &&
            arith.q_3()[g] == -NativeFF::one() && arith.q_4()[g] == NativeFF::one() && arith.q_m()[g].is_zero()) {
            gates.push_back(g);
        }
    }
    return gates;
}

// Expected squeeze-gate counts per phase in MegaZK full recursive verification (steps 0..4).
static constexpr size_t NUM_OINK_SQUEEZES = 3;      // eta, beta/gamma pair, alpha
static constexpr size_t NUM_STEP2_SQUEEZES = 1;     // gate_challenge[0]
static constexpr size_t NUM_SUMCHECK_SQUEEZES = 17; // u_0..u_15 + ZK correction
static constexpr size_t NUM_SHPLEMINI_SQUEEZES = 4; // rho, Gemini:r, Shplonk:nu, Shplonk:z
static constexpr size_t NUM_KZG_SQUEEZES = 1;       // KZG:masking_challenge
static constexpr size_t NUM_TOTAL_SQUEEZES =
    NUM_OINK_SQUEEZES + NUM_STEP2_SQUEEZES + NUM_SUMCHECK_SQUEEZES + NUM_SHPLEMINI_SQUEEZES;
static constexpr size_t NUM_TOTAL_WITH_KZG_SQUEEZES = NUM_TOTAL_SQUEEZES + NUM_KZG_SQUEEZES;

struct Step2Challenge {
    bool valid = false;
    uint32_t gate_challenge_0 = UINT32_MAX;
    size_t squeeze_gate = 0;
    std::set<size_t> squeeze_gate_indices;
};

struct SumcheckChallenges {
    bool valid = false;
    std::array<uint32_t, 16> u{}; // u_0..u_15
    uint32_t zk_correction = UINT32_MAX;
    std::set<size_t> squeeze_gate_indices;
};

struct ShpleminiChallenges {
    bool valid = false;
    uint32_t rho = UINT32_MAX;
    uint32_t gemini_r = UINT32_MAX;
    uint32_t shplonk_nu = UINT32_MAX;
    uint32_t shplonk_z = UINT32_MAX;
    std::set<size_t> squeeze_gate_indices;
};

struct KZGMaskingChallenge {
    bool valid = false;
    uint32_t masking_challenge = UINT32_MAX;
    size_t squeeze_gate = 0;
    std::set<size_t> squeeze_gate_indices;
};

/**
 * @brief Take the first N squeeze gates from `all_squeezes` not in `consumed`.
 * @return vector of size N, or empty vector if fewer than N remain.
 */
inline std::vector<size_t> take_unclaimed_squeezes(const std::vector<size_t>& all_squeezes,
                                                   const std::set<size_t>& consumed,
                                                   size_t n)
{
    std::vector<size_t> out;
    out.reserve(n);
    for (size_t g : all_squeezes) {
        if (consumed.contains(g)) {
            continue;
        }
        out.push_back(g);
        if (out.size() == n) {
            return out;
        }
    }
    return {};
}

/**
 * @brief Extract oink challenges (eta, beta/gamma pair, alpha) from the first 3 unclaimed squeeze gates.
 */
template <typename CircuitBuilder>
OinkTranscriptSqueezeChallenges oink_challenges(CircuitBuilder& builder,
                                                const std::vector<size_t>& all_squeezes,
                                                const std::set<size_t>& consumed = {})
{
    OinkTranscriptSqueezeChallenges out;
    auto gates = take_unclaimed_squeezes(all_squeezes, consumed, NUM_OINK_SQUEEZES);
    if (gates.empty()) {
        return out;
    }
    auto& arith = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };
    out.eta = to_real(arith.w_l()[gates[0]]);
    out.beta = to_real(arith.w_l()[gates[1]]);
    out.gamma = to_real(arith.w_r()[gates[1]]);
    out.alpha = to_real(arith.w_l()[gates[2]]);
    out.squeeze_gate_indices = std::set(gates.begin(), gates.end());
    out.valid = true;
    return out;
}

/**
 * @brief Extract step2 gate_challenge[0] from the next unclaimed squeeze gate.
 */
template <typename CircuitBuilder>
Step2Challenge step2_challenge(CircuitBuilder& builder,
                               const std::vector<size_t>& all_squeezes,
                               const std::set<size_t>& consumed)
{
    Step2Challenge out;
    auto gates = take_unclaimed_squeezes(all_squeezes, consumed, NUM_STEP2_SQUEEZES);
    if (gates.empty()) {
        return out;
    }
    auto& arith = builder.blocks.arithmetic;
    out.squeeze_gate = gates[0];
    out.gate_challenge_0 = builder.real_variable_index[arith.w_l()[out.squeeze_gate]];
    out.squeeze_gate_indices = { out.squeeze_gate };
    out.valid = true;
    return out;
}

/**
 * @brief Extract 17 sumcheck challenges (u_0..u_15 + ZK correction) from the next unclaimed squeeze gates.
 */
template <typename CircuitBuilder>
SumcheckChallenges sumcheck_challenges(CircuitBuilder& builder,
                                       const std::vector<size_t>& all_squeezes,
                                       const std::set<size_t>& consumed)
{
    SumcheckChallenges out;
    auto gates = take_unclaimed_squeezes(all_squeezes, consumed, NUM_SUMCHECK_SQUEEZES);
    if (gates.empty()) {
        return out;
    }
    auto& arith = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };
    for (size_t i = 0; i < 16; i++) {
        out.u[i] = to_real(arith.w_l()[gates[i]]);
    }
    out.zk_correction = to_real(arith.w_l()[gates[16]]);
    out.squeeze_gate_indices = std::set(gates.begin(), gates.end());
    out.valid = true;
    return out;
}

/**
 * @brief Extract 4 shplemini challenges (rho, Gemini:r, Shplonk:nu, Shplonk:z) from the next unclaimed squeeze gates.
 */
template <typename CircuitBuilder>
ShpleminiChallenges shplemini_challenges(CircuitBuilder& builder,
                                         const std::vector<size_t>& all_squeezes,
                                         const std::set<size_t>& consumed)
{
    ShpleminiChallenges out;
    auto gates = take_unclaimed_squeezes(all_squeezes, consumed, NUM_SHPLEMINI_SQUEEZES);
    if (gates.empty()) {
        return out;
    }
    auto& arith = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };
    out.rho = to_real(arith.w_l()[gates[0]]);
    out.gemini_r = to_real(arith.w_l()[gates[1]]);
    out.shplonk_nu = to_real(arith.w_l()[gates[2]]);
    out.shplonk_z = to_real(arith.w_l()[gates[3]]);
    out.squeeze_gate_indices = std::set(gates.begin(), gates.end());
    out.valid = true;
    return out;
}

/**
 * @brief Extract KZG masking challenge from the next unclaimed squeeze gate.
 */
template <typename CircuitBuilder>
KZGMaskingChallenge kzg_masking_challenge(CircuitBuilder& builder,
                                          const std::vector<size_t>& all_squeezes,
                                          const std::set<size_t>& consumed)
{
    KZGMaskingChallenge out;
    auto gates = take_unclaimed_squeezes(all_squeezes, consumed, NUM_KZG_SQUEEZES);
    if (gates.empty()) {
        return out;
    }
    auto& arith = builder.blocks.arithmetic;
    out.squeeze_gate = gates[0];
    out.masking_challenge = builder.real_variable_index[arith.w_l()[out.squeeze_gate]];
    out.squeeze_gate_indices = { out.squeeze_gate };
    out.valid = true;
    return out;
}

/**
 * @brief Back-compat: extract oink challenges using the original signature.
 */
template <typename FF, typename CircuitBuilder>
OinkTranscriptSqueezeChallenges find_transcript_squeeze_challenges(
    CircuitBuilder& builder, [[maybe_unused]] cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    auto all_squeezes = find_all_transcript_squeeze_gates(builder);
    return oink_challenges(builder, all_squeezes);
}

/**
 * @brief Validate wire_commitments_round of OinkVerifier.
 *
 * This round receives w_l, w_r, w_o commitments (3 core commitments, groups 0-2).
 * ECC op wires and DataBus entities are Goblin-related and validated separately.
 */
template <typename FF, typename CircuitBuilder>
bool validate_wire_commitments_round(CircuitBuilder& builder,
                                     cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                     const std::vector<uint32_t>& proof_body_witnesses)
{
    return validate_commitment_groups<FF>(
        builder, analyzer, proof_body_witnesses, WIRE_CORE_GROUPS, std::size(WIRE_CORE_GROUPS));
}

/**
 * @brief Validate sorted_list_accumulator_round of OinkVerifier.
 *
 * This round:
 *   1. Squeezes eta challenge from transcript (Poseidon2 gates)
 *   2. Computes eta powers (eta, eta², eta³)
 *   3. Receives w_4, lookup_read_counts, lookup_read_tags (groups 3, 6, 7)
 *
 * On success, returns the eta / eta² / eta³ challenge witness real indices extracted
 * via the unique transcript squeeze decompose-gate pattern.
 */
template <typename FF, typename CircuitBuilder>
SortedListAccumulatorResult validate_sorted_list_accumulator_round(CircuitBuilder& builder,
                                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                   const std::vector<uint32_t>& proof_body_witnesses,
                                                                   const uint32_t& eta)
{
    SortedListAccumulatorResult out;
    if (!validate_commitment_groups<FF>(
            builder, analyzer, proof_body_witnesses, SORTED_LIST_GROUPS, std::size(SORTED_LIST_GROUPS))) {
        return out;
    }
    out.eta = eta;
    uint32_t eta_sqr = find_sqr_of<FF>(eta, builder, analyzer);
    if (eta_sqr == UINT32_MAX) {
        return out;
    }
    uint32_t eta_cube = find_cube_of<FF>(eta, eta_sqr, builder, analyzer);
    if (eta_cube == UINT32_MAX) {
        return out;
    }
    if (!validate_square_and_cube<FF>(eta, eta_sqr, eta_cube, builder, analyzer)) {
        return out;
    }
    out.eta_two = eta_sqr;
    out.eta_three = eta_cube;
    out.valid = true;
    return out;
}

/**
 * @brief Result of log_derivative_inverse_round validation.
 */
struct LogDerivativeInverseResult {
    bool valid = false;
    uint32_t beta = UINT32_MAX;     // real_idx
    uint32_t beta_sqr = UINT32_MAX; // real_idx
    uint32_t beta_cube = UINT32_MAX;
};

/**
 * @brief Validate log_derivative_inverse_round of OinkVerifier.
 *
 * This round:
 *   1. Squeezes beta and gamma challenges from transcript (Poseidon2 gates)
 *   2. Computes beta powers
 *   3. Receives lookup_inverses commitment (group 5, core)
 *
 * On success, returns beta and gamma challenge real indices (extracted via the unique
 * pair-challenge decompose gate — wl=beta, wr=gamma).
 */
template <typename FF, typename CircuitBuilder>
LogDerivativeInverseResult validate_log_derivative_inverse_round(CircuitBuilder& builder,
                                                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                 const std::vector<uint32_t>& proof_body_witnesses,
                                                                 const uint32_t& beta)
{
    LogDerivativeInverseResult out;
    if (!validate_commitment_groups<FF>(
            builder, analyzer, proof_body_witnesses, LOG_DERIV_CORE_GROUPS, std::size(LOG_DERIV_CORE_GROUPS))) {
        return out;
    }
    out.beta = beta;
    uint32_t beta_sqr = find_sqr_of<FF>(beta, builder, analyzer);
    if (beta_sqr == UINT32_MAX) {
        return out;
    }
    uint32_t beta_cube = find_cube_of<FF>(beta, beta_sqr, builder, analyzer);
    if (beta_cube == UINT32_MAX) {
        return out;
    }
    // Structurally validate sqr + cube gates (uniqueness, strict selectors, value consistency)
    if (!validate_square_and_cube<FF>(beta, beta_sqr, beta_cube, builder, analyzer)) {
        return out;
    }
    out.beta_sqr = beta_sqr;
    out.beta_cube = beta_cube;
    out.valid = true;
    return out;
}

/**
 * @brief Find and validate the public_input_delta witness produced by compute_public_input_delta.
 *
 * Algorithm:
 *   1. Read raw values of beta, gamma, pub_inputs_offset, and all public_input witnesses.
 *   2. Natively replay compute_public_input_delta to obtain the expected delta value.
 *   3. Scan arithmetic block for the UNIQUE gate matching the division pattern:
 *      q_m=1, q_arith=1, q_3=-1, q_1=q_2=q_4=q_c=0, with variable(w_l) == expected_delta.
 *      The gate encodes: delta * denom = numerator, so delta is on w_l.
 *
 * @return real_idx of public_input_delta witness, or UINT32_MAX if not found / ambiguous.
 */
template <typename FF, typename CircuitBuilder>
uint32_t find_and_validate_public_input_delta(CircuitBuilder& builder,
                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                              uint32_t beta_real,
                                              uint32_t gamma_real,
                                              uint32_t pub_inputs_offset_real,
                                              const std::vector<uint32_t>& public_input_reals)
{
    (void)analyzer; // not needed — we scan the arithmetic block directly

    if (beta_real == UINT32_MAX || gamma_real == UINT32_MAX || pub_inputs_offset_real == UINT32_MAX) {
        return UINT32_MAX;
    }

    // Replay native computation using raw witness values
    FF beta_val = builder.get_variable(beta_real);
    FF gamma_val = builder.get_variable(gamma_real);
    FF offset_val = builder.get_variable(pub_inputs_offset_real);

    std::vector<FF> pub_input_values;
    pub_input_values.reserve(public_input_reals.size());
    for (uint32_t r : public_input_reals) {
        pub_input_values.push_back(builder.get_variable(r));
    }

    // Native compute_public_input_delta using the MegaZK flavor path.
    // The flavor parameter is only used for the FF type, so any MegaFlavor-compatible type works.
    FF expected_delta =
        bb::compute_public_input_delta<bb::MegaFlavor>(pub_input_values, beta_val, gamma_val, offset_val);

    // Search arithmetic block for the unique division gate:
    //   q_m=1, q_arith=1, q_3=-1, q_1=q_2=q_4=q_c=0, variable(w_l) == expected_delta
    auto& arith = builder.blocks.arithmetic;
    uint32_t found = UINT32_MAX;
    size_t match_count = 0;
    for (size_t g = 0; g < arith.size(); g++) {
        if (arith.q_m()[g] != FF::one() || arith.q_arith()[g] != FF::one() || arith.q_3()[g] != FF::neg_one()) {
            continue;
        }
        if (!arith.q_1()[g].is_zero() || !arith.q_2()[g].is_zero() || !arith.q_4()[g].is_zero() ||
            !arith.q_c()[g].is_zero()) {
            continue;
        }
        uint32_t wl_real = builder.real_variable_index[arith.w_l()[g]];
        if (builder.get_variable(wl_real) == expected_delta) {
            found = wl_real;
            match_count++;
            if (match_count > 1) {
                // Ambiguous — more than one pure-mul gate matches the expected value
                return UINT32_MAX;
            }
        }
    }
    return found;
}

/**
 * @brief Result of grand_product_computation_round validation.
 */
struct GrandProductComputationResult {
    bool valid = false;
    uint32_t public_input_delta = UINT32_MAX;
};

/**
 * @brief Validate grand_product_computation_round of OinkVerifier.
 *
 * This round:
 *   1. Computes public_input_delta from beta, gamma, pub_inputs_offset, and public inputs
 *   2. Receives z_perm commitment (group 4, core)
 *
 * @param beta_real real_idx of beta (from prior log_derivative_round validation)
 * @param gamma_real real_idx of gamma
 * @param pub_inputs_offset_real real_idx of pub_inputs_offset (= constraint.key[2])
 * @param public_input_reals vector of real_idx values for all mega public inputs
 */
template <typename FF, typename CircuitBuilder>
GrandProductComputationResult validate_grand_product_computation_round(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const std::vector<uint32_t>& proof_body_witnesses,
    uint32_t beta_real,
    uint32_t gamma_real,
    uint32_t pub_inputs_offset_real,
    const std::vector<uint32_t>& public_input_reals)
{
    GrandProductComputationResult out;
    if (!validate_commitment_groups<FF>(
            builder, analyzer, proof_body_witnesses, GRAND_PRODUCT_GROUPS, std::size(GRAND_PRODUCT_GROUPS))) {
        return out;
    }
    uint32_t delta = find_and_validate_public_input_delta<FF>(
        builder, analyzer, beta_real, gamma_real, pub_inputs_offset_real, public_input_reals);
    if (delta == UINT32_MAX) {
        return out;
    }
    out.public_input_delta = delta;
    out.valid = true;
    return out;
}

/**
 * @brief Compatibility overload: validate grand_product round without delta finding.
 *        Used when caller doesn't yet provide beta/gamma/offset/pub_inputs.
 */
template <typename FF, typename CircuitBuilder>
bool validate_grand_product_computation_round(CircuitBuilder& builder,
                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                              const std::vector<uint32_t>& proof_body_witnesses)
{
    return validate_commitment_groups<FF>(
        builder, analyzer, proof_body_witnesses, GRAND_PRODUCT_GROUPS, std::size(GRAND_PRODUCT_GROUPS));
}

/**
 * @brief Validate that all Oink commitment NNF gates are consistent.
 *
 * Collects NNF gates for all commitments (anchored from ACIR witnesses),
 * verifies that each commitment has the same NNF gate count, and that
 * all per-commitment NNF hashes are identical.
 *
 * This replaces the old approach of blindly hashing a fixed NNF block range,
 * which is incorrect when other constraints also contribute NNF gates.
 */
template <typename FF, typename CircuitBuilder>
bool validate_oink_nnf_consistency(CircuitBuilder& builder,
                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                   const std::vector<uint32_t>& proof_body_witnesses)
{
    if (proof_body_witnesses.size() < OINK_PROOF_COMMITMENT_WITNESSES) {
        return false;
    }

    auto& nnf = builder.blocks.nnf;

    size_t first_count = 0;
    size_t first_hash = 0;

    for (size_t c = 0; c < OINK_PROOF_COMMITMENT_GROUPS; c++) {
        size_t base = c * FRS_PER_COMMITMENT;
        auto nnf_gates = find_commitment_nnf_gates<FF>(builder,
                                                       analyzer,
                                                       proof_body_witnesses[base],
                                                       proof_body_witnesses[base + 1],
                                                       proof_body_witnesses[base + 2],
                                                       proof_body_witnesses[base + 3]);
        if (nnf_gates.empty()) {
            return false;
        }

        size_t hash = compute_gates_selector_hash(0, nnf, nnf_gates);

        if (c == 0) {
            first_count = nnf_gates.size();
            first_hash = hash;
        } else {
            if (nnf_gates.size() != first_count || hash != first_hash) {
                return false;
            }
        }
    }

    return true;
}

/**
 * @brief Validate the entire OinkVerifier subcircuit.
 *
 * Validates each round of the OinkVerifier:
 *   1. Preamble: VK hash + num_public_inputs assertion
 *   2. Wire commitments: w_l, w_r, w_o deserialization + transcript absorption
 *   3. Sorted list accumulator: w_4, lookup_counts, lookup_tags + transcript absorption
 *   4. All commitment groups: deserialization (decompose + combine + accumulate + NNF)
 *
 * @param proof_body_witnesses Witness indices for the MegaZK proof body
 *        (starting from proof element 0, i.e., after hidden kernel public inputs).
 *        The first OINK_PROOF_COMMITMENT_WITNESSES elements are commitment frs.
 */
/**
 * @brief Validate OinkVerifier subcircuit.
 *
 * @return true if all 6 oink rounds validate successfully, false otherwise.
 */
template <typename FF, typename CircuitBuilder>
bool validate_oink_subcircuit(CircuitBuilder& builder,
                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                              const acir_format::RecursionConstraint& constraint,
                              const std::vector<uint32_t>& proof_body_witnesses)
{
    if (proof_body_witnesses.size() < OINK_PROOF_COMMITMENT_WITNESSES) {
        return false;
    }

    // Locate oink squeeze challenges (eta, beta, gamma, alpha) in one pass
    OinkTranscriptSqueezeChallenges challenges = find_transcript_squeeze_challenges<FF>(builder, analyzer);
    if (!challenges.valid) {
        return false;
    }

    // Round 1: Preamble
    if (!validate_oink_preamble<FF>(builder, analyzer, constraint)) {
        return false;
    }

    // Round 2: Wire commitments (core)
    if (!validate_wire_commitments_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return false;
    }

    // Round 3: Sorted list accumulator
    if (!validate_sorted_list_accumulator_round<FF>(builder, analyzer, proof_body_witnesses, challenges.eta).valid) {
        return false;
    }

    // Round 4: Log derivative inverse
    if (!validate_log_derivative_inverse_round<FF>(builder, analyzer, proof_body_witnesses, challenges.beta).valid) {
        return false;
    }

    // Round 5: Grand product computation
    if (!validate_grand_product_computation_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return false;
    }

    // All commitment groups: deserialization validation (decompose + combine + accumulate + NNF)
    for (size_t c = 0; c < OINK_PROOF_COMMITMENT_GROUPS; c++) {
        size_t base = c * FRS_PER_COMMITMENT;
        if (!validate_oink_commitment<FF>(builder,
                                          analyzer,
                                          proof_body_witnesses[base],
                                          proof_body_witnesses[base + 1],
                                          proof_body_witnesses[base + 2],
                                          proof_body_witnesses[base + 3])) {
            return false;
        }
    }

    return true;
}

/**
 * @brief Result of compute_padding_indicator_array validation.
 *
 * On success, padding_indicator_reals contains the 16 real variable indices of
 * the witnesses produced by compute_padding_indicator_array:
 *   - [0..14]: second-loop add outputs (result[idx-1] += result[idx])
 *              Ordered so index i maps to padding_indicator[i].
 *   - [15]:    first-loop output (result[15] = inv[15] * prefix[15] * suffix[16])
 *              Note: this witness is backed by a field_t with mul_c != 1.
 */
struct PaddingArrayValidationResult {
    bool valid = false;
    size_t start_gate = SIZE_MAX;
    std::array<uint32_t, 16> padding_indicator_reals{};
};

/**
 * @brief Locate and validate the compute_padding_indicator_array subcircuit starting from log_n.
 *
 * @param log_n_witness_idx ACIR witness index (or any witness index) for log_circuit_size.
 *                           Typically constraint.key[0].
 */
template <typename FF, typename CircuitBuilder>
PaddingArrayValidationResult validate_compute_padding_array_from_log_n(
    CircuitBuilder& builder, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer, uint32_t log_n_witness_idx)
{
    PaddingArrayValidationResult out;
    uint32_t log_circuit_size_idx = analyzer.to_real(log_n_witness_idx);
    auto& ab = builder.blocks.arithmetic;
    std::vector<std::pair<size_t, size_t>> log_gates = analyzer.get_variable_gates(log_circuit_size_idx);
    for (const auto& [block_idx, gate_idx] : log_gates) {
        if (&builder.blocks.get()[block_idx] != &ab) {
            continue;
        }
        bool correct_selectors = ab.q_arith()[gate_idx] == FF::one() && ab.q_m()[gate_idx] == FF::one() &&
                                 ab.q_c()[gate_idx] == FF(2) && ab.q_1()[gate_idx] == FF(-2) &&
                                 ab.q_2()[gate_idx] == FF::neg_one() && ab.q_3()[gate_idx] == FF::neg_one();
        bool correct_wires = poseidon2_helpers::all_equal(
            log_circuit_size_idx, analyzer.to_real(ab.w_l()[gate_idx]), analyzer.to_real(ab.w_r()[gate_idx]));
        if (!correct_wires || !correct_selectors) {
            continue;
        }
        // Boundary check: need 58 consecutive gates starting at gate_idx
        if (gate_idx + COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES > ab.size()) {
            return out;
        }
        // Hash selectors across the 58-gate window and compare against pinned value.
        std::size_t selectors_hash = sha256_helpers::compute_selector_hash(
            0, ab, gate_idx, gate_idx + COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES - 1);
        if (selectors_hash != COMPUTE_PADDING_INDICATOR_ARRAY_SELECTORS_HASH) {
            return out;
        }

        // Extract padding_indicator_array witnesses.
        // Second loop `result[idx-1] += result[idx]` produces 15 adds — the LAST 15 gates
        // in the 58-gate window. Most have pattern q_arith=1, q_1=1, q_2=1, q_3=-1, q_m=0.
        // The first of them bakes inv[15] into q_2 because result[15] has multiplicative_constant=inv[15]
        // (view on prefix[15] with scaling). The last may have a baked constant in q_1 from rescaling.
        // Order in ascending gate_idx: result[14], result[13], ..., result[0].
        constexpr size_t NUM_ADDS = 15;
        size_t window_end = gate_idx + COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES;
        size_t add_start = window_end - NUM_ADDS;
        for (size_t i = 0; i < NUM_ADDS; i++) {
            size_t g = add_start + i;
            // Sanity: each must be an arithmetic gate with q_arith=1, q_3=-1, q_m=0
            if (ab.q_arith()[g] != FF::one() || ab.q_3()[g] != FF::neg_one() || !ab.q_m()[g].is_zero()) {
                return out;
            }
            out.padding_indicator_reals[14 - i] = analyzer.to_real(ab.w_o()[g]);
        }

        // padding_indicator[15]: input of first add (add_start) whose coefficient is NOT 1.
        // result[15] is a field_t view on prefix[15] with multiplicative_constant = inv[15],
        // so its scalar coefficient (q_1 for wl or q_2 for wr) at the first add gate equals inv[15].
        // The other input (result[14]_old) has mul_const=1 and coefficient = 1.
        size_t first_add = add_start;
        if (ab.q_1()[first_add] != FF::one()) {
            // wl has non-unit coefficient → wl is result[15]
            out.padding_indicator_reals[15] = analyzer.to_real(ab.w_l()[first_add]);
        } else if (ab.q_2()[first_add] != FF::one()) {
            // wr has non-unit coefficient → wr is result[15]
            out.padding_indicator_reals[15] = analyzer.to_real(ab.w_r()[first_add]);
        } else {
            // Shouldn't happen for MegaZK; return invalid
            return out;
        }

        out.valid = true;
        out.start_gate = gate_idx;
        return out;
    }
    return out;
}

/**
 * @brief Convenience overload — takes a RecursionConstraint and uses its key[0] as log_n.
 */
template <typename FF, typename CircuitBuilder>
PaddingArrayValidationResult validate_compute_padding_array_step(CircuitBuilder& builder,
                                                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                 const acir_format::RecursionConstraint& constraint)
{
    return validate_compute_padding_array_from_log_n<FF>(builder, analyzer, constraint.key[0]);
}

// ============================================================================
// Step2: gate_challenge dyadic powers (transcript squeeze + sqr chain)
// ============================================================================

static constexpr size_t NUM_GATE_CHALLENGES = 16; // VIRTUAL_LOG_N

struct GateChallengesResult {
    bool valid = false;
    std::array<uint32_t, NUM_GATE_CHALLENGES> gate_challenges{}; // real_idx of each power
};

/**
 * @brief Find the step2 transcript squeeze gate that produces `gate_challenge[0]`.
 *
 * `step2_padding_and_challenges` calls `get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n)`
 * which squeezes ONE challenge and then squares it iteratively. The squeeze creates ONE additional
 * transcript decompose gate beyond the 3 produced by oink (eta, beta/gamma, alpha).
 *
 * @param oink_squeeze_gates Set of gate indices already claimed by oink squeezes (from
 *                           OinkTranscriptSqueezeChallenges::squeeze_gate_indices).
 * @return real_idx of gate_challenge[0], or UINT32_MAX if no matching gate found / ambiguous.
 */
template <typename FF, typename CircuitBuilder>
uint32_t find_step2_gate_challenge_0(CircuitBuilder& builder, const std::set<size_t>& oink_squeeze_gates)
{
    auto& arith = builder.blocks.arithmetic;
    const FF two_127 = FF(2).pow(127);
    uint32_t found = UINT32_MAX;
    size_t match_count = 0;
    for (size_t g = 0; g < arith.size(); g++) {
        if (oink_squeeze_gates.count(g)) {
            continue; // skip oink's squeezes
        }
        if (arith.q_arith()[g] == FF::one() && arith.q_1()[g] == FF::one() && arith.q_2()[g] == two_127 &&
            arith.q_3()[g] == -FF::one() && arith.q_4()[g] == FF::one() && arith.q_m()[g].is_zero()) {
            found = builder.real_variable_index[arith.w_l()[g]];
            match_count++;
            if (match_count > 1) {
                return UINT32_MAX; // ambiguous — more than one extra decompose gate
            }
        }
    }
    return found;
}

/**
 * @brief Find the dyadic power chain gate_challenge[0..N-1].
 *
 * `get_dyadic_powers_of_challenge` computes `pows[i] = pows[i-1].sqr()`, so each subsequent
 * challenge is the square of the previous. This chains `find_sqr_of` N-1 times starting from
 * `gate_challenge[0]`.
 *
 * @param gc0_real real_idx of gate_challenge[0] (from find_step2_gate_challenge_0).
 * @return array of 16 real_idx values; `valid=false` if any sqr in the chain fails.
 */
template <typename FF, typename CircuitBuilder>
GateChallengesResult find_gate_challenge_dyadic_powers(uint32_t gc0_real,
                                                       CircuitBuilder& builder,
                                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    GateChallengesResult out;
    if (gc0_real == UINT32_MAX) {
        return out;
    }
    out.gate_challenges[0] = gc0_real;
    for (size_t i = 1; i < NUM_GATE_CHALLENGES; i++) {
        uint32_t next = find_sqr_of<FF>(out.gate_challenges[i - 1], builder, analyzer);
        if (next == UINT32_MAX) {
            return out;
        }
        out.gate_challenges[i] = next;
    }
    out.valid = true;
    return out;
}

/**
 * @brief Combined step2 padding + dyadic gate_challenge validation.
 *
 * step2_padding_and_challenges creates:
 *   1. padding_indicator_array (16 witnesses) via compute_padding_indicator_array(log_n)
 *   2. gate_challenges[0..15] via get_dyadic_powers_of_challenge (1 transcript squeeze + 15 sqr)
 *
 * Both are anchored by the oink squeeze challenges (to distinguish step2's squeeze from oink's).
 *
 * @param constraint RecursionConstraint (provides key[0] = log_circuit_size)
 * @param oink_squeeze_gates The `squeeze_gate_indices` from OinkTranscriptSqueezeChallenges
 */
struct Step2ValidationResult {
    bool valid = false;
    PaddingArrayValidationResult padding;
    GateChallengesResult challenges;
};

template <typename FF, typename CircuitBuilder>
Step2ValidationResult validate_step2_padding_and_challenges(CircuitBuilder& builder,
                                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                            const acir_format::RecursionConstraint& constraint,
                                                            const std::set<size_t>& oink_squeeze_gates)
{
    Step2ValidationResult out;
    out.padding = validate_compute_padding_array_step<FF>(builder, analyzer, constraint);
    if (!out.padding.valid) {
        return out;
    }
    uint32_t gc0 = find_step2_gate_challenge_0<FF>(builder, oink_squeeze_gates);
    if (gc0 == UINT32_MAX) {
        return out;
    }
    out.challenges = find_gate_challenge_dyadic_powers<FF>(gc0, builder, analyzer);
    if (!out.challenges.valid) {
        return out;
    }
    out.valid = true;
    return out;
}

template <typename FF, typename CircuitBuilder>
bool validate_sumcheck_transcript_hashing(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const acir_format::RecursionConstraint& constraint)
{
    (void)builder;
    (void)analyzer;
    (void)constraint;
    return true;
}

// ============================================================================
// Sumcheck verification stuff
// ============================================================================

// Round 0 math is special: partial_evaluation_result is the constant FF(1), so partially_evaluate
// emits fewer gates (3 vs 4 for rounds 1..15 where p_res is a witness).
// Round 15 math differs from 1..14 because padding_indicator[15] has a constant-folded form
// (see compute_padding_indicator_array: result[14] == result[15]).
static constexpr size_t SUMCHECK_MATH_GATES_ROUND_0 = 54;
static constexpr size_t SUMCHECK_MATH_GATES_ROUND_MID = 56; // rounds 1..14
static constexpr size_t SUMCHECK_MATH_GATES_ROUND_15 = 56;

static constexpr size_t SUMCHECK_MATH_HASH_ROUND_0 = 0x4e091a52c601faf8;
static constexpr size_t SUMCHECK_MATH_HASH_ROUND_MID = 0x19e42b4856f92b90;
static constexpr size_t SUMCHECK_MATH_HASH_ROUND_15 = 0x1080f1bf9d3487ad;

inline std::pair<size_t, size_t> sumcheck_math_expected(size_t round_idx)
{
    if (round_idx == 0) {
        return { SUMCHECK_MATH_GATES_ROUND_0, SUMCHECK_MATH_HASH_ROUND_0 };
    }
    if (round_idx == 15) {
        return { SUMCHECK_MATH_GATES_ROUND_15, SUMCHECK_MATH_HASH_ROUND_15 };
    }
    return { SUMCHECK_MATH_GATES_ROUND_MID, SUMCHECK_MATH_HASH_ROUND_MID };
}

template <typename FF, typename CircuitBuilder>
bool find_and_validate_sumcheck_math_round(size_t round_idx,
                                           uint32_t padding_indicator,
                                           CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    // Sumcheck round math = check_sum + compute_next_target_sum + partially_evaluate. All three
    // use padding_indicator as a witness. The FIRST pad-touching arithmetic gate is the first
    // gate of check_sum (encodes (1-pad)*target) with pattern:
    //   q_arith=1, q_m=-1, q_2=1, q_3=-1, w_l = padding_indicator
    // From that anchor, the math spans a fixed number of gates per round class.
    auto& ab = builder.blocks.arithmetic;
    size_t first_pad = SIZE_MAX;
    // Anchor = check_sum's first gate encoding `wo = (1 - pad_logical) * wr`.
    // Raw gate constraint: q_m*wl*wr + q_2*wr + q_3*wo = 0  with q_2=1, q_3=-1, q_1=q_4=q_c=0.
    // For the gate to realize (1-pad_logical)*wr, we need q_m * variable(wl) == -1 — this holds
    // both when padding_indicator has unit mul_const (q_m=-1) and when it has a non-unit view
    // (round 15 case: padding_indicator[15] constant-folded, q_m is an arbitrary constant).
    for (const auto& [blk, g] : analyzer.get_variable_gates(padding_indicator)) {
        if (&builder.blocks.get()[blk] != &ab) {
            continue;
        }
        bool selector_shape_ok = ab.q_arith()[g] == FF::one() && ab.q_2()[g] == FF::one() &&
                                 ab.q_3()[g] == FF::neg_one() && ab.q_1()[g].is_zero() && ab.q_4()[g].is_zero() &&
                                 ab.q_c()[g].is_zero() && analyzer.to_real(ab.w_l()[g]) == padding_indicator;
        if (!selector_shape_ok) {
            continue;
        }
        FF q_m_times_wl = ab.q_m()[g] * builder.get_variable(ab.w_l()[g]);
        if (q_m_times_wl != FF::neg_one()) {
            continue;
        }
        if (g < first_pad) {
            first_pad = g;
        }
    }
    if (first_pad == SIZE_MAX) {
        return false;
    }
    auto [expected_gates, expected_hash] = sumcheck_math_expected(round_idx);
    if (first_pad + expected_gates > ab.size()) {
        return false;
    }
    size_t hash = sha256_helpers::compute_selector_hash(0, ab, first_pad, first_pad + expected_gates - 1);
    return hash == expected_hash;
}

template <typename FF, typename CircuitBuilder>
bool validate_sumcheck_math(const std::array<uint32_t, 16>& padding_indicator_reals,
                            CircuitBuilder& builder,
                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    bool correct_math = true;
    for (size_t r = 0; r < padding_indicator_reals.size(); r++) {
        correct_math &= find_and_validate_sumcheck_math_round(r, padding_indicator_reals[r], builder, analyzer);
    }
    return correct_math;
}

/**
 * @brief Result of validating Shplemini's powers_of_evaluation_challenge sub-phase.
 *
 * The function computes r, r², r⁴, ..., r^{2^{log_n-1}} as log_n - 1 consecutive
 * squaring gates. On success, returns the anchor gate index and the real witness
 * index of the final power output (r^{2^{log_n-1}}).
 */
struct PowersOfEvaluationChallengeResult {
    bool valid = false;
    size_t anchor_gate = SIZE_MAX;
    uint32_t final_power_real = UINT32_MAX;
};

/**
 * @brief Validate Shplemini::powers_of_evaluation_challenge.
 *
 * Algorithm:
 *   1. Scan the arithmetic block range [arith_range_begin, arith_range_end) for the first gate
 *      where w_l == w_r == gemini_r_real with the squaring selector pattern
 *      (q_arith=1, q_m=1, q_3=-1, others zero).
 *   2. Walk (log_n - 1) consecutive gates, verifying each is a squaring gate whose
 *      w_l == w_r equals the previous gate's w_o.
 *
 * @param builder Circuit builder.
 * @param gemini_r_real Real witness index of the Gemini evaluation challenge r.
 * @param log_n log of circuit size (virtual_log_n for padded MegaZK).
 * @param arith_range_begin First arith-block gate index to scan (typically post_oink_arith).
 * @param arith_range_end One past last arith-block gate to scan (typically post_shplemini_arith).
 * @return PowersOfEvaluationChallengeResult.
 */
template <typename FF, typename CircuitBuilder>
PowersOfEvaluationChallengeResult validate_powers_of_evaluation_challenge(
    CircuitBuilder& builder, uint32_t gemini_r_real, size_t log_n, size_t arith_range_begin, size_t arith_range_end)
{
    PowersOfEvaluationChallengeResult out;
    if (log_n == 0) {
        return out;
    }
    auto& ab = builder.blocks.arithmetic;
    if (arith_range_end > ab.size()) {
        arith_range_end = ab.size();
    }
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    auto is_squaring_gate = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_m()[g] == FF::one() && ab.q_3()[g] == FF::neg_one() &&
               ab.q_1()[g].is_zero() && ab.q_2()[g].is_zero() && ab.q_4()[g].is_zero() && ab.q_c()[g].is_zero();
    };

    size_t anchor = SIZE_MAX;
    for (size_t g = arith_range_begin; g < arith_range_end; g++) {
        if (is_squaring_gate(g) && to_real(ab.w_l()[g]) == gemini_r_real && to_real(ab.w_r()[g]) == gemini_r_real) {
            anchor = g;
            break;
        }
    }
    if (anchor == SIZE_MAX) {
        return out;
    }

    const size_t expected_gates = log_n - 1;
    uint32_t prev = gemini_r_real;
    for (size_t i = 0; i < expected_gates; i++) {
        size_t g = anchor + i;
        if (g >= ab.size()) {
            return out;
        }
        if (!is_squaring_gate(g)) {
            return out;
        }
        if (to_real(ab.w_l()[g]) != prev || to_real(ab.w_r()[g]) != prev) {
            return out;
        }
        prev = to_real(ab.w_o()[g]);
    }
    out.valid = true;
    out.anchor_gate = anchor;
    out.final_power_real = prev;
    return out;
}

/**
 * @brief Result of validating ClaimBatcher::compute_scalars_for_each_batch.
 *
 * On success, exposes the real witness indices of the computed scalars + intermediates
 * for downstream validators (notably update_batch_mul_inputs, which consumes them).
 */
struct ComputeScalarsForEachBatchResult {
    bool valid = false;
    size_t anchor_gate = SIZE_MAX;
    uint32_t inv_pos_real = UINT32_MAX; // 1/(z - r), discovered from gate 1
    uint32_t inv_neg_real = UINT32_MAX; // 1/(z + r), discovered from gate 0
    uint32_t r_inv_real = UINT32_MAX;   // r⁻¹, introduced by gate 2
    uint32_t unshifted_scalar_real = UINT32_MAX;
    uint32_t shifted_scalar_real = UINT32_MAX;
};

/**
 * @brief Validate ClaimBatcher::compute_scalars_for_each_batch.
 *
 * Non-interleaved path (Chonk / Mega rollups), exactly 6 consecutive arith gates:
 *   gate 0: mul    ν · inv_neg = tmp1                 (q_m=1, q_3=-1)
 *   gate 1: add    inv_pos + tmp1 = unshifted_scalar  (q_1=1, q_2=1, q_3=-1)
 *   gate 2: invert r_inv · gemini_r = 1               (q_m=1, q_c=-1)
 *   gate 3: mul    ν · inv_neg = tmp2  (recomputed)   (q_m=1, q_3=-1)
 *   gate 4: sub    inv_pos - tmp2 = diff              (q_1=1, q_2=-1, q_3=-1)
 *   gate 5: mul    r_inv · diff = shifted_scalar      (q_m=1, q_3=-1)
 *
 * Anchor: first arith gate in [arith_range_begin, arith_range_end) with gate-0's exact
 * selector pattern AND w_l == shplonk_nu_real. The companion w_r (inv_neg) and the w_l
 * of gate 1 (inv_pos) are discovered from the circuit. gate 2 binds r_inv to gemini_r.
 *
 * @param builder Circuit builder.
 * @param analyzer StaticAnalyzer for gate tracing.
 * @param shplonk_nu_real Real witness index of Shplonk:nu.
 * @param gemini_r_real Real witness index of Gemini:r.
 * @return ComputeScalarsForEachBatchResult.
 */
template <typename FF, typename CircuitBuilder>
ComputeScalarsForEachBatchResult validate_compute_scalars_for_each_batch(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    uint32_t shplonk_nu_real,
    uint32_t gemini_r_real)
{
    ComputeScalarsForEachBatchResult out;
    auto& ab = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    // Define selector patterns using poseidon2_helpers::all_equal (same approach as
    // find_and_validate_compute_invert_gemini_denominators)
    auto mul_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_m) && q_3 == FF::neg_one() &&
               poseidon2_helpers::all_equal(FF::zero(), q_1, q_2, q_4, q_c);
    };

    auto add_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_1, q_2) && q_3 == FF::neg_one() &&
               poseidon2_helpers::all_equal(FF::zero(), q_m, q_4, q_c);
    };

    auto invert_pattern = [](const FF& q_arith,
                             const FF& q_1,
                             const FF& q_2,
                             const FF& q_3,
                             const FF& q_4,
                             const FF& q_m,
                             const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_m) && q_c == FF::neg_one() &&
               poseidon2_helpers::all_equal(FF::zero(), q_1, q_2, q_3, q_4);
    };

    auto sub_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_1) &&
               poseidon2_helpers::all_equal(FF::neg_one(), q_2, q_3) &&
               poseidon2_helpers::all_equal(FF::zero(), q_m, q_4, q_c);
    };

    auto gates = analyzer.get_variable_gates(shplonk_nu_real);
    std::vector<size_t> anchors;

    for (const auto& [blk_idx, g] : gates) {
        if (&builder.blocks.get()[blk_idx] != &ab) {
            continue;
        }
        if (g + 5 >= ab.size()) {
            continue;
        }

        // Check gate 0 pattern: mul with shplonk_nu on w_l
        if (!mul_pattern(
                ab.q_arith()[g], ab.q_1()[g], ab.q_2()[g], ab.q_3()[g], ab.q_4()[g], ab.q_m()[g], ab.q_c()[g])) {
            continue;
        }
        if (to_real(ab.w_l()[g]) != shplonk_nu_real) {
            continue;
        }

        anchors.push_back(g);
    }

    if (anchors.empty()) {
        return out;
    }

    // Validate the full 6-gate chain starting from the first anchor
    size_t anchor = anchors[0];

    // Extract inv_neg from gate 0 w_r.
    uint32_t inv_neg_real = to_real(ab.w_r()[anchor]);
    uint32_t tmp1_real = to_real(ab.w_o()[anchor]);

    // gate 1: add pattern
    size_t g1 = anchor + 1;
    if (!add_pattern(
            ab.q_arith()[g1], ab.q_1()[g1], ab.q_2()[g1], ab.q_3()[g1], ab.q_4()[g1], ab.q_m()[g1], ab.q_c()[g1])) {
        return out;
    }
    if (to_real(ab.w_r()[g1]) != tmp1_real) {
        return out;
    }
    uint32_t inv_pos_real = to_real(ab.w_l()[g1]);
    uint32_t unshifted_scalar_real = to_real(ab.w_o()[g1]);

    // gate 2: invert pattern with gemini_r on w_r
    size_t g2 = anchor + 2;
    if (!invert_pattern(
            ab.q_arith()[g2], ab.q_1()[g2], ab.q_2()[g2], ab.q_3()[g2], ab.q_4()[g2], ab.q_m()[g2], ab.q_c()[g2])) {
        return out;
    }
    if (to_real(ab.w_r()[g2]) != gemini_r_real) {
        return out;
    }
    uint32_t r_inv_real = to_real(ab.w_l()[g2]);

    // gate 3: mul pattern with shplonk_nu on w_l and inv_neg on w_r
    size_t g3 = anchor + 3;
    if (!mul_pattern(
            ab.q_arith()[g3], ab.q_1()[g3], ab.q_2()[g3], ab.q_3()[g3], ab.q_4()[g3], ab.q_m()[g3], ab.q_c()[g3])) {
        return out;
    }
    if (to_real(ab.w_l()[g3]) != shplonk_nu_real || to_real(ab.w_r()[g3]) != inv_neg_real) {
        return out;
    }
    uint32_t tmp2_real = to_real(ab.w_o()[g3]);

    // gate 4: sub pattern with inv_pos on w_l and tmp2 on w_r
    size_t g4 = anchor + 4;
    if (!sub_pattern(
            ab.q_arith()[g4], ab.q_1()[g4], ab.q_2()[g4], ab.q_3()[g4], ab.q_4()[g4], ab.q_m()[g4], ab.q_c()[g4])) {
        return out;
    }
    if (to_real(ab.w_l()[g4]) != inv_pos_real || to_real(ab.w_r()[g4]) != tmp2_real) {
        return out;
    }
    uint32_t diff_real = to_real(ab.w_o()[g4]);

    // gate 5: mul pattern with r_inv on w_l and diff on w_r
    size_t g5 = anchor + 5;
    if (!mul_pattern(
            ab.q_arith()[g5], ab.q_1()[g5], ab.q_2()[g5], ab.q_3()[g5], ab.q_4()[g5], ab.q_m()[g5], ab.q_c()[g5])) {
        return out;
    }
    if (to_real(ab.w_l()[g5]) != r_inv_real || to_real(ab.w_r()[g5]) != diff_real) {
        return out;
    }
    uint32_t shifted_scalar_real = to_real(ab.w_o()[g5]);

    out.valid = true;
    out.anchor_gate = anchor;
    out.inv_pos_real = inv_pos_real;
    out.inv_neg_real = inv_neg_real;
    out.r_inv_real = r_inv_real;
    out.unshifted_scalar_real = unshifted_scalar_real;
    out.shifted_scalar_real = shifted_scalar_real;
    return out;
}

static constexpr size_t INVERTED_GEMINI_DENOMINATORS_COMPUTATION_GATES = 64;
static constexpr size_t INVERTED_GEMINI_DENOMINATORS_COMPUTATION_HASH = 0x83b998dcc114ff96;
template <typename FF, typename CircuitBuilder>
bool find_and_validate_compute_invert_gemini_denominators(CircuitBuilder& builder,
                                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                          uint32_t shplonk_z_real,
                                                          uint32_t gemini_r_real)
{
    // 1. find 2 sequentitive gates for shplonk_challenge + gemini_r_challenge, shplonk_challenge - gemini_r_challenge
    auto& ab = builder.blocks.arithmetic;
    auto sub_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_1) &&
               poseidon2_helpers::all_equal(FF::zero(), q_m, q_4, q_c) &&
               poseidon2_helpers::all_equal(FF::neg_one(), q_2, q_3);
    };
    auto add_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_1, q_2, q_arith) &&
               poseidon2_helpers::all_equal(FF::zero(), q_m, q_4, q_c) && q_3 == FF::neg_one();
    };
    std::vector<std::pair<size_t, size_t>> gates = analyzer.get_variable_gates(shplonk_z_real);
    std::vector<size_t> start;
    for (const auto& [blk_idx, g] : gates) {
        if (&builder.blocks.get()[blk_idx] != &ab) {
            continue;
        }
        if (g + INVERTED_GEMINI_DENOMINATORS_COMPUTATION_GATES > ab.size()) {
            continue;
        }
        bool correct_selectors =
            sub_pattern(
                ab.q_arith()[g], ab.q_1()[g], ab.q_2()[g], ab.q_3()[g], ab.q_4()[g], ab.q_m()[g], ab.q_c()[g]) &&
            add_pattern(ab.q_arith()[g + 1],
                        ab.q_1()[g + 1],
                        ab.q_2()[g + 1],
                        ab.q_3()[g + 1],
                        ab.q_4()[g + 1],
                        ab.q_m()[g + 1],
                        ab.q_c()[g + 1]);
        bool correct_wires = poseidon2_helpers::all_equal(shplonk_z_real, ab.w_l()[g], ab.w_l()[g + 1]) &&
                             poseidon2_helpers::all_equal(gemini_r_real, ab.w_r()[g], ab.w_r()[g + 1]);
        if (correct_wires && correct_selectors) {
            start.emplace_back(g);
        }
    }
    BB_ASSERT_EQ(start.size(), 1U);
    std::size_t selectors_hash = sha256_helpers::compute_selector_hash(
        0, ab, start[0], start[0] + INVERTED_GEMINI_DENOMINATORS_COMPUTATION_GATES - 1);
    return selectors_hash == INVERTED_GEMINI_DENOMINATORS_COMPUTATION_HASH;
}

// -----------------------------------------------------------------------------
// update_batch_mul_inputs_and_batched_evaluation validator (MegaZK flavor only).
// Gate-count and hash constants are flavor-specific; extend later for other flavors.
// -----------------------------------------------------------------------------

// MegaZK: NUM_UNSHIFTED_ENTITIES = 55 (54 base + gemini_masking_poly), NUM_SHIFTED_ENTITIES = 5
// N = 60 total iterations → 4N - 1 = 239 gates.
static constexpr size_t UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_UNSHIFTED = 55;
static constexpr size_t UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_SHIFTED = 5;
static constexpr size_t UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_GATE_COUNT = 239;
static constexpr size_t UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_HASH = 0xc445150c5806279d;

/**
 * @brief Validate ClaimBatcher::update_batch_mul_inputs_and_batched_evaluation for MegaZK flavor.
 *
 * Algorithm:
 *   1. Pre-filter candidates via analyzer.get_variable_gates(rho_real). rho appears ONLY on w_r.
 *   2. First anchor: arith gate with pattern B (q_m=-1, q_3=-1, others 0), w_l=unshifted_scalar_real,
 *      w_r=rho_real. Must be exactly 1 such gate in the circuit.
 *   3. Boundary: gate_count == 239 and start + 239 <= arith.size().
 *   4. Witness-role counts across the 239-gate range:
 *        - w_r == rho_real                    : 61 hits (N+1 = 60 + 1 = 61)
 *        - w_l == unshifted_scalar_real       : 55 hits
 *        - w_l == shifted_scalar_real         : 5 hits
 *   5. Selector hash of the 239-gate range matches UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_HASH.
 *
 * @param builder Circuit builder.
 * @param analyzer Analyzer (for get_variable_gates).
 * @param rho_real Real witness index of rho (from shplemini_challenges).
 * @param unshifted_scalar_real Real witness index of claim_batcher.unshifted->scalar
 *   (from validate_compute_scalars_for_each_batch result).
 * @param shifted_scalar_real Real witness index of claim_batcher.shifted->scalar
 *   (from validate_compute_scalars_for_each_batch result).
 * @return true if all structural + hash checks pass.
 */
template <typename FF, typename CircuitBuilder>
bool find_and_validate_update_batch_mul_inputs_mega_zk(CircuitBuilder& builder,
                                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                       uint32_t rho_real,
                                                       uint32_t unshifted_scalar_real,
                                                       uint32_t shifted_scalar_real)
{
    auto& ab = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    // Pattern B (mul-neg): q_arith=1, q_m=-1, q_3=-1, q_1=q_2=q_4=q_c=0.
    auto pattern_b = [](const FF& q_arith,
                        const FF& q_1,
                        const FF& q_2,
                        const FF& q_3,
                        const FF& q_4,
                        const FF& q_m,
                        const FF& q_c) {
        return q_arith == FF::one() && q_m == FF::neg_one() && q_3 == FF::neg_one() && q_1.is_zero() && q_2.is_zero() &&
               q_4.is_zero() && q_c.is_zero();
    };

    // Scan rho's gate list for first-gate anchor.
    std::vector<size_t> anchors;
    for (const auto& [blk_idx, g] : analyzer.get_variable_gates(rho_real)) {
        if (&builder.blocks.get()[blk_idx] != &ab) {
            continue;
        }
        if (g + UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_GATE_COUNT > ab.size()) {
            continue;
        }
        if (!pattern_b(ab.q_arith()[g], ab.q_1()[g], ab.q_2()[g], ab.q_3()[g], ab.q_4()[g], ab.q_m()[g], ab.q_c()[g])) {
            continue;
        }
        if (to_real(ab.w_l()[g]) != unshifted_scalar_real || to_real(ab.w_r()[g]) != rho_real) {
            continue;
        }
        anchors.push_back(g);
    }
    if (anchors.size() != 1) {
        return false;
    }
    size_t start = anchors[0];
    size_t end = start + UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_GATE_COUNT;

    // Witness-role counts across the range.
    size_t rho_on_wr = 0;
    size_t unshifted_on_wl = 0;
    size_t shifted_on_wl = 0;
    for (size_t g = start; g < end; g++) {
        if (to_real(ab.w_r()[g]) == rho_real) {
            rho_on_wr++;
        }
        if (to_real(ab.w_l()[g]) == unshifted_scalar_real) {
            unshifted_on_wl++;
        }
        if (to_real(ab.w_l()[g]) == shifted_scalar_real) {
            shifted_on_wl++;
        }
    }
    // N + 1 = 60 + 1 = 61 for MegaZK.
    const size_t expected_rho_on_wr =
        UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_UNSHIFTED + UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_SHIFTED + 1;
    if (rho_on_wr != expected_rho_on_wr) {
        return false;
    }
    if (unshifted_on_wl != UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_UNSHIFTED) {
        return false;
    }
    if (shifted_on_wl != UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_NUM_SHIFTED) {
        return false;
    }

    // Selector hash over the full range.
    std::size_t selectors_hash = sha256_helpers::compute_selector_hash(0, ab, start, end - 1);
    return selectors_hash == UPDATE_BATCH_MUL_INPUTS_MEGA_ZK_HASH;
}

// -----------------------------------------------------------------------------
// add_zk_data validator (MegaZK flavor only).
// Uses 4-gate multi-anchor:
//   gate 0 : FP-E (SUB, q_1=1, q_2=-1, q_3=-1)                wl=shplonk_z, wr=gemini_r
//   gate 1 : FP-B (INV, q_m=1, q_c=-1)
//   gate 3 : FP-D (FUSED, q_1=1, q_2=-subgroup_gen, q_3=-1)   wl=shplonk_z, wr=gemini_r
//   gate 18 (last): FP-F (NEG-SUM, q_1=-1, q_2=-1, q_3=-1)
// Plus: gate count = 19 and full-range selector hash match.
// -----------------------------------------------------------------------------

static constexpr size_t ADD_ZK_DATA_MEGA_ZK_GATE_COUNT = 19;
static constexpr size_t ADD_ZK_DATA_MEGA_ZK_HASH = 0x63ca33aacd8fa26a;

/**
 * @brief Validate ShpleminiVerifier::add_zk_data for MegaZK flavor.
 *
 * @param builder Circuit builder.
 * @param analyzer Static analyzer (for get_variable_gates pre-filter).
 * @param shplonk_z_real Real witness index of Shplonk:z challenge.
 * @param gemini_r_real Real witness index of Gemini:r challenge.
 * @return true if 4-gate multi-anchor + count + selector hash all match.
 */
template <typename FF, typename CircuitBuilder>
bool find_and_validate_add_zk_data_mega_zk(CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                           uint32_t shplonk_z_real,
                                           uint32_t gemini_r_real)
{
    auto& ab = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    // For stdlib::bn254<Builder> (Chonk recursion context), subgroup_generator is the BN254
    // 256th root of unity. q_2 in gate +3 carries its negation modulo p.
    const FF neg_subgroup_generator = -stdlib::bn254<CircuitBuilder>::subgroup_generator;

    // Pattern E: q_arith=1, q_1=1, q_2=-1, q_3=-1, others 0.
    auto is_fp_e = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_1()[g] == FF::one() && ab.q_2()[g] == FF::neg_one() &&
               ab.q_3()[g] == FF::neg_one() && ab.q_4()[g].is_zero() && ab.q_m()[g].is_zero() && ab.q_c()[g].is_zero();
    };
    // Pattern B (invert): q_arith=1, q_m=1, q_c=-1, others 0.
    auto is_fp_b = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_m()[g] == FF::one() && ab.q_c()[g] == FF::neg_one() &&
               ab.q_1()[g].is_zero() && ab.q_2()[g].is_zero() && ab.q_3()[g].is_zero() && ab.q_4()[g].is_zero();
    };
    // Pattern D (fused with -g constant in q_2).
    auto is_fp_d = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_1()[g] == FF::one() && ab.q_2()[g] == neg_subgroup_generator &&
               ab.q_3()[g] == FF::neg_one() && ab.q_4()[g].is_zero() && ab.q_m()[g].is_zero() && ab.q_c()[g].is_zero();
    };
    // Pattern F (neg-sum): q_arith=1, q_1=-1, q_2=-1, q_3=-1, others 0.
    auto is_fp_f = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_1()[g] == FF::neg_one() && ab.q_2()[g] == FF::neg_one() &&
               ab.q_3()[g] == FF::neg_one() && ab.q_4()[g].is_zero() && ab.q_m()[g].is_zero() && ab.q_c()[g].is_zero();
    };

    // Pre-filter candidate start gates via shplonk_z's arithmetic-block appearances.
    std::vector<size_t> candidates;
    for (const auto& [blk_idx, g] : analyzer.get_variable_gates(shplonk_z_real)) {
        if (&builder.blocks.get()[blk_idx] != &ab) {
            continue;
        }
        if (g + ADD_ZK_DATA_MEGA_ZK_GATE_COUNT > ab.size()) {
            continue;
        }
        // Gate 0: FP-E with (z, r) on (wl, wr).
        if (!is_fp_e(g)) {
            continue;
        }
        if (to_real(ab.w_l()[g]) != shplonk_z_real || to_real(ab.w_r()[g]) != gemini_r_real) {
            continue;
        }
        // Gate 1: FP-B (invert).
        if (!is_fp_b(g + 1)) {
            continue;
        }
        // Gate 3: FP-D (fused, -g in q_2) with (z, r) on (wl, wr).
        if (!is_fp_d(g + 3)) {
            continue;
        }
        if (to_real(ab.w_l()[g + 3]) != shplonk_z_real || to_real(ab.w_r()[g + 3]) != gemini_r_real) {
            continue;
        }
        // Gate 18 (last): FP-F (neg-sum).
        if (!is_fp_f(g + ADD_ZK_DATA_MEGA_ZK_GATE_COUNT - 1)) {
            continue;
        }
        candidates.push_back(g);
    }
    if (candidates.size() != 1) {
        return false;
    }
    size_t start = candidates[0];
    size_t end = start + ADD_ZK_DATA_MEGA_ZK_GATE_COUNT;

    std::size_t selectors_hash = sha256_helpers::compute_selector_hash(0, ab, start, end - 1);
    return selectors_hash == ADD_ZK_DATA_MEGA_ZK_HASH;
}

// -----------------------------------------------------------------------------
// check_libra_evaluations_consistency validator (MegaZK flavor only).
// Strategy:
//   1. Find unique `claimed_libra` gate (w_r=claim, w_l=libra[2]=grand_sum, SUB pattern).
//   2. Derive start = claim_gate - 1429 (pinned offset).
//   3. Check start gate: r·r squaring (FP-A MUL, w_l=w_r=gemini_r).
//   4. Check last gate (start + 1433): ADD with w_o == w_4 (diff → zero_witness).
//   5. Hash 1434-gate range, compare to CHECK_LIBRA_MEGA_ZK_HASH.
// -----------------------------------------------------------------------------

static constexpr size_t CHECK_LIBRA_MEGA_ZK_GATE_COUNT = 1434;
static constexpr size_t CHECK_LIBRA_MEGA_ZK_CLAIM_OFFSET = 1429;
static constexpr size_t CHECK_LIBRA_MEGA_ZK_HASH = 0x2c4dc2e92738e11b;

/**
 * @brief Validate SmallSubgroupIPAVerifier::check_libra_evaluations_consistency for MegaZK.
 *
 * @param builder Circuit builder.
 * @param analyzer Static analyzer.
 * @param gemini_r_real Real witness index of Gemini:r.
 * @param grand_sum_real Real witness index of libra_evaluations[2] (grand_sum_eval).
 * @param claimed_libra_real Real witness index of claimed_libra_evaluation (sumcheck output).
 * @return true if all checks pass.
 */
template <typename FF, typename CircuitBuilder>
bool find_and_validate_check_libra_consistency_mega_zk(CircuitBuilder& builder,
                                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                       uint32_t gemini_r_real,
                                                       uint32_t grand_sum_real,
                                                       uint32_t claimed_libra_real)
{
    auto& ab = builder.blocks.arithmetic;
    auto to_real = [&](uint32_t w) { return builder.real_variable_index[w]; };

    // Step 1: locate unique claim gate in arith block matching (SUB, w_l=grand_sum, w_r=claim).
    // claimed_libra may appear elsewhere (sumcheck) — filter by gate signature, expect exactly 1.
    auto matches_claim_sub = [&](size_t g) {
        return ab.q_arith()[g] == FF::one() && ab.q_1()[g] == FF::one() && ab.q_2()[g] == FF::neg_one() &&
               ab.q_3()[g] == FF::neg_one() && ab.q_m()[g].is_zero() && ab.q_4()[g].is_zero() &&
               ab.q_c()[g].is_zero() && to_real(ab.w_l()[g]) == grand_sum_real &&
               to_real(ab.w_r()[g]) == claimed_libra_real;
    };
    size_t claim_gate = SIZE_MAX;
    for (const auto& [blk_idx, g] : analyzer.get_variable_gates(claimed_libra_real)) {
        if (&builder.blocks.get()[blk_idx] != &ab) {
            continue;
        }
        if (!matches_claim_sub(g)) {
            continue;
        }
        if (claim_gate != SIZE_MAX) {
            return false; // duplicate match → tampered
        }
        claim_gate = g;
    }
    if (claim_gate == SIZE_MAX) {
        return false;
    }

    // Step 2: derive start + end.
    if (claim_gate < CHECK_LIBRA_MEGA_ZK_CLAIM_OFFSET) {
        return false;
    }
    size_t start = claim_gate - CHECK_LIBRA_MEGA_ZK_CLAIM_OFFSET;
    size_t end = start + CHECK_LIBRA_MEGA_ZK_GATE_COUNT;
    if (end > ab.size()) {
        return false;
    }

    // Step 3: start gate = r·r squaring. FP-A MUL: q_arith=1, q_m=1, q_3=-1, rest=0.
    if (!(ab.q_arith()[start] == FF::one() && ab.q_m()[start] == FF::one() && ab.q_3()[start] == FF::neg_one() &&
          ab.q_1()[start].is_zero() && ab.q_2()[start].is_zero() && ab.q_4()[start].is_zero() &&
          ab.q_c()[start].is_zero())) {
        return false;
    }
    if (to_real(ab.w_l()[start]) != gemini_r_real || to_real(ab.w_r()[start]) != gemini_r_real) {
        return false;
    }

    // Step 4: last gate = ADD with w_o == w_4 (diff → zero).
    size_t last = end - 1;
    if (!(ab.q_arith()[last] == FF::one() && ab.q_1()[last] == FF::one() && ab.q_2()[last] == FF::one() &&
          ab.q_3()[last] == FF::neg_one() && ab.q_m()[last].is_zero() && ab.q_4()[last].is_zero() &&
          ab.q_c()[last].is_zero())) {
        return false;
    }
    if (to_real(ab.w_o()[last]) != to_real(ab.w_4()[last])) {
        return false;
    }

    // Step 5: selector hash.
    std::size_t selectors_hash = sha256_helpers::compute_selector_hash(0, ab, start, end - 1);
    return selectors_hash == CHECK_LIBRA_MEGA_ZK_HASH;
}

template <typename FF, typename CircuitBuilder>
bool validate_shplonk_batching_challenges_powers(uint32_t shplonk_nu,
                                                 size_t virtual_log_n,
                                                 bool has_zk = true,
                                                 bool committed_sumcheck = true)
{
    (void)shplonk_nu;
    size_t num_powers = 2 * virtual_log_n + bb::NUM_INTERLEAVING_CLAIMS;
    // Each round univariate is opened at 0, 1, and a round challenge.
    static constexpr size_t NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND = 3;

    // Shplonk evaluation and batching challenges are re-used in SmallSubgroupIPA.
    if (has_zk) {
        num_powers += bb::NUM_SMALL_IPA_EVALUATIONS;
    }

    // Commited sumcheck adds 3 claims per round.
    if (committed_sumcheck) {
        num_powers += NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND * virtual_log_n;
    }
    (void)num_powers;
    auto mul_pattern = [](const FF& q_arith,
                          const FF& q_1,
                          const FF& q_2,
                          const FF& q_3,
                          const FF& q_4,
                          const FF& q_m,
                          const FF& q_c) {
        return poseidon2_helpers::all_equal(FF::one(), q_arith, q_m) && q_3 == FF::neg_one() &&
               poseidon2_helpers::all_equal(FF::zero(), q_1, q_2, q_4, q_c);
    };
    (void)mul_pattern;
    return false;
}

// ============================================================================
// Shplemini reverse fingerprint scanner — MegaZK
// ============================================================================

static constexpr size_t SCANNER_FINGERPRINT_SIZE = 20;

struct FunctionFingerprint {
    size_t gate_count;
    size_t prefix_hash;
    size_t full_hash;
    size_t fingerprint_size;
};

static constexpr FunctionFingerprint GEMINI_TRANSCRIPT_READ_MEGA_ZK = {
    1621, 0xb227062eafc20463ULL, 0x459ebe8f362836e8ULL, SCANNER_FINGERPRINT_SIZE
};
static constexpr FunctionFingerprint SHPLONK_NU_PLUS_POWERS_MEGA_ZK = {
    116, 0x5d3db2a5af5e1fbeULL, 0xfd73152facfbeffcULL, SCANNER_FINGERPRINT_SIZE
};
static constexpr FunctionFingerprint SHPLONK_Q_AND_Z_MEGA_ZK = {
    113, 0xb44f41ca2be07184ULL, 0xede24734d188ca38ULL, SCANNER_FINGERPRINT_SIZE
};
static constexpr FunctionFingerprint COMPUTE_FOLD_POS_EVALS_MEGA_ZK = {
    208, 0x669b3642d78ab780ULL, 0x8a12dcbc539c6f19ULL, SCANNER_FINGERPRINT_SIZE
};
static constexpr FunctionFingerprint BATCH_GEMINI_CLAIMS_MEGA_ZK = {
    119, 0x291fb9770ec5d0d9ULL, 0x90fd4c369e36706bULL, SCANNER_FINGERPRINT_SIZE
};

struct FunctionMatch {
    size_t arith_start = 0;
    bool found = false;
    bool valid = false;
};

struct PreZScanResult {
    bool all_found = false;
    FunctionMatch gemini_transcript_read;
    FunctionMatch shplonk_nu_plus_powers;
    FunctionMatch shplonk_Q_and_z;
};

struct PostZScanResult {
    bool all_found = false;
    FunctionMatch compute_fold_pos_evals;
    FunctionMatch batch_gemini_claims;
};

/**
 * @brief Find z's first arithmetic gate via get_variable_gates, then scan backwards
 * matching 20-gate selector prefix hashes against known pre-z function fingerprints.
 * On prefix match, validate full function hash. Jump backward on confirmed match.
 */
template <typename FF, typename CircuitBuilder>
PreZScanResult scan_pre_z_functions_mega_zk(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            uint32_t shplonk_z_real)
{
    PreZScanResult result;
    auto& ab = builder.blocks.arithmetic;

    size_t z_first_arith = ab.size();
    for (const auto& [blk_idx, g] : analyzer.get_variable_gates(shplonk_z_real)) {
        if (&builder.blocks.get()[blk_idx] == &ab && g < z_first_arith) {
            z_first_arith = g;
        }
    }
    if (z_first_arith >= ab.size()) {
        return result;
    }

    struct Entry {
        const FunctionFingerprint* fp;
        FunctionMatch* out;
    };
    std::array<Entry, 3> entries = { {
        { &SHPLONK_Q_AND_Z_MEGA_ZK, &result.shplonk_Q_and_z },
        { &SHPLONK_NU_PLUS_POWERS_MEGA_ZK, &result.shplonk_nu_plus_powers },
        { &GEMINI_TRANSCRIPT_READ_MEGA_ZK, &result.gemini_transcript_read },
    } };

    size_t i = z_first_arith;
    while (i > 0) {
        bool matched = false;
        for (auto& [fp, out] : entries) {
            if (out->found) {
                continue;
            }
            if (i < fp->fingerprint_size) {
                continue;
            }
            size_t candidate_start = i - fp->fingerprint_size;
            size_t pfx = sha256_helpers::compute_selector_hash(
                0, ab, candidate_start, candidate_start + fp->fingerprint_size - 1);
            if (pfx != fp->prefix_hash) {
                continue;
            }
            if (candidate_start + fp->gate_count > ab.size()) {
                continue;
            }
            size_t full =
                sha256_helpers::compute_selector_hash(0, ab, candidate_start, candidate_start + fp->gate_count - 1);
            if (full == fp->full_hash) {
                out->arith_start = candidate_start;
                out->found = true;
                out->valid = true;
                i = candidate_start;
                matched = true;
                break;
            }
        }
        if (!matched) {
            i--;
        }
    }

    result.all_found =
        result.gemini_transcript_read.found && result.shplonk_nu_plus_powers.found && result.shplonk_Q_and_z.found;
    return result;
}

/**
 * @brief From the end of the last known post-z function, scan forward matching fingerprints
 * for compute_fold_pos_evaluations and batch_gemini_claims_received_from_prover.
 *
 * @param post_z_start First arithmetic gate after shplonk_Q_and_z (= start of
 *                     compute_inverted_gemini_denominators). Already validated by existing
 *                     validators; this scans the region AFTER those validated functions.
 */
template <typename FF, typename CircuitBuilder>
PostZScanResult scan_post_z_functions_mega_zk(CircuitBuilder& builder, size_t scan_start)
{
    PostZScanResult result;
    auto& ab = builder.blocks.arithmetic;

    struct Entry {
        const FunctionFingerprint* fp;
        FunctionMatch* out;
    };
    std::array<Entry, 2> entries = { {
        { &COMPUTE_FOLD_POS_EVALS_MEGA_ZK, &result.compute_fold_pos_evals },
        { &BATCH_GEMINI_CLAIMS_MEGA_ZK, &result.batch_gemini_claims },
    } };

    size_t i = scan_start;
    while (i + SCANNER_FINGERPRINT_SIZE <= ab.size()) {
        bool matched = false;
        for (auto& [fp, out] : entries) {
            if (out->found) {
                continue;
            }
            if (i + fp->fingerprint_size > ab.size()) {
                continue;
            }
            size_t pfx = sha256_helpers::compute_selector_hash(0, ab, i, i + fp->fingerprint_size - 1);
            if (pfx != fp->prefix_hash) {
                continue;
            }
            if (i + fp->gate_count > ab.size()) {
                continue;
            }
            size_t full = sha256_helpers::compute_selector_hash(0, ab, i, i + fp->gate_count - 1);
            if (full == fp->full_hash) {
                out->arith_start = i;
                out->found = true;
                out->valid = true;
                i += fp->gate_count;
                matched = true;
                break;
            }
        }
        if (!matched) {
            i++;
        }
    }

    result.all_found = result.compute_fold_pos_evals.found && result.batch_gemini_claims.found;
    return result;
}

} // namespace recursion_helpers

/**
 * @namespace ShpleminiVerification
 * @brief Fingerprints for Shplemini verifier sub-stages generated by MegaZK recursion.
 */
namespace ShpleminiVerification {

static constexpr recursion_helpers::FunctionFingerprint RHO_ARITHMETIC = {
    232, 0xb227062eafc20463ULL, 0x35843c307bcf4ea8ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint RHO_POSEIDON2_EXT = {
    240, 0x0ec92a899925d755ULL, 0xf571afd80ee07dbeULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint RHO_POSEIDON2_INT = {
    1368, 0xee3a7ac895f8a6d9ULL, 0x8d716681102e5f67ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint GEMINI_FOLD_COMMITMENTS_ARITHMETIC = {
    1185, 0xb44f41ca2be07184ULL, 0xada94ad96a7709bbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint GEMINI_FOLD_COMMITMENTS_NNF = {
    930, 0xff2ca3c0bde9b337ULL, 0x28d6f89a47285bf1ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint GEMINI_R_ARITHMETIC = {
    204, 0x714eae44f35f39a4ULL, 0x49588000df840bc6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint GEMINI_R_POSEIDON2_EXT = {
    210, 0x0ec92a899925d755ULL, 0x9c382d41f3282cabULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint GEMINI_R_POSEIDON2_INT = {
    1197, 0xee3a7ac895f8a6d9ULL, 0x33ea466ad110c6fcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint GEMINI_EVALUATION_CHALLENGE_POWERS_ARITHMETIC = {
    15, 0xee9ead7483bed27aULL, 0xee9ead7483bed27aULL, 15
};

static constexpr recursion_helpers::FunctionFingerprint SHPLONK_NU_ARITHMETIC = {
    80, 0x5d3db2a5af5e1fbeULL, 0x9a58b3bce654e9ffULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SHPLONK_NU_POSEIDON2_EXT = {
    70, 0x0ec92a899925d755ULL, 0xc30dd3ab427eb0c0ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SHPLONK_NU_POSEIDON2_INT = {
    399, 0xee3a7ac895f8a6d9ULL, 0x6619c8437f11d164ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHING_CHALLENGE_POWERS_ARITHMETIC = {
    36, 0x73715a23f0ac1778ULL, 0x0e0aa10e65944092ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint SHPLONK_Q_ARITHMETIC = {
    79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SHPLONK_Q_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint SHPLONK_Z_ARITHMETIC = {
    34, 0x241e4591236fc64cULL, 0xf1e15184839eaab7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SHPLONK_Z_POSEIDON2_EXT = {
    20, 0x0ec92a899925d755ULL, 0x0ec92a899925d755ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SHPLONK_Z_POSEIDON2_INT = {
    114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint SHPLONK_INVERSE_GEMINI_DENOMINATORS_ARITHMETIC = {
    64, 0xdc247e5cb4c97cfeULL, 0x83b998dcc114ff96ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint CLAIM_BATCHER_COMPUTE_SCALARS_ARITHMETIC = {
    6, 0x4e7f9c5b144e4e7bULL, 0x4e7f9c5b144e4e7bULL, 6
};

static constexpr recursion_helpers::FunctionFingerprint CLAIM_BATCHER_UPDATE_BATCH_MUL_INPUTS_ARITHMETIC = {
    239, 0x7418f3fd8889bf48ULL, 0xc445150c5806279dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint GEMINI_FOLD_POS_EVALUATIONS_ARITHMETIC = {
    208, 0x669b3642d78ab780ULL, 0x8a12dcbc539c6f19ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint BATCH_GEMINI_CLAIMS_ARITHMETIC = {
    119, 0x291fb9770ec5d0d9ULL, 0x90fd4c369e36706bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint A0_CONSTANT_TERMS_ARITHMETIC = {
    5, 0x2be726d20ea42a6bULL, 0x2be726d20ea42a6bULL, 5
};

static constexpr recursion_helpers::FunctionFingerprint REMOVE_REPEATED_COMMITMENTS_ARITHMETIC = {
    5, 0x94421af8b068909fULL, 0x94421af8b068909fULL, 5
};

static constexpr recursion_helpers::FunctionFingerprint ADD_ZK_DATA_ARITHMETIC = {
    19, 0x63ca33aacd8fa26aULL, 0x63ca33aacd8fa26aULL, 19
};

static constexpr recursion_helpers::FunctionFingerprint CHECK_LIBRA_EVALUATIONS_CONSISTENCY_ARITHMETIC = {
    1434, 0xb3b67051b69a6644ULL, 0x2c4dc2e92738e11bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

} // namespace ShpleminiVerification

/**
 * @namespace KZGVerification
 * @brief Namespace for KZG verification-related data structures and utilities.
 */
namespace KZGVerification {

/**
 * @brief Structure storing a reference to a block and its associated fingerprint.
 * @tparam BlockType The type of the block (e.g., arithmetic block, poseidon2 block)
 */
template <typename BlockType> struct FunctionBlockFingerPrint {
    const BlockType& block;                             // Reference to the block
    recursion_helpers::FunctionFingerprint fingerprint; // Fingerprint for this block
};

static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC = {
    79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_RECEIVE_KZG_W_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint MASKING_CHALLENGE_ARITHMETIC = {
    34, 0x241e4591236fc64cULL, 0xf1e15184839eaab7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint MASKING_CHALLENGE_POSEIDON2_EXT = {
    20, 0x0ec92a899925d755ULL, 0x0ec92a899925d755ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint MASKING_CHALLENGE_POSEIDON2_INT = {
    114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_ARITHMETIC = {
    326064, 0xd26f43ff1466a143ULL, 0xed39caefb5f53b02ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_MEMORY = {
    21855, 0xe7fd0be5c039f40fULL, 0xb3119f71068352b8ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_NNF = {
    180686, 0xff2ca3c0bde9b337ULL, 0x83d2f8a03cd96b83ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

/**
 * @brief Validation result for the `KZG:W_receive` stage.
 *
 * `arithmetic_gate_start_idx` points to the arithmetic receive range. `nnf_gate_start_idx` points
 * to the linked NNF receive range, which is immediately followed by the batch_mul NNF range.
 */
struct TranscriptReceiveValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validation result for the `KZG:masking_challenge` stage.
 *
 * The arithmetic start is derived from the validated transcript receive stage. The Poseidon2 starts
 * are discovered by following witness links from arithmetic to external, then external to internal.
 */
struct MaskingChallengeValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validation result for the `KZG:batch_mul` stage.
 *
 * Arithmetic and NNF starts are derived from prior KZG stages. The memory start is discovered from
 * witness links out of the arithmetic batch_mul range.
 */
struct BatchMulValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    size_t memory_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Find the index of a trace block inside `builder.blocks.get()`.
 *
 * Block identity is checked by address, matching how block indices are resolved elsewhere in the
 * graph description code. The index is later used to compare StaticAnalyzer block references.
 *
 * @tparam CircuitBuilder Circuit builder type containing trace blocks.
 * @tparam Block Concrete trace block type.
 * @param builder Builder that owns the trace blocks.
 * @param block Block reference to locate.
 * @return Block index when the block belongs to the builder, otherwise `std::nullopt`.
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_block_index(CircuitBuilder& builder, const Block& block)
{
    const auto& blocks_data = builder.blocks.get();
    for (size_t i = 0; i < blocks_data.size(); i++) {
        if (std::addressof(blocks_data[i]) == std::addressof(block)) {
            return i;
        }
    }
    return std::nullopt;
}

/**
 * @brief Check whether a function fingerprint matches a block range at `start`.
 *
 * Arithmetic blocks use `calculate_hash_arithmetic_block` so constant `fix_witness` gates are
 * handled consistently with the arithmetic scanner. Other blocks use selector hashing directly.
 * Both the prefix hash and full hash must match.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @tparam Block Trace block type to hash.
 * @param builder Builder owning the block.
 * @param block Block whose selector range is checked.
 * @param start Candidate function start gate in `block`.
 * @param fp Expected function fingerprint.
 * @return `true` when prefix and full hashes match at `start`.
 */
template <typename CircuitBuilder, typename Block>
bool matches_fingerprint_at(CircuitBuilder& builder,
                            Block& block,
                            size_t start,
                            const recursion_helpers::FunctionFingerprint& fp)
{
    if (start + fp.gate_count > block.size() || start + fp.fingerprint_size > block.size()) {
        return false;
    }

    auto& arith = builder.blocks.arithmetic;
    const auto block_idx = find_block_index(builder, block);
    const bool is_arithmetic_block = block_idx.has_value() && &builder.blocks.get()[*block_idx] == &arith;
    const size_t prefix_hash =
        is_arithmetic_block
            ? recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fp.fingerprint_size)
            : sha256_helpers::compute_selector_hash(0, block, start, start + fp.fingerprint_size - 1);
    if (prefix_hash != fp.prefix_hash) {
        return false;
    }

    const size_t full_hash =
        is_arithmetic_block ? recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fp.gate_count)
                            : sha256_helpers::compute_selector_hash(0, block, start, start + fp.gate_count - 1);
    return full_hash == fp.full_hash;
}

/**
 * @brief Find a fingerprint range that contains an anchor gate.
 *
 * The search enumerates every valid `start` satisfying
 * `start <= anchor_gate_idx < start + fp.gate_count`, then validates each candidate by hash.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @tparam Block Trace block type.
 * @param builder Builder owning the block.
 * @param block Block to scan.
 * @param anchor_gate_idx Gate that must be inside the matched range.
 * @param fp Expected function fingerprint.
 * @return Start gate for the first matching range, otherwise `std::nullopt`.
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_containing_gate(CircuitBuilder& builder,
                                                             Block& block,
                                                             size_t anchor_gate_idx,
                                                             const recursion_helpers::FunctionFingerprint& fp)
{
    if (fp.gate_count > block.size()) {
        return std::nullopt;
    }
    const size_t first_start_that_contains_anchor =
        anchor_gate_idx >= fp.gate_count - 1 ? anchor_gate_idx - (fp.gate_count - 1) : 0;
    const size_t last_start_that_contains_anchor = anchor_gate_idx;
    const size_t last_start_that_fits_block = block.size() - fp.gate_count;
    const size_t last_candidate_start = std::min(last_start_that_contains_anchor, last_start_that_fits_block);

    for (size_t start = first_start_that_contains_anchor; start <= last_candidate_start; ++start) {
        if (matches_fingerprint_at(builder, block, start, fp)) {
            return start;
        }
    }
    return std::nullopt;
}

/**
 * @brief Find a fingerprint range containing any gate from a set of anchors.
 *
 * This is used when witness links identify gates in another block but not necessarily the start of
 * the function in that block.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @tparam Block Trace block type.
 * @param builder Builder owning the block.
 * @param block Block to scan.
 * @param anchor_gate_indices Candidate gates that may sit inside the target range.
 * @param fp Expected function fingerprint.
 * @return Start gate for the first matching range, otherwise `std::nullopt`.
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_containing_any_gate(CircuitBuilder& builder,
                                                                 Block& block,
                                                                 const std::set<size_t>& anchor_gate_indices,
                                                                 const recursion_helpers::FunctionFingerprint& fp)
{
    for (size_t anchor_gate_idx : anchor_gate_indices) {
        if (auto start = find_fingerprint_range_containing_gate(builder, block, anchor_gate_idx, fp);
            start.has_value()) {
            return start;
        }
    }
    return std::nullopt;
}

/**
 * @brief Find a fingerprint range that starts at or shortly after one of the anchor gates.
 *
 * This directional search is useful for Poseidon2 ranges where witness links can point near the
 * range boundary and we want to avoid matching unrelated earlier ranges.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @tparam Block Trace block type.
 * @param builder Builder owning the block.
 * @param block Block to scan.
 * @param anchor_gate_indices Candidate gates used as lower bounds for the search.
 * @param fp Expected function fingerprint.
 * @return Start gate for the first matching range, otherwise `std::nullopt`.
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_at_or_after_any_gate(CircuitBuilder& builder,
                                                                  Block& block,
                                                                  const std::set<size_t>& anchor_gate_indices,
                                                                  const recursion_helpers::FunctionFingerprint& fp)
{
    if (fp.gate_count > block.size()) {
        return std::nullopt;
    }

    for (size_t anchor_gate_idx : anchor_gate_indices) {
        const size_t max_start = std::min(block.size() - fp.gate_count, anchor_gate_idx + fp.gate_count);
        for (size_t start = anchor_gate_idx; start <= max_start; ++start) {
            if (matches_fingerprint_at(builder, block, start, fp)) {
                return start;
            }
        }
    }

    return std::nullopt;
}

/**
 * @brief Collect gates in a target block that share witnesses with a source block range.
 *
 * For each source gate wire, this resolves the real witness index and asks the StaticAnalyzer for
 * all gates using that witness. Gates belonging to `target_block` are returned as anchors.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @tparam SourceBlock Source trace block type.
 * @tparam TargetBlock Target trace block type.
 * @param builder Builder owning both blocks.
 * @param analyzer Static analyzer built for `builder`.
 * @param source_block Block whose witness wires are scanned.
 * @param source_start Inclusive source range start.
 * @param source_end Exclusive source range end.
 * @param target_block Block whose linked gates should be collected.
 * @return Set of target-block gate indices linked by shared real witnesses.
 */
template <typename FF, typename CircuitBuilder, typename SourceBlock, typename TargetBlock>
std::set<size_t> collect_linked_gates(CircuitBuilder& builder,
                                      cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                      SourceBlock& source_block,
                                      size_t source_start,
                                      size_t source_end,
                                      TargetBlock& target_block)
{
    std::set<size_t> linked_gates;
    const auto target_block_idx = find_block_index(builder, target_block);
    if (!target_block_idx.has_value()) {
        return linked_gates;
    }

    std::set<uint32_t> visited_real_indices;
    for (size_t gate_idx = source_start; gate_idx < source_end; ++gate_idx) {
        std::array<uint32_t, 4> wires = { source_block.w_l()[gate_idx],
                                          source_block.w_r()[gate_idx],
                                          source_block.w_o()[gate_idx],
                                          source_block.w_4()[gate_idx] };
        for (uint32_t witness_idx : wires) {
            const uint32_t real_idx = builder.real_variable_index[witness_idx];
            if (!visited_real_indices.insert(real_idx).second) {
                continue;
            }
            for (const auto& [block_idx, linked_gate_idx] : analyzer.get_variable_gates(real_idx)) {
                if (block_idx == *target_block_idx) {
                    linked_gates.insert(linked_gate_idx);
                }
            }
        }
    }

    return linked_gates;
}

/**
 * @brief Validate the `KZG:W_receive` stage from the masking-challenge anchor.
 *
 * The supplied `masking_challenge_gate_idx` is treated as an anchor inside
 * `MASKING_CHALLENGE_ARITHMETIC`, not as a function start. The function first finds the masking
 * arithmetic range, derives the preceding `KZG:W_receive` arithmetic range, validates both hashes,
 * then follows receive witnesses into the NNF block. The NNF validation requires a contiguous
 * `TRANSCRIPT_RECEIVE_KZG_W_NNF -> BATCH_MUL_NNF` sequence containing at least one linked NNF gate.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated KZG circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param masking_challenge_gate_idx Anchor gate inside the masking-challenge arithmetic range.
 * @return Starts of the validated arithmetic and NNF ranges, with `is_valid` set on success.
 */
template <typename FF, typename CircuitBuilder>
TranscriptReceiveValidationResult validate_transcript_receive(CircuitBuilder& builder,
                                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                              size_t masking_challenge_gate_idx)
{
    TranscriptReceiveValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    auto masking_challenge_start = find_fingerprint_range_containing_gate(
        builder, arith, masking_challenge_gate_idx, MASKING_CHALLENGE_ARITHMETIC);
    if (!masking_challenge_start.has_value() ||
        *masking_challenge_start < TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count) {
        return result;
    }

    result.arithmetic_gate_start_idx = *masking_challenge_start - TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    if (!matches_fingerprint_at(
            builder, arith, result.arithmetic_gate_start_idx, TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC)) {
        return result;
    }
    if (!matches_fingerprint_at(builder, arith, *masking_challenge_start, MASKING_CHALLENGE_ARITHMETIC)) {
        return result;
    }

    if (TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count > nnf.size()) {
        return result;
    }

    const size_t arithmetic_end = *masking_challenge_start;
    std::set<size_t> linked_nnf_gates =
        collect_linked_gates(builder, analyzer, arith, result.arithmetic_gate_start_idx, arithmetic_end, nnf);

    if (linked_nnf_gates.empty()) {
        info("KZG transcript receive validation failed: no KZG:W_receive arithmetic witness links to NNF");
        return result;
    }

    const size_t receive_and_batch_mul_nnf_gate_count =
        TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count + BATCH_MUL_NNF.gate_count;
    if (receive_and_batch_mul_nnf_gate_count > nnf.size()) {
        return result;
    }

    for (size_t nnf_start = 0; nnf_start + receive_and_batch_mul_nnf_gate_count <= nnf.size(); ++nnf_start) {
        if (!matches_fingerprint_at(builder, nnf, nnf_start, TRANSCRIPT_RECEIVE_KZG_W_NNF)) {
            continue;
        }

        const size_t batch_mul_nnf_start = nnf_start + TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;
        if (!matches_fingerprint_at(builder, nnf, batch_mul_nnf_start, BATCH_MUL_NNF)) {
            continue;
        }

        const size_t batch_mul_nnf_end = batch_mul_nnf_start + BATCH_MUL_NNF.gate_count;
        for (size_t linked_nnf_gate : linked_nnf_gates) {
            if (nnf_start <= linked_nnf_gate && linked_nnf_gate < batch_mul_nnf_end) {
                result.nnf_gate_start_idx = nnf_start;
                result.is_valid = true;
                return result;
            }
        }
    }

    info("KZG transcript receive validation failed: no linked NNF gate belongs to a KZG:W_receive -> KZG:batch_mul "
         "NNF sequence");
    return result;
}

/**
 * @brief Validate the `KZG:masking_challenge` stage using a validated transcript receive result.
 *
 * The arithmetic masking range is derived from `transcript_receive`, and the supplied
 * `masking_challenge_gate_idx` must lie inside that range. After validating the arithmetic hash, the
 * function follows witness links to a Poseidon2 external range and then to a Poseidon2 internal
 * range, validating each range by fingerprint.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated KZG circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param masking_challenge_gate_idx Anchor gate inside the masking-challenge arithmetic range.
 * @param transcript_receive Previously validated `KZG:W_receive` result for the same chain.
 * @return Starts of the validated arithmetic, Poseidon2 external, and Poseidon2 internal ranges.
 */
template <typename FF, typename CircuitBuilder>
MaskingChallengeValidationResult validate_masking_challenge_generation(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    size_t masking_challenge_gate_idx,
    const TranscriptReceiveValidationResult& transcript_receive)
{
    MaskingChallengeValidationResult result;
    if (!transcript_receive.is_valid || transcript_receive.arithmetic_gate_start_idx == SIZE_MAX) {
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    const size_t masking_challenge_start =
        transcript_receive.arithmetic_gate_start_idx + TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    if (masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count > arith.size()) {
        return result;
    }
    if (masking_challenge_gate_idx < masking_challenge_start ||
        masking_challenge_gate_idx >= masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count) {
        return result;
    }
    if (!matches_fingerprint_at(builder, arith, masking_challenge_start, MASKING_CHALLENGE_ARITHMETIC)) {
        return result;
    }
    result.arithmetic_gate_start_idx = masking_challenge_start;

    const size_t masking_challenge_end = masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count;
    const std::set<size_t> linked_external_gates = collect_linked_gates(
        builder, analyzer, arith, masking_challenge_start, masking_challenge_end, poseidon2_external);
    auto external_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_external, linked_external_gates, MASKING_CHALLENGE_POSEIDON2_EXT);
    if (!external_start.has_value()) {
        info(
            "KZG masking challenge validation failed: no arithmetic witness links to a valid poseidon2_external range");
        return result;
    }

    const size_t external_end = *external_start + MASKING_CHALLENGE_POSEIDON2_EXT.gate_count;
    const std::set<size_t> linked_internal_gates =
        collect_linked_gates(builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
    auto internal_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_internal, linked_internal_gates, MASKING_CHALLENGE_POSEIDON2_INT);
    if (!internal_start.has_value()) {
        info("KZG masking challenge validation failed: no poseidon2_external witness links to a valid "
             "poseidon2_internal range");
        return result;
    }

    result.poseidon2_external_gate_start_idx = *external_start;
    result.poseidon2_internal_gate_start_idx = *internal_start;
    result.is_valid = true;
    return result;
}

/**
 * @brief Validate the `KZG:batch_mul` stage using prior KZG stage validation results.
 *
 * The arithmetic batch_mul range is derived from the masking-challenge arithmetic range. The NNF
 * batch_mul range is derived from the transcript receive NNF range. The memory range is discovered
 * by following witnesses from the arithmetic batch_mul range into the memory block and treating
 * those linked memory gates as anchors for `BATCH_MUL_MEMORY`.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated KZG circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param masking_challenge_gate_idx Anchor gate tying the prior validation results to one KZG chain.
 * @param transcript_receive Previously validated `KZG:W_receive` result.
 * @param masking_challenge Previously validated `KZG:masking_challenge` result.
 * @return Starts of the validated arithmetic, NNF, and memory ranges.
 */
template <typename FF, typename CircuitBuilder>
BatchMulValidationResult validate_batch_mul(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            size_t masking_challenge_gate_idx,
                                            const TranscriptReceiveValidationResult& transcript_receive,
                                            const MaskingChallengeValidationResult& masking_challenge)
{
    BatchMulValidationResult result;
    if (!transcript_receive.is_valid || !masking_challenge.is_valid ||
        transcript_receive.arithmetic_gate_start_idx == SIZE_MAX || transcript_receive.nnf_gate_start_idx == SIZE_MAX ||
        masking_challenge.arithmetic_gate_start_idx == SIZE_MAX) {
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& memory = builder.blocks.memory;

    const size_t masking_challenge_start =
        transcript_receive.arithmetic_gate_start_idx + TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    if (masking_challenge.arithmetic_gate_start_idx != masking_challenge_start) {
        return result;
    }
    if (masking_challenge_gate_idx < masking_challenge_start ||
        masking_challenge_gate_idx >= masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count) {
        return result;
    }

    result.arithmetic_gate_start_idx = masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count;
    if (!matches_fingerprint_at(builder, arith, result.arithmetic_gate_start_idx, BATCH_MUL_ARITHMETIC)) {
        return result;
    }

    result.nnf_gate_start_idx = transcript_receive.nnf_gate_start_idx + TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;
    if (!matches_fingerprint_at(builder, nnf, result.nnf_gate_start_idx, BATCH_MUL_NNF)) {
        return result;
    }

    const size_t batch_mul_arithmetic_end = result.arithmetic_gate_start_idx + BATCH_MUL_ARITHMETIC.gate_count;
    const std::set<size_t> linked_memory_gates = collect_linked_gates(
        builder, analyzer, arith, result.arithmetic_gate_start_idx, batch_mul_arithmetic_end, memory);
    auto memory_start =
        find_fingerprint_range_containing_any_gate(builder, memory, linked_memory_gates, BATCH_MUL_MEMORY);
    if (!memory_start.has_value()) {
        info("KZG batch_mul validation failed: no arithmetic witness links to a valid memory range");
        return result;
    }

    result.memory_gate_start_idx = *memory_start;
    result.is_valid = true;
    return result;
}

/**
 * @brief Validate the KZG verifier subchain generated in the recursive circuit.
 *
 * The top-level validator finds the masking challenge squeeze gate and uses it as the common anchor
 * for all KZG subvalidators. Each stage performs its own fingerprint, adjacency, and witness-link
 * checks, so this function only composes the stage validators in circuit-generation order:
 * `KZG:W_receive`, `KZG:masking_challenge`, then `KZG:batch_mul`.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated recursive verifier circuit.
 * @param all_squeezes All transcript squeeze gates discovered in the builder.
 * @param consumed Squeeze gates consumed before the KZG stage.
 * @return `true` when all KZG subvalidators accept the same anchored chain.
 */
template <typename CircuitBuilder>
bool validate_kzg(CircuitBuilder& builder, const std::vector<size_t>& all_squeezes, const std::set<size_t>& consumed)
{
    auto masking_challenge = recursion_helpers::kzg_masking_challenge(builder, all_squeezes, consumed);
    if (!masking_challenge.valid) {
        return false;
    }

    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    auto transcript_receive = validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    if (!transcript_receive.is_valid) {
        return false;
    }

    auto masking_challenge_generation =
        validate_masking_challenge_generation(builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    if (!masking_challenge_generation.is_valid) {
        return false;
    }

    auto batch_mul = validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);
    if (!batch_mul.is_valid) {
        return false;
    }

    info("KZG validator found chain: KZG:W_receive starts at ",
         transcript_receive.arithmetic_gate_start_idx,
         ", KZG:masking_challenge starts at ",
         masking_challenge_generation.arithmetic_gate_start_idx,
         ", KZG:batch_mul starts at ",
         batch_mul.arithmetic_gate_start_idx);
    return true;
}

} // namespace KZGVerification

namespace ShpleminiVerification {

/**
 * @brief Result of validating a single Shplemini challenge generation stage.
 *
 * Stores the arithmetic, Poseidon2 external, and Poseidon2 internal block starts for the
 * validated challenge. Each field is SIZE_MAX when the corresponding block was not found.
 */
struct ChallengeGenerationValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validate a single Shplemini challenge generation stage (arithmetic + Poseidon2 chain).
 *
 * Generic validator reused for rho, Gemini:r, Shplonk:nu, and Shplonk:z challenges.
 * Each challenge follows the same pattern: an arithmetic block anchored at the squeeze gate,
 * followed by a Poseidon2 external block and a Poseidon2 internal block discovered via witness links.
 *
 * Algorithm:
 *   1. Find the arithmetic block range containing `challenge_gate_idx` that matches `arith_fp`.
 *   2. Collect witness links from that arithmetic range into the poseidon2_external block.
 *   3. Find the poseidon2_external range matching `poseidon2_ext_fp` at or after any linked gate.
 *   4. Collect witness links from the poseidon2_external range into the poseidon2_internal block.
 *   5. Find the poseidon2_internal range matching `poseidon2_int_fp` at or after any linked gate.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param challenge_gate_idx Arithmetic block gate index of the squeeze gate for this challenge.
 * @param arith_fp Expected fingerprint for the arithmetic block of this challenge.
 * @param poseidon2_ext_fp Expected fingerprint for the Poseidon2 external block.
 * @param poseidon2_int_fp Expected fingerprint for the Poseidon2 internal block.
 * @return Validated block start indices, with `is_valid` set on success.
 */
template <typename FF, typename CircuitBuilder>
ChallengeGenerationValidationResult validate_challenges_generation(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    size_t challenge_gate_idx,
    const recursion_helpers::FunctionFingerprint& arith_fp,
    const recursion_helpers::FunctionFingerprint& poseidon2_ext_fp,
    const recursion_helpers::FunctionFingerprint& poseidon2_int_fp)
{
    ChallengeGenerationValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    auto arith_start =
        KZGVerification::find_fingerprint_range_containing_gate(builder, arith, challenge_gate_idx, arith_fp);
    if (!arith_start.has_value()) {
        info("Shplemini challenge validation failed: no arithmetic range matching fingerprint contains squeeze gate ",
             challenge_gate_idx);
        return result;
    }
    result.arithmetic_gate_start_idx = *arith_start;

    const size_t arith_end = *arith_start + arith_fp.gate_count;
    const std::set<size_t> linked_external_gates =
        KZGVerification::collect_linked_gates(builder, analyzer, arith, *arith_start, arith_end, poseidon2_external);
    auto external_start = KZGVerification::find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_external, linked_external_gates, poseidon2_ext_fp);
    if (!external_start.has_value()) {
        info("Shplemini challenge validation failed: no arithmetic witness links to a valid poseidon2_external range");
        return result;
    }
    result.poseidon2_external_gate_start_idx = *external_start;

    const size_t external_end = *external_start + poseidon2_ext_fp.gate_count;
    const std::set<size_t> linked_internal_gates = KZGVerification::collect_linked_gates(
        builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
    auto internal_start = KZGVerification::find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_internal, linked_internal_gates, poseidon2_int_fp);
    if (!internal_start.has_value()) {
        info("Shplemini challenge validation failed: no poseidon2_external witness links to a valid "
             "poseidon2_internal range");
        return result;
    }
    result.poseidon2_internal_gate_start_idx = *internal_start;

    result.is_valid = true;
    return result;
}

/**
 * @brief Result of validating the `Shplemini:Gemini_fold_commitments` stage.
 *
 * Stores the arithmetic and NNF block starts for the validated stage.
 */
struct GeminiFoldCommitmentsValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validate the `Shplemini:Gemini_fold_commitments` stage.
 *
 * Uses the rho challenge squeeze gate as the sole arithmetic block anchor.
 * The Gemini_fold_commitments arithmetic range starts immediately after the rho arithmetic range.
 *
 * Algorithm:
 *   1. Find the rho arithmetic range containing `rho_challenge_gate_idx`.
 *   2. Derive `gemini_fold_arith_start = rho_arith_start + RHO_ARITHMETIC.gate_count`.
 *   3. Validate the fingerprint at that derived start.
 *   4. Collect witness links from the fold arithmetic range into the NNF block.
 *   5. Find the NNF range matching `GEMINI_FOLD_COMMITMENTS_NNF` containing any linked gate.
 *      The full hash is unique among NNF fingerprints so no contiguity check is needed.
 *   6. Check that `gemini_fold_arith_start < gemini_r_challenge_gate_idx` (fold range
 *      precedes the Gemini:r squeeze gate in the arithmetic block).
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param rho_challenge_gate_idx Arithmetic block squeeze-gate index for the rho challenge.
 * @param gemini_r_challenge_gate_idx Arithmetic block squeeze-gate index for the Gemini:r challenge.
 * @return Validated arithmetic and NNF block start indices, with `is_valid` set on success.
 */
template <typename FF, typename CircuitBuilder>
GeminiFoldCommitmentsValidationResult validate_gemini_fold_commitments(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    size_t rho_challenge_gate_idx,
    size_t gemini_r_challenge_gate_idx)
{
    GeminiFoldCommitmentsValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    // Steps 1-2: find rho arithmetic range; derive gemini_fold start immediately after it.
    auto rho_arith_start =
        KZGVerification::find_fingerprint_range_containing_gate(builder, arith, rho_challenge_gate_idx, RHO_ARITHMETIC);
    if (!rho_arith_start.has_value()) {
        info("Gemini fold commitments validation failed: no rho arithmetic range contains squeeze gate ",
             rho_challenge_gate_idx);
        return result;
    }
    const size_t gemini_fold_arith_start = *rho_arith_start + RHO_ARITHMETIC.gate_count;

    // Step 3: validate fingerprint at derived start.
    if (!KZGVerification::matches_fingerprint_at(
            builder, arith, gemini_fold_arith_start, GEMINI_FOLD_COMMITMENTS_ARITHMETIC)) {
        info("Gemini fold commitments validation failed: fingerprint mismatch at derived start ",
             gemini_fold_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = gemini_fold_arith_start;
    const size_t gemini_fold_arith_end = gemini_fold_arith_start + GEMINI_FOLD_COMMITMENTS_ARITHMETIC.gate_count;

    // Steps 4-5: follow witness links from fold arithmetic range into NNF block.
    const std::set<size_t> linked_nnf_gates = KZGVerification::collect_linked_gates(
        builder, analyzer, arith, gemini_fold_arith_start, gemini_fold_arith_end, nnf);
    if (linked_nnf_gates.empty()) {
        info("Gemini fold commitments validation failed: no witness links from fold arithmetic range to NNF block");
        return result;
    }
    auto nnf_start = KZGVerification::find_fingerprint_range_containing_any_gate(
        builder, nnf, linked_nnf_gates, GEMINI_FOLD_COMMITMENTS_NNF);
    if (!nnf_start.has_value()) {
        info("Gemini fold commitments validation failed: no NNF range matching fingerprint contains a linked gate");
        return result;
    }
    result.nnf_gate_start_idx = *nnf_start;

    // Step 6: fold arithmetic start must precede the Gemini:r squeeze gate.
    if (gemini_fold_arith_start >= gemini_r_challenge_gate_idx) {
        info("Gemini fold commitments validation failed: fold arithmetic start ",
             gemini_fold_arith_start,
             " not before Gemini:r squeeze gate ",
             gemini_r_challenge_gate_idx);
        return result;
    }

    result.is_valid = true;
    return result;
}

/**
 * @brief Result of validating the `compute_shplonk_batching_challenge_powers` stage.
 */
struct ShplonkBatchingChallengePowersValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Result of validating the `Shplonk:Q` commitment receive stage.
 */
struct ShplonkQValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validate the `compute_shplonk_batching_challenge_powers` stage.
 *
 * Derives the arithmetic start immediately after the nu arithmetic range and validates
 * the fingerprint. No cross-block links: this stage is purely arithmetic.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param nu_arith_start Validated arithmetic start of the preceding Shplonk:nu stage.
 * @return Validated arithmetic start, with `is_valid` set on success.
 */
template <typename CircuitBuilder>
ShplonkBatchingChallengePowersValidationResult validate_shplonk_batching_challenge_powers(
    CircuitBuilder& builder, size_t nu_arith_start)
{
    ShplonkBatchingChallengePowersValidationResult result;
    auto& arith = builder.blocks.arithmetic;

    const size_t powers_arith_start = nu_arith_start + SHPLONK_NU_ARITHMETIC.gate_count;
    if (!KZGVerification::matches_fingerprint_at(
            builder, arith, powers_arith_start, SHPLONK_BATCHING_CHALLENGE_POWERS_ARITHMETIC)) {
        info("Shplonk batching challenge powers validation failed: fingerprint mismatch at derived start ",
             powers_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = powers_arith_start;
    result.is_valid = true;
    return result;
}

/**
 * @brief Validate the `Shplonk:Q` commitment receive stage.
 *
 * Derives the arithmetic start immediately after the powers arithmetic range, validates the
 * fingerprint, then follows witness links from the arithmetic range into the NNF block.
 *
 * NNF collision note: `SHPLONK_Q_NNF` and `TRANSCRIPT_RECEIVE_KZG_W_NNF` share the same
 * fingerprint (62 gates, full hash `0x6f7911bba1f0ffe7`). Witness links from the Q arithmetic
 * range naturally discriminate — they point to Q NNF gates, not KZG W_receive NNF gates.
 *
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @param powers_arith_start Validated arithmetic start of the preceding powers stage.
 * @return Validated arithmetic and NNF block start indices, with `is_valid` set on success.
 */
template <typename FF, typename CircuitBuilder>
ShplonkQValidationResult validate_shplonk_q(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            size_t powers_arith_start)
{
    ShplonkQValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    const size_t q_arith_start = powers_arith_start + SHPLONK_BATCHING_CHALLENGE_POWERS_ARITHMETIC.gate_count;
    if (!KZGVerification::matches_fingerprint_at(builder, arith, q_arith_start, SHPLONK_Q_ARITHMETIC)) {
        info("Shplonk Q validation failed: fingerprint mismatch at derived start ", q_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = q_arith_start;

    const size_t q_arith_end = q_arith_start + SHPLONK_Q_ARITHMETIC.gate_count;
    const std::set<size_t> linked_nnf_gates =
        KZGVerification::collect_linked_gates(builder, analyzer, arith, q_arith_start, q_arith_end, nnf);
    if (linked_nnf_gates.empty()) {
        info("Shplonk Q validation failed: no witness links from Q arithmetic range to NNF block");
        return result;
    }
    auto nnf_start =
        KZGVerification::find_fingerprint_range_containing_any_gate(builder, nnf, linked_nnf_gates, SHPLONK_Q_NNF);
    if (!nnf_start.has_value()) {
        info("Shplonk Q validation failed: no NNF range matching fingerprint contains a linked gate");
        return result;
    }
    result.nnf_gate_start_idx = *nnf_start;
    result.is_valid = true;
    return result;
}

/**
 * @brief Validate the 9 arithmetic-only Shplemini tail stages that follow Shplonk:z.
 *
 * All nine stages are purely arithmetic (no cross-block links). Each stage start is derived
 * from the previous stage end, anchored at the end of the z arithmetic range.
 *
 * Zero-gate stages (Gemini_fold_neg_evaluations, Libra_evaluations, finalize_batch_opening_claim)
 * add no arithmetic gates and are omitted from the table.
 *
 * For stages with gate_count ≤ 20 the fingerprint's prefix and full hash are identical;
 * `matches_fingerprint_at` checks both — redundant but correct, no special handling needed.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param z_arith_start Validated arithmetic start of the Shplonk:z stage.
 * @return `true` when all nine tail stages match their expected fingerprints.
 */
template <typename CircuitBuilder>
bool validate_shplonk_tail(CircuitBuilder& builder, size_t z_arith_start)
{
    auto& arith = builder.blocks.arithmetic;

    static constexpr std::array<recursion_helpers::FunctionFingerprint, 9> TAIL_STAGES = {{
        SHPLONK_INVERSE_GEMINI_DENOMINATORS_ARITHMETIC,   //  64 gates
        CLAIM_BATCHER_COMPUTE_SCALARS_ARITHMETIC,          //   6 gates
        CLAIM_BATCHER_UPDATE_BATCH_MUL_INPUTS_ARITHMETIC,  // 239 gates
        GEMINI_FOLD_POS_EVALUATIONS_ARITHMETIC,            // 208 gates
        BATCH_GEMINI_CLAIMS_ARITHMETIC,                    // 119 gates
        A0_CONSTANT_TERMS_ARITHMETIC,                      //   5 gates
        REMOVE_REPEATED_COMMITMENTS_ARITHMETIC,            //   5 gates
        ADD_ZK_DATA_ARITHMETIC,                            //  19 gates
        CHECK_LIBRA_EVALUATIONS_CONSISTENCY_ARITHMETIC,    // 1434 gates
    }};

    static constexpr std::array<const char*, 9> TAIL_STAGE_NAMES = {{
        "Shplonk_inverse_gemini_denominators",
        "ClaimBatcher_compute_scalars",
        "ClaimBatcher_update_batch_mul_inputs",
        "Gemini_fold_pos_evaluations",
        "batch_gemini_claims_received_from_prover",
        "A0_constant_terms",
        "remove_repeated_commitments",
        "add_zk_data",
        "check_libra_evaluations_consistency",
    }};

    size_t offset = z_arith_start + SHPLONK_Z_ARITHMETIC.gate_count;
    for (size_t i = 0; i < TAIL_STAGES.size(); ++i) {
        if (!KZGVerification::matches_fingerprint_at(builder, arith, offset, TAIL_STAGES[i])) {
            info("Shplemini tail validation failed at stage ",
                 TAIL_STAGE_NAMES[i],
                 " (arithmetic offset ",
                 offset,
                 ")");
            return false;
        }
        offset += TAIL_STAGES[i].gate_count;
    }
    return true;
}

/**
 * @brief Validate the 4-stage Shplonk transcript block.
 *
 * Chains four sub-validators in the order mandated by the arithmetic block layout:
 *   nu (80) → powers (36) → Q (79) → z (34)
 *
 * Stages 1 and 4 reuse `validate_challenges_generation` (arithmetic + Poseidon2 chain via
 * witness links). Stages 2 and 3 are Shplonk-specific sub-validators.
 *
 * A cross-check after stage 4 confirms that the z arithmetic range immediately follows Q,
 * proving the chain is contiguous and correctly ordered.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param all_squeezes All transcript squeeze gates discovered in the builder.
 * @param consumed Squeeze gates consumed before the Shplemini stage.
 * @return `true` when all four sub-validators accept the same anchored chain.
 */
template <typename CircuitBuilder>
bool validate_shplonk(CircuitBuilder& builder,
                      const std::vector<size_t>& all_squeezes,
                      const std::set<size_t>& consumed)
{
    // Extract the 4 shplemini squeeze gate indices: rho[0], gemini_r[1], shplonk_nu[2], shplonk_z[3].
    auto shplemini_gates =
        recursion_helpers::take_unclaimed_squeezes(all_squeezes, consumed, recursion_helpers::NUM_SHPLEMINI_SQUEEZES);
    if (shplemini_gates.size() != recursion_helpers::NUM_SHPLEMINI_SQUEEZES) {
        info("Shplonk validation failed: expected ",
             recursion_helpers::NUM_SHPLEMINI_SQUEEZES,
             " shplemini squeeze gates, found ",
             shplemini_gates.size());
        return false;
    }
    const size_t shplonk_nu_gate_idx = shplemini_gates[2];
    const size_t shplonk_z_gate_idx = shplemini_gates[3];

    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);

    // Stage 1: Shplonk:nu challenge generation (arithmetic + poseidon2 chain).
    auto nu = validate_challenges_generation<bb::fr>(builder,
                                                     analyzer,
                                                     shplonk_nu_gate_idx,
                                                     SHPLONK_NU_ARITHMETIC,
                                                     SHPLONK_NU_POSEIDON2_EXT,
                                                     SHPLONK_NU_POSEIDON2_INT);
    if (!nu.is_valid) {
        return false;
    }

    // Stage 2: compute_shplonk_batching_challenge_powers (arithmetic only, derived from nu end).
    auto powers = validate_shplonk_batching_challenge_powers(builder, nu.arithmetic_gate_start_idx);
    if (!powers.is_valid) {
        return false;
    }

    // Stage 3: Shplonk:Q commitment receive (arithmetic + NNF via witness links, derived from powers end).
    auto q = validate_shplonk_q<bb::fr>(builder, analyzer, powers.arithmetic_gate_start_idx);
    if (!q.is_valid) {
        return false;
    }

    // Stage 4: Shplonk:z challenge generation (arithmetic + poseidon2 chain).
    auto z = validate_challenges_generation<bb::fr>(builder,
                                                    analyzer,
                                                    shplonk_z_gate_idx,
                                                    SHPLONK_Z_ARITHMETIC,
                                                    SHPLONK_Z_POSEIDON2_EXT,
                                                    SHPLONK_Z_POSEIDON2_INT);
    if (!z.is_valid) {
        return false;
    }

    // Cross-check: z arithmetic range must immediately follow Q arithmetic range.
    const size_t expected_z_arith_start = q.arithmetic_gate_start_idx + SHPLONK_Q_ARITHMETIC.gate_count;
    if (z.arithmetic_gate_start_idx != expected_z_arith_start) {
        info("Shplonk validation failed: z arithmetic start ",
             z.arithmetic_gate_start_idx,
             " != expected ",
             expected_z_arith_start,
             " (Q arithmetic end)");
        return false;
    }

    if (!validate_shplonk_tail(builder, z.arithmetic_gate_start_idx)) {
        return false;
    }

    info("Shplonk validator found chain: nu starts at ",
         nu.arithmetic_gate_start_idx,
         ", powers starts at ",
         powers.arithmetic_gate_start_idx,
         ", Q starts at ",
         q.arithmetic_gate_start_idx,
         ", z starts at ",
         z.arithmetic_gate_start_idx);
    return true;
}

} // namespace ShpleminiVerification
