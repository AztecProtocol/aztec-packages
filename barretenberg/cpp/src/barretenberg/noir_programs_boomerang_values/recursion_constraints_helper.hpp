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

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
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

// ============================================================================
// Post-OinkVerifier selector hash constants
// ============================================================================

// Hash of all selectors for gates created by steps 2-4 (Padding + Sumcheck + Shplemini).
// This region is deterministic — gate structure depends only on VIRTUAL_LOG_N and flavor constants,
// not on witness values or num_public_inputs.
// KZG (step 5) is excluded because it has a marginal 1-gate variation for large num_public_inputs.
// Discovered via MegaZkPostOinkHashDiscovery test.
static constexpr size_t STEPS_2_4_SELECTOR_HASH = 0x7cd4c4c02bf54814ULL;

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
// Block boundary tracking
// ============================================================================

/**
 * @brief Tracks the last gate index seen per block during validation.
 *
 * After validating a subcircuit (e.g., OinkVerifier), this struct records the exclusive
 * upper bound of gate indices touched in each block. Used to anchor the start of the
 * next subcircuit (e.g., sumcheck) without needing a BlockSnapshot.
 *
 * Values are exclusive: the next subcircuit's gates start at these indices.
 */
struct BlockBoundary {
    size_t arithmetic = 0;
    size_t nnf = 0;
    size_t poseidon2_ext = 0;
    size_t poseidon2_int = 0;

    bool valid = false; // true if successfully computed
};

/**
 * @brief Compute block boundaries by scanning all gates reachable from a set of ACIR witnesses.
 *
 * For each witness, finds all gates via get_variable_gates(), and records the max gate index + 1
 * per block. This gives the exclusive upper bound of gates that these witnesses participate in.
 */
template <typename FF, typename CircuitBuilder>
BlockBoundary compute_block_boundary(CircuitBuilder& builder,
                                     cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                     const std::vector<uint32_t>& acir_witness_indices)
{
    BlockBoundary boundary;
    auto blocks = builder.blocks.get();
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = builder.blocks.poseidon2_external;
    auto& p2int = builder.blocks.poseidon2_internal;

    for (uint32_t idx : acir_witness_indices) {
        uint32_t real = builder.real_variable_index[idx];
        for (const auto& [blk_idx, gate_idx] : analyzer.get_variable_gates(real)) {
            auto* blk = &blocks[blk_idx];
            size_t exclusive = gate_idx + 1;
            if (blk == &arith) {
                boundary.arithmetic = std::max(boundary.arithmetic, exclusive);
            } else if (blk == &nnf) {
                boundary.nnf = std::max(boundary.nnf, exclusive);
            } else if (blk == &p2ext) {
                boundary.poseidon2_ext = std::max(boundary.poseidon2_ext, exclusive);
            } else if (blk == &p2int) {
                boundary.poseidon2_int = std::max(boundary.poseidon2_int, exclusive);
            }
        }
    }
    boundary.valid = true;
    return boundary;
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
 * Validates commitment deserialization and transcript absorption for
 * the 3 received commitments. The eta challenge and power computation
 * are internal intermediate variables.
 */
template <typename FF, typename CircuitBuilder>
bool validate_sorted_list_accumulator_round(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            const std::vector<uint32_t>& proof_body_witnesses)
{
    return validate_commitment_groups<FF>(
        builder, analyzer, proof_body_witnesses, SORTED_LIST_GROUPS, std::size(SORTED_LIST_GROUPS));
}

/**
 * @brief Validate log_derivative_inverse_round of OinkVerifier.
 *
 * This round:
 *   1. Squeezes beta and gamma challenges from transcript (Poseidon2 gates)
 *   2. Computes beta powers
 *   3. Receives lookup_inverses commitment (group 5, core)
 *
 * DataBus inverses (groups 15, 18, 21) are Goblin-related and validated separately.
 */
template <typename FF, typename CircuitBuilder>
bool validate_log_derivative_inverse_round(CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                           const std::vector<uint32_t>& proof_body_witnesses)
{
    return validate_commitment_groups<FF>(
        builder, analyzer, proof_body_witnesses, LOG_DERIV_CORE_GROUPS, std::size(LOG_DERIV_CORE_GROUPS));
}

/**
 * @brief Validate grand_product_computation_round of OinkVerifier.
 *
 * This round:
 *   1. Computes public_input_delta from beta, gamma, and public inputs
 *   2. Receives z_perm commitment (group 4, core)
 *
 * The public_input_delta computation uses previously squeezed challenges
 * and is an internal intermediate variable.
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
 * @brief Validate OinkVerifier subcircuit and return block boundaries.
 *
 * @return BlockBoundary with valid=true on success, valid=false on validation failure.
 *         On success, boundary fields contain the exclusive upper bound of gate indices
 *         touched by oink witnesses in each block — usable as start anchors for step2/sumcheck.
 */
template <typename FF, typename CircuitBuilder>
BlockBoundary validate_oink_subcircuit(CircuitBuilder& builder,
                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                       const acir_format::RecursionConstraint& constraint,
                                       const std::vector<uint32_t>& proof_body_witnesses)
{
    if (proof_body_witnesses.size() < OINK_PROOF_COMMITMENT_WITNESSES) {
        return {};
    }

    // Round 1: Preamble
    if (!validate_oink_preamble<FF>(builder, analyzer, constraint)) {
        return {};
    }

    // Round 2: Wire commitments (core)
    if (!validate_wire_commitments_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return {};
    }

    // Round 3: Sorted list accumulator
    if (!validate_sorted_list_accumulator_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return {};
    }

    // Round 4: Log derivative inverse
    if (!validate_log_derivative_inverse_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return {};
    }

    // Round 5: Grand product computation
    if (!validate_grand_product_computation_round<FF>(builder, analyzer, proof_body_witnesses)) {
        return {};
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
            return {};
        }
    }

    // Compute block boundaries from all oink ACIR witnesses (key, key_hash, proof body, public inputs)
    std::vector<uint32_t> all_oink_witnesses;
    all_oink_witnesses.reserve(constraint.key.size() + 1 + proof_body_witnesses.size());
    all_oink_witnesses.push_back(constraint.key_hash);
    all_oink_witnesses.insert(all_oink_witnesses.end(), constraint.key.begin(), constraint.key.end());
    all_oink_witnesses.insert(
        all_oink_witnesses.end(), proof_body_witnesses.begin(), proof_body_witnesses.end());

    return compute_block_boundary<FF>(builder, analyzer, all_oink_witnesses);
}

template <typename FF, typename CircuitBuilder>
bool validate_compute_padding_array_step(CircuitBuilder& builder,
                                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                         const acir_format::RecursionConstraint& constraint)
{
    uint32_t log_circuit_size_idx = analyzer.to_real(constraint.key[0]);
    auto& ab = builder.blocks.arithmetic;
    bool found = false;
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
            return false;
        }
        // Find start of compute_padding_array part of recursive verification. It always creates 58 sequential
        // arithmetic gates. Hash and compare with precomputed value.
        std::size_t selectors_hash = sha256_helpers::compute_selector_hash(
            0, ab, gate_idx, gate_idx + COMPUTE_PADDING_INDICATOR_ARRAY_NUM_GATES - 1);
        if (selectors_hash != COMPUTE_PADDING_INDICATOR_ARRAY_SELECTORS_HASH) {
            return false;
        }
        found = true;
        break; // First-gate pattern is unique; one match is sufficient
    }
    return found;
}

} // namespace recursion_helpers
