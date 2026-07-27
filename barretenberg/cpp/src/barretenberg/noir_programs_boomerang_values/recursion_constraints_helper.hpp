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
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/execution_trace/generated/ultra_execution_trace_generated.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"

namespace recursion_helpers {

// VK metadata field layout at the front of `constraint.key`
// (NativeVerificationKey_ / MetaData serialization order).
static constexpr size_t VK_LOG_CIRCUIT_SIZE_INDEX = 0;
static constexpr size_t VK_NUM_PUBLIC_INPUTS_INDEX = 1;
static constexpr size_t VK_PUB_INPUTS_OFFSET_INDEX = 2;
static constexpr size_t VK_METADATA_NUM_FIELDS = bb::MetaData::NUM_FIELDS;
static_assert(VK_METADATA_NUM_FIELDS == VK_PUB_INPUTS_OFFSET_INDEX + 1);

// UltraCircuitBuilder execution-trace block indices
// (order matches UltraTraceBlockData::get() / get_labels()).
static constexpr size_t ULTRA_BLOCK_PUB_INPUTS = 0;
static constexpr size_t ULTRA_BLOCK_LOOKUP = 1;
static constexpr size_t ULTRA_BLOCK_ARITHMETIC = 2;
static constexpr size_t ULTRA_BLOCK_DELTA_RANGE = 3;
static constexpr size_t ULTRA_BLOCK_ELLIPTIC = 4;
static constexpr size_t ULTRA_BLOCK_MEMORY = 5;
static constexpr size_t ULTRA_BLOCK_NNF = 6;
static constexpr size_t ULTRA_BLOCK_POSEIDON2_EXT = 7;
static constexpr size_t ULTRA_BLOCK_POSEIDON2_INT = 8;
static constexpr size_t ULTRA_BLOCK_COUNT = 9;
static_assert(ULTRA_BLOCK_COUNT == bb::UltraTraceBlockData::NUM_BLOCKS);

// compute_public_input_delta emits 6*m + 2 arithmetic gates for m public inputs.
static constexpr size_t PUBLIC_INPUT_DELTA_GATES_PER_INPUT = 6;
static constexpr size_t PUBLIC_INPUT_DELTA_FIXED_GATES = 2;
static constexpr size_t public_input_delta_gate_count(const size_t num_public_inputs)
{
    return PUBLIC_INPUT_DELTA_GATES_PER_INPUT * num_public_inputs + PUBLIC_INPUT_DELTA_FIXED_GATES;
}

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

template <typename CircuitBuilder> bool is_fix_witness_gate(CircuitBuilder& builder, size_t index)
{
    auto& arith = builder.blocks.arithmetic;
    return (arith.gate_selector_for(bb::GateKind::Arith)[index] == bb::fr::one()) && (arith.q_m()[index].is_zero()) &&
           (arith.q_1()[index] == bb::fr::one()) && arith.q_2()[index].is_zero() && arith.q_3()[index].is_zero() &&
           arith.q_4()[index].is_zero() && !arith.q_c()[index].is_zero();
}

// Compute selector hash over an arithmetic block range, skipping fix_witness gates for
// constants (those produce spurious entries that vary with witness layout).
template <typename CircuitBuilder>
size_t calculate_hash_arithmetic_block(CircuitBuilder& builder,
                                       size_t start,
                                       size_t finish,
                                       [[maybe_unused]] size_t expected_hash = std::numeric_limits<size_t>::max())
{
    auto& arith = builder.blocks.arithmetic;
    size_t hash = 0;
    for (size_t index = start; index < finish; ++index) {
        if (is_fix_witness_gate(builder, index)) {
            const bb::fr fixed_value = -arith.q_c()[index];
            auto it = builder.constant_variable_indices.find(fixed_value);
            if (it != builder.constant_variable_indices.end()) {
                const uint32_t real_wl = builder.real_variable_index[arith.w_l()[index]];
                if (builder.real_variable_index[it->second] == real_wl) {
                    continue;
                }
            }
        }
        sha256_helpers::update_selector_hash(hash, arith, index);
        if (expected_hash != std::numeric_limits<size_t>::max() && hash == expected_hash && index != finish - 1) {
            info("Hash has become correct, but cycle continues");
            info("last index == ", index);
            info("finish == ", finish);
        }
    }
    return hash;
}

// Compute an arithmetic selector fingerprint independent of constant-cache state.
// Unlike calculate_hash_arithmetic_block(), this skips every syntactic fix-witness
// gate, including gates whose constant variable was already cached and therefore
// cannot be identified through constant_variable_indices.
template <typename CircuitBuilder>
std::pair<size_t, size_t> calculate_normalized_hash_arithmetic_block(CircuitBuilder& builder,
                                                                     size_t start,
                                                                     size_t finish)
{
    auto& arith = builder.blocks.arithmetic;
    size_t gate_count = 0;
    size_t hash = 0;
    for (size_t index = start; index < finish; ++index) {
        if (is_fix_witness_gate(builder, index)) {
            continue;
        }
        ++gate_count;
        sha256_helpers::update_selector_hash(hash, arith, index);
    }
    return { gate_count, hash };
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
        bool correct_selectors = !arith.q_m()[g].is_zero() &&
                                 arith.gate_selector_for(bb::GateKind::Arith)[g] == FF::one() &&
                                 arith.q_3()[g] == FF::neg_one();
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
        bool correct_selectors = !arith.q_m()[g].is_zero() &&
                                 arith.gate_selector_for(bb::GateKind::Arith)[g] == FF::one() &&
                                 arith.q_3()[g] == FF::neg_one();
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
        return arith.q_m()[g] == FF::one() && arith.gate_selector_for(bb::GateKind::Arith)[g] == FF::one() &&
               arith.q_3()[g] == FF::neg_one() && arith.q_1()[g].is_zero() && arith.q_2()[g].is_zero() &&
               arith.q_4()[g].is_zero() && arith.q_c()[g].is_zero();
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
    auto& pos2_ext = poseidon2_helpers::poseidon2_external_block(builder);
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
 *   1. Value: key[VK_NUM_PUBLIC_INPUTS_INDEX] witness value matches the expected num_public_inputs.
 *   2. Copy constraint: that witness's real index appears on at least one arithmetic gate.
 *      assert_equal merges equivalence classes so it inherits gate
 *      participation from the expected constant — a variable with no gate
 *      participation would be unconstrained.
 */
template <typename FF, typename CircuitBuilder>
bool validate_num_pub_assertion(CircuitBuilder& builder,
                                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                const acir_format::RecursionConstraint* constraint)
{
    if (constraint->key.size() <= VK_NUM_PUBLIC_INPUTS_INDEX) {
        return false;
    }
    uint32_t num_pub_idx = constraint->key[VK_NUM_PUBLIC_INPUTS_INDEX];
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
    return arith.gate_selector_for(bb::GateKind::Arith)[gi] == FF(1) && arith.q_1()[gi] == FF(1) &&
           arith.q_2()[gi] == neg_one && arith.q_3()[gi] == neg_shift_68 && arith.q_4()[gi] == FF(1);
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
    return arith.gate_selector_for(bb::GateKind::Arith)[gi] == FF(1) && arith.q_1()[gi] == FF(1) &&
           arith.q_2()[gi] == shift_136 && arith.q_3()[gi] == neg_one;
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
    return arith.gate_selector_for(bb::GateKind::Arith)[gi] == FF(2) && arith.q_1()[gi] == FF(1) &&
           arith.q_2()[gi] == FF(1) && arith.q_3()[gi] == FF(1) && arith.q_4()[gi] == neg_one &&
           arith.q_m()[gi].is_zero();
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
    return arith.gate_selector_for(bb::GateKind::Arith)[gi] == FF(1) && arith.q_1()[gi] == FF(1) &&
           arith.q_2()[gi] == FF(1) && arith.q_3()[gi] == neg_one && arith.q_m()[gi].is_zero();
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
            if (!is_transcript_add_gate<FF>(arith, gi)) {
                continue;
            }
            const uint32_t wl_real = builder.real_variable_index[arith.w_l()[gi]];
            const uint32_t wr_real = builder.real_variable_index[arith.w_r()[gi]];
            if (wl_real != fr_real && wr_real != fr_real) {
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
        if (arith.gate_selector_for(bb::GateKind::Arith)[g] == NativeFF::one() && arith.q_1()[g] == NativeFF::one() &&
            arith.q_2()[g] == two_127 && arith.q_3()[g] == -NativeFF::one() && arith.q_4()[g] == NativeFF::one() &&
            arith.q_m()[g].is_zero()) {
            gates.push_back(g);
        }
    }
    return gates;
}

// Expected squeeze-gate counts per phase in MegaZK full recursive verification (steps 0..4).
static constexpr size_t NUM_OINK_SQUEEZES = 3;  // eta, beta/gamma pair, alpha
static constexpr size_t NUM_STEP2_SQUEEZES = 1; // gate_challenge[0]
static constexpr size_t NUM_SUMCHECK_ROUNDS = 16;
static constexpr size_t NUM_SUMCHECK_SQUEEZES = NUM_SUMCHECK_ROUNDS + 1; // u_0..u_15 + ZK correction
static constexpr size_t NUM_SHPLEMINI_SQUEEZES = 4;                      // rho, Gemini:r, Shplonk:nu, Shplonk:z
static constexpr size_t NUM_KZG_SQUEEZES = 1;                            // KZG:masking_challenge
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
    // gates[0] = Libra:Challenge (ZK correction handler squeezes first, before any round)
    // gates[1..16] = u_0..u_15 (one per sumcheck round)
    out.zk_correction = to_real(arith.w_l()[gates[0]]);
    for (size_t i = 0; i < 16; i++) {
        out.u[i] = to_real(arith.w_l()[gates[i + 1]]);
    }
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
                                              const std::vector<uint32_t>& public_input_reals,
                                              const size_t search_start = 0,
                                              const size_t search_end = SIZE_MAX)
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
    const size_t end = std::min(search_end, arith.size());
    for (size_t g = search_start; g < end; g++) {
        if (arith.q_m()[g] != FF::one() || arith.gate_selector_for(bb::GateKind::Arith)[g] != FF::one() ||
            arith.q_3()[g] != FF::neg_one()) {
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
 * @param pub_inputs_offset_real real_idx of pub_inputs_offset (= constraint.key[VK_PUB_INPUTS_OFFSET_INDEX])
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
 *                           Typically constraint.key[VK_LOG_CIRCUIT_SIZE_INDEX].
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
        bool correct_selectors = ab.gate_selector_for(bb::GateKind::Arith)[gate_idx] == FF::one() &&
                                 ab.q_m()[gate_idx] == FF::one() && ab.q_c()[gate_idx] == FF(2) &&
                                 ab.q_1()[gate_idx] == FF(-2) && ab.q_2()[gate_idx] == FF::neg_one() &&
                                 ab.q_3()[gate_idx] == FF::neg_one();
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

        // Validate assert_equal(suffix[0], Fr{0}) — the log_n ∈ [1,N] range constraint.
        // Window layout: 14 prefix [0..13] + 15 suffix [14..28] + 14 Lagrange [29..42] + 15 adds [43..57].
        // assert_equal() merges real_variable_index with zero_idx — no gate is emitted.
        // Detect by comparing the union-find root of suffix[0]'s output wire to zero_idx.
        constexpr size_t SUFFIX_0_GATE_OFFSET = 28; // 14 prefix + 15 suffix − 1
        uint32_t suffix_0_real = analyzer.to_real(ab.w_o()[gate_idx + SUFFIX_0_GATE_OFFSET]);
        uint32_t zero_real = analyzer.to_real(builder.zero_idx());
        if (suffix_0_real != zero_real) {
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
            if (ab.gate_selector_for(bb::GateKind::Arith)[g] != FF::one() || ab.q_3()[g] != FF::neg_one() ||
                !ab.q_m()[g].is_zero()) {
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
 * @brief Convenience overload — takes a RecursionConstraint and uses its key[VK_LOG_CIRCUIT_SIZE_INDEX] as log_n.
 */
template <typename FF, typename CircuitBuilder>
PaddingArrayValidationResult validate_compute_padding_array_step(CircuitBuilder& builder,
                                                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                 const acir_format::RecursionConstraint& constraint)
{
    return validate_compute_padding_array_from_log_n<FF>(builder, analyzer, constraint.key[VK_LOG_CIRCUIT_SIZE_INDEX]);
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
        if (arith.gate_selector_for(bb::GateKind::Arith)[g] == FF::one() && arith.q_1()[g] == FF::one() &&
            arith.q_2()[g] == two_127 && arith.q_3()[g] == -FF::one() && arith.q_4()[g] == FF::one() &&
            arith.q_m()[g].is_zero()) {
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
        return ab.gate_selector_for(bb::GateKind::Arith)[g] == FF::one() && ab.q_m()[g] == FF::one() &&
               ab.q_3()[g] == FF::neg_one() && ab.q_1()[g].is_zero() && ab.q_2()[g].is_zero() &&
               ab.q_4()[g].is_zero() && ab.q_c()[g].is_zero();
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

static constexpr size_t SCANNER_FINGERPRINT_SIZE = 20;

struct FunctionFingerprint {
    size_t gate_count;
    size_t prefix_hash;
    size_t full_hash;
    size_t fingerprint_size;
};

/**
 * @brief Compute a FunctionFingerprint over builder.blocks.get()[block_index][start, end).
 *
 * `arithmetic_block_index` selects between two hashing strategies: on the arithmetic block,
 * hashing goes through `calculate_hash_arithmetic_block` (skips fix_witness constant-pin gates,
 * which vary with witness layout); on every other block, it's a plain selector hash over the
 * range. Callers pass their own arithmetic-block-index constant since it differs by family/
 * builder (e.g. HN's merged Mega trace vs a family with a different block order).
 *
 * Canonical home for what used to be two independent per-family copies (HN's
 * `hn_compute_fingerprint`, CHONK's `compute_fingerprint_at` in `boomerang_chonk_recursion.test.cpp`)
 * — see `shared_api_functions.md` group C.
 */
template <typename CircuitBuilder>
FunctionFingerprint compute_fingerprint_at(
    CircuitBuilder& builder, size_t block_index, size_t start, size_t end, size_t arithmetic_block_index)
{
    const size_t gate_count = end - start;
    const size_t fingerprint_size = std::min(SCANNER_FINGERPRINT_SIZE, gate_count);
    auto& block = builder.blocks.get()[block_index];

    const auto compute_hash = [&](size_t range_start, size_t range_end) -> size_t {
        if (range_start >= range_end) {
            return 0;
        }
        if (block_index == arithmetic_block_index) {
            return calculate_hash_arithmetic_block(builder, range_start, range_end);
        }
        return sha256_helpers::compute_selector_hash(0, block, range_start, range_end - 1);
    };

    return FunctionFingerprint{
        .gate_count = gate_count,
        .prefix_hash = compute_hash(start, start + fingerprint_size),
        .full_hash = compute_hash(start, end),
        .fingerprint_size = fingerprint_size,
    };
}

// ============================================================================
// Shared fingerprint scanning + Poseidon challenge validation (MegaZK verifier)
// ============================================================================

/**
 * @brief Find the index of a trace block inside `builder.blocks.get()`.
 *
 * Block identity is checked by address, matching how block indices are resolved elsewhere in the
 * graph description code. The index is later used to compare StaticAnalyzer block references.
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
 */
template <typename CircuitBuilder, typename Block>
bool matches_fingerprint_at(CircuitBuilder& builder, Block& block, size_t start, const FunctionFingerprint& fp)
{
    if (start + fp.gate_count > block.size() || start + fp.fingerprint_size > block.size()) {
        return false;
    }

    auto& arith = builder.blocks.arithmetic;
    const auto block_idx = find_block_index(builder, block);
    const bool is_arithmetic_block = block_idx.has_value() && &builder.blocks.get()[*block_idx] == &arith;
    const size_t prefix_hash =
        is_arithmetic_block ? calculate_hash_arithmetic_block(builder, start, start + fp.fingerprint_size, fp.full_hash)
                            : sha256_helpers::compute_selector_hash(0, block, start, start + fp.fingerprint_size - 1);
    if (prefix_hash != fp.prefix_hash) {
        return false;
    }

    const size_t full_hash = is_arithmetic_block
                                 ? calculate_hash_arithmetic_block(builder, start, start + fp.gate_count)
                                 : sha256_helpers::compute_selector_hash(0, block, start, start + fp.gate_count - 1);
    return full_hash == fp.full_hash;
}

/**
 * @brief Find a fingerprint range that contains an anchor gate.
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_containing_gate(CircuitBuilder& builder,
                                                             Block& block,
                                                             size_t anchor_gate_idx,
                                                             const FunctionFingerprint& fp)
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
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_containing_any_gate(CircuitBuilder& builder,
                                                                 Block& block,
                                                                 const std::set<size_t>& anchor_gate_indices,
                                                                 const FunctionFingerprint& fp)
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
 */
template <typename CircuitBuilder, typename Block>
std::optional<size_t> find_fingerprint_range_at_or_after_any_gate(CircuitBuilder& builder,
                                                                  Block& block,
                                                                  const std::set<size_t>& anchor_gate_indices,
                                                                  const FunctionFingerprint& fp)
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

struct ChallengeGenerationValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validate a verifier challenge-generation stage (arithmetic + Poseidon2 external + internal).
 *
 * Used for Shplemini challenges, sumcheck rounds, Oink η/βγ/α, etc.
 */
template <typename FF, typename CircuitBuilder>
ChallengeGenerationValidationResult validate_challenges_generation(CircuitBuilder& builder,
                                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                   size_t challenge_gate_idx,
                                                                   const FunctionFingerprint& arith_fp,
                                                                   const FunctionFingerprint& poseidon2_ext_fp,
                                                                   const FunctionFingerprint& poseidon2_int_fp)
{
    ChallengeGenerationValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = poseidon2_helpers::poseidon2_external_block(builder);
    auto& poseidon2_internal = poseidon2_helpers::poseidon2_internal_block(builder);

    auto arith_start = find_fingerprint_range_containing_gate(builder, arith, challenge_gate_idx, arith_fp);
    if (!arith_start.has_value()) {
        info("Challenge-generation validation failed: no arithmetic range matching fingerprint contains squeeze gate ",
             challenge_gate_idx);
        return result;
    }
    result.arithmetic_gate_start_idx = *arith_start;

    const size_t arith_end = *arith_start + arith_fp.gate_count;
    const std::set<size_t> linked_external_gates =
        collect_linked_gates(builder, analyzer, arith, *arith_start, arith_end, poseidon2_external);
    auto external_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_external, linked_external_gates, poseidon2_ext_fp);
    if (!external_start.has_value()) {
        info("Challenge-generation validation failed: no arithmetic witness links to a valid poseidon2_external range");
        return result;
    }
    result.poseidon2_external_gate_start_idx = *external_start;

    const size_t external_end = *external_start + poseidon2_ext_fp.gate_count;
    const std::set<size_t> linked_internal_gates =
        collect_linked_gates(builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
    auto internal_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_internal, linked_internal_gates, poseidon2_int_fp);
    if (!internal_start.has_value()) {
        info("Challenge-generation validation failed: no poseidon2_external witness links to a valid "
             "poseidon2_internal range");
        return result;
    }
    result.poseidon2_internal_gate_start_idx = *internal_start;

    result.is_valid = true;
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

    auto masking_challenge_start = recursion_helpers::find_fingerprint_range_containing_gate(
        builder, arith, masking_challenge_gate_idx, MASKING_CHALLENGE_ARITHMETIC);
    if (!masking_challenge_start.has_value() ||
        *masking_challenge_start < TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count) {
        return result;
    }

    result.arithmetic_gate_start_idx = *masking_challenge_start - TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, result.arithmetic_gate_start_idx, TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC)) {
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, *masking_challenge_start, MASKING_CHALLENGE_ARITHMETIC)) {
        return result;
    }

    if (TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count > nnf.size()) {
        return result;
    }

    const size_t arithmetic_end = *masking_challenge_start;
    std::set<size_t> linked_nnf_gates = recursion_helpers::collect_linked_gates(
        builder, analyzer, arith, result.arithmetic_gate_start_idx, arithmetic_end, nnf);

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
        if (!recursion_helpers::matches_fingerprint_at(builder, nnf, nnf_start, TRANSCRIPT_RECEIVE_KZG_W_NNF)) {
            continue;
        }

        const size_t batch_mul_nnf_start = nnf_start + TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;
        if (!recursion_helpers::matches_fingerprint_at(builder, nnf, batch_mul_nnf_start, BATCH_MUL_NNF)) {
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
    auto& poseidon2_external = poseidon2_helpers::poseidon2_external_block(builder);
    auto& poseidon2_internal = poseidon2_helpers::poseidon2_internal_block(builder);

    const size_t masking_challenge_start =
        transcript_receive.arithmetic_gate_start_idx + TRANSCRIPT_RECEIVE_KZG_W_ARITHMETIC.gate_count;
    if (masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count > arith.size()) {
        return result;
    }
    if (masking_challenge_gate_idx < masking_challenge_start ||
        masking_challenge_gate_idx >= masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count) {
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, masking_challenge_start, MASKING_CHALLENGE_ARITHMETIC)) {
        return result;
    }
    result.arithmetic_gate_start_idx = masking_challenge_start;

    const size_t masking_challenge_end = masking_challenge_start + MASKING_CHALLENGE_ARITHMETIC.gate_count;
    const std::set<size_t> linked_external_gates = recursion_helpers::collect_linked_gates(
        builder, analyzer, arith, masking_challenge_start, masking_challenge_end, poseidon2_external);
    auto external_start = recursion_helpers::find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_external, linked_external_gates, MASKING_CHALLENGE_POSEIDON2_EXT);
    if (!external_start.has_value()) {
        info(
            "KZG masking challenge validation failed: no arithmetic witness links to a valid poseidon2_external range");
        return result;
    }

    const size_t external_end = *external_start + MASKING_CHALLENGE_POSEIDON2_EXT.gate_count;
    const std::set<size_t> linked_internal_gates = recursion_helpers::collect_linked_gates(
        builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
    auto internal_start = recursion_helpers::find_fingerprint_range_at_or_after_any_gate(
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
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, result.arithmetic_gate_start_idx, BATCH_MUL_ARITHMETIC)) {
        log_error("validate_batch_mul failed: BATCH_MUL_ARITHMETIC fingerprint mismatch at start ",
                  result.arithmetic_gate_start_idx);
        return result;
    }

    result.nnf_gate_start_idx = transcript_receive.nnf_gate_start_idx + TRANSCRIPT_RECEIVE_KZG_W_NNF.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, nnf, result.nnf_gate_start_idx, BATCH_MUL_NNF)) {
        log_error("validate_batch_mul failed: BATCH_MUL_NNF fingerprint mismatch at start ", result.nnf_gate_start_idx);
        return result;
    }

    const size_t batch_mul_arithmetic_end = result.arithmetic_gate_start_idx + BATCH_MUL_ARITHMETIC.gate_count;
    const std::set<size_t> linked_memory_gates = recursion_helpers::collect_linked_gates(
        builder, analyzer, arith, result.arithmetic_gate_start_idx, batch_mul_arithmetic_end, memory);
    auto memory_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
        builder, memory, linked_memory_gates, BATCH_MUL_MEMORY);
    if (!memory_start.has_value()) {
        log_error(
            "validate_batch_mul failed: no valid BATCH_MUL_MEMORY range found from arithmetic-linked memory gates");
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
        log_error("validate_kzg failed: could not locate valid KZG masking challenge");
        return false;
    }

    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    auto transcript_receive = validate_transcript_receive(builder, analyzer, masking_challenge.squeeze_gate);
    if (!transcript_receive.is_valid) {
        log_error("validate_kzg failed: transcript_receive validation failed");
        return false;
    }

    auto masking_challenge_generation =
        validate_masking_challenge_generation(builder, analyzer, masking_challenge.squeeze_gate, transcript_receive);
    if (!masking_challenge_generation.is_valid) {
        log_error("validate_kzg failed: masking_challenge generation validation failed");
        return false;
    }

    auto batch_mul = validate_batch_mul(
        builder, analyzer, masking_challenge.squeeze_gate, transcript_receive, masking_challenge_generation);
    if (!batch_mul.is_valid) {
        log_error("validate_kzg failed: batch_mul validation failed");
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
    auto rho_arith_start = recursion_helpers::find_fingerprint_range_containing_gate(
        builder, arith, rho_challenge_gate_idx, RHO_ARITHMETIC);
    if (!rho_arith_start.has_value()) {
        info("Gemini fold commitments validation failed: no rho arithmetic range contains squeeze gate ",
             rho_challenge_gate_idx);
        return result;
    }
    const size_t gemini_fold_arith_start = *rho_arith_start + RHO_ARITHMETIC.gate_count;

    // Step 3: validate fingerprint at derived start.
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, gemini_fold_arith_start, GEMINI_FOLD_COMMITMENTS_ARITHMETIC)) {
        info("Gemini fold commitments validation failed: fingerprint mismatch at derived start ",
             gemini_fold_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = gemini_fold_arith_start;
    const size_t gemini_fold_arith_end = gemini_fold_arith_start + GEMINI_FOLD_COMMITMENTS_ARITHMETIC.gate_count;

    // Steps 4-5: follow witness links from fold arithmetic range into NNF block.
    const std::set<size_t> linked_nnf_gates = recursion_helpers::collect_linked_gates(
        builder, analyzer, arith, gemini_fold_arith_start, gemini_fold_arith_end, nnf);
    if (linked_nnf_gates.empty()) {
        info("Gemini fold commitments validation failed: no witness links from fold arithmetic range to NNF block");
        return result;
    }
    auto nnf_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
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
ShplonkBatchingChallengePowersValidationResult validate_shplonk_batching_challenge_powers(CircuitBuilder& builder,
                                                                                          size_t nu_arith_start)
{
    ShplonkBatchingChallengePowersValidationResult result;
    auto& arith = builder.blocks.arithmetic;

    const size_t powers_arith_start = nu_arith_start + SHPLONK_NU_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(
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
    if (!recursion_helpers::matches_fingerprint_at(builder, arith, q_arith_start, SHPLONK_Q_ARITHMETIC)) {
        info("Shplonk Q validation failed: fingerprint mismatch at derived start ", q_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = q_arith_start;

    const size_t q_arith_end = q_arith_start + SHPLONK_Q_ARITHMETIC.gate_count;
    const std::set<size_t> linked_nnf_gates =
        recursion_helpers::collect_linked_gates(builder, analyzer, arith, q_arith_start, q_arith_end, nnf);
    if (linked_nnf_gates.empty()) {
        info("Shplonk Q validation failed: no witness links from Q arithmetic range to NNF block");
        return result;
    }
    auto nnf_start =
        recursion_helpers::find_fingerprint_range_containing_any_gate(builder, nnf, linked_nnf_gates, SHPLONK_Q_NNF);
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
template <typename CircuitBuilder> bool validate_shplonk_tail(CircuitBuilder& builder, size_t z_arith_start)
{
    auto& arith = builder.blocks.arithmetic;

    static constexpr std::array<recursion_helpers::FunctionFingerprint, 9> TAIL_STAGES = { {
        SHPLONK_INVERSE_GEMINI_DENOMINATORS_ARITHMETIC,   //  64 gates
        CLAIM_BATCHER_COMPUTE_SCALARS_ARITHMETIC,         //   6 gates
        CLAIM_BATCHER_UPDATE_BATCH_MUL_INPUTS_ARITHMETIC, // 239 gates
        GEMINI_FOLD_POS_EVALUATIONS_ARITHMETIC,           // 208 gates
        BATCH_GEMINI_CLAIMS_ARITHMETIC,                   // 119 gates
        A0_CONSTANT_TERMS_ARITHMETIC,                     //   5 gates
        REMOVE_REPEATED_COMMITMENTS_ARITHMETIC,           //   5 gates
        ADD_ZK_DATA_ARITHMETIC,                           //  19 gates
        CHECK_LIBRA_EVALUATIONS_CONSISTENCY_ARITHMETIC,   // 1434 gates
    } };

    static constexpr std::array<const char*, 9> TAIL_STAGE_NAMES = { {
        "Shplonk_inverse_gemini_denominators",
        "ClaimBatcher_compute_scalars",
        "ClaimBatcher_update_batch_mul_inputs",
        "Gemini_fold_pos_evaluations",
        "batch_gemini_claims_received_from_prover",
        "A0_constant_terms",
        "remove_repeated_commitments",
        "add_zk_data",
        "check_libra_evaluations_consistency",
    } };

    size_t offset = z_arith_start + SHPLONK_Z_ARITHMETIC.gate_count;
    for (size_t i = 0; i < TAIL_STAGES.size(); ++i) {
        if (!recursion_helpers::matches_fingerprint_at(builder, arith, offset, TAIL_STAGES[i])) {
            info(
                "Shplemini tail validation failed at stage ", TAIL_STAGE_NAMES[i], " (arithmetic offset ", offset, ")");
            return false;
        }
        offset += TAIL_STAGES[i].gate_count;
    }
    return true;
}

/**
 * @brief Result of validating the `Shplemini:Gemini_evaluation_challenge_powers` stage.
 */
struct EvaluationChallengePowersValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
};

/**
 * @brief Validate the `Shplemini:Gemini_evaluation_challenge_powers` stage.
 *
 * Derives the arithmetic start immediately after the Gemini:r arithmetic range and validates
 * the fingerprint. No cross-block links: this stage is purely arithmetic.
 *
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param gemini_r_arith_start Validated arithmetic start of the preceding Gemini:r stage.
 * @return Validated arithmetic start, with `is_valid` set on success.
 */
template <typename CircuitBuilder>
EvaluationChallengePowersValidationResult validate_evaluation_challenge_powers(CircuitBuilder& builder,
                                                                               size_t gemini_r_arith_start)
{
    EvaluationChallengePowersValidationResult result;
    auto& arith = builder.blocks.arithmetic;

    const size_t eval_powers_arith_start = gemini_r_arith_start + GEMINI_R_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, eval_powers_arith_start, GEMINI_EVALUATION_CHALLENGE_POWERS_ARITHMETIC)) {
        info("validate_evaluation_challenge_powers failed: fingerprint mismatch at derived start ",
             eval_powers_arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = eval_powers_arith_start;
    result.is_valid = true;
    return result;
}

/**
 * @tparam FF Field type used by the StaticAnalyzer.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the generated Shplemini circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @return `true` when all stages pass validation.
 */
template <typename FF, typename CircuitBuilder>
bool validate_shplemini(CircuitBuilder& builder, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    constexpr size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES +
                                      recursion_helpers::NUM_SUMCHECK_SQUEEZES;

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    if (all_squeezes.size() < consumed_count + recursion_helpers::NUM_SHPLEMINI_SQUEEZES) {
        info("validate_shplemini failed: expected at least ",
             consumed_count + recursion_helpers::NUM_SHPLEMINI_SQUEEZES,
             " squeeze gates, found ",
             all_squeezes.size());
        return false;
    }
    const std::set<size_t> consumed_before_shplemini(all_squeezes.begin(), all_squeezes.begin() + consumed_count);
    const auto shplemini_gates = recursion_helpers::take_unclaimed_squeezes(
        all_squeezes, consumed_before_shplemini, recursion_helpers::NUM_SHPLEMINI_SQUEEZES);

    const size_t rho_gate = shplemini_gates[0];
    const size_t gemini_r_gate = shplemini_gates[1];
    const size_t shplonk_nu_gate = shplemini_gates[2];
    const size_t shplonk_z_gate = shplemini_gates[3];

    // Stage 1: rho challenge generation.
    auto rho = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, rho_gate, RHO_ARITHMETIC, RHO_POSEIDON2_EXT, RHO_POSEIDON2_INT);
    if (!rho.is_valid) {
        return false;
    }

    // Stage 2: Gemini fold commitments.
    auto fold = validate_gemini_fold_commitments<FF>(builder, analyzer, rho_gate, gemini_r_gate);
    if (!fold.is_valid) {
        return false;
    }

    // Stage 3: Gemini:r challenge generation.
    auto gemini_r = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, gemini_r_gate, GEMINI_R_ARITHMETIC, GEMINI_R_POSEIDON2_EXT, GEMINI_R_POSEIDON2_INT);
    if (!gemini_r.is_valid) {
        return false;
    }

    // Stage 3.5: Gemini evaluation challenge powers.
    auto eval_powers = validate_evaluation_challenge_powers(builder, gemini_r.arithmetic_gate_start_idx);
    if (!eval_powers.is_valid) {
        return false;
    }

    // Stage 4: Shplonk:nu challenge generation.
    auto nu = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, shplonk_nu_gate, SHPLONK_NU_ARITHMETIC, SHPLONK_NU_POSEIDON2_EXT, SHPLONK_NU_POSEIDON2_INT);
    if (!nu.is_valid) {
        return false;
    }

    // Stage 5: compute_shplonk_batching_challenge_powers.
    auto powers = validate_shplonk_batching_challenge_powers(builder, nu.arithmetic_gate_start_idx);
    if (!powers.is_valid) {
        return false;
    }

    // Stage 6: Shplonk:Q commitment receive.
    auto q = validate_shplonk_q<FF>(builder, analyzer, powers.arithmetic_gate_start_idx);
    if (!q.is_valid) {
        return false;
    }

    // Stage 7: Shplonk:z challenge generation.
    auto z = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, shplonk_z_gate, SHPLONK_Z_ARITHMETIC, SHPLONK_Z_POSEIDON2_EXT, SHPLONK_Z_POSEIDON2_INT);
    if (!z.is_valid) {
        return false;
    }
    if (z.arithmetic_gate_start_idx != q.arithmetic_gate_start_idx + SHPLONK_Q_ARITHMETIC.gate_count) {
        info("validate_shplemini failed: z arithmetic start ",
             z.arithmetic_gate_start_idx,
             " != expected ",
             q.arithmetic_gate_start_idx + SHPLONK_Q_ARITHMETIC.gate_count,
             " (Q arithmetic end)");
        return false;
    }

    // Stage 8: Shplonk tail (9-stage arithmetic offset walk).
    if (!validate_shplonk_tail(builder, z.arithmetic_gate_start_idx)) {
        return false;
    }

    info("validate_shplemini succeeded: rho at ",
         rho.arithmetic_gate_start_idx,
         ", gemini_r at ",
         gemini_r.arithmetic_gate_start_idx,
         ", nu at ",
         nu.arithmetic_gate_start_idx,
         ", z at ",
         z.arithmetic_gate_start_idx);
    return true;
}

} // namespace ShpleminiVerification

// ============================================================================
// SumcheckValidation — structural fingerprint validators for the Sumcheck step
// ============================================================================
namespace SumcheckValidation {

// ── Group A: Prefix (non-round) stage fingerprints ───────────────────────────

// Libra:concatenation_commitment  (arith 79 gates + NNF 62 gates)
static constexpr recursion_helpers::FunctionFingerprint LIBRA_CONCAT_COMMIT_ARITHMETIC = {
    79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint LIBRA_CONCAT_COMMIT_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// ZK_correction_handler:Libra_challenge  (arith 35 + p2ext 20 + p2int 114)
static constexpr recursion_helpers::FunctionFingerprint ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC = {
    35, 0x49966e00712e56a5ULL, 0xfafaa0824a5575d1ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_EXT = {
    20, 0x0ec92a899925d755ULL, 0x0ec92a899925d755ULL, 20 // 20 gates: prefix == full
};
static constexpr recursion_helpers::FunctionFingerprint ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_INT = {
    114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// ZK_correction_handler:initialize_target_sum  (arith 1 gate)
static constexpr recursion_helpers::FunctionFingerprint ZK_HANDLER_INIT_TARGET_SUM_ARITHMETIC = {
    1, 0x9d231075bdfe6ef4ULL, 0x9d231075bdfe6ef4ULL, 1 // 1 gate: prefix == full
};

// ── Group B: Per-round fingerprints ──────────────────────────────────────────

// u_r challenge (arith + p2ext + p2int): identical across all 16 rounds
static constexpr recursion_helpers::FunctionFingerprint ROUND_U_ARITHMETIC = {
    51, 0x1c8f1b12f50c854cULL, 0x6217b4e6def623f4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ROUND_U_POSEIDON2_EXT = {
    40, 0x0ec92a899925d755ULL, 0x48f1e27a98839056ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ROUND_U_POSEIDON2_INT = {
    228, 0xee3a7ac895f8a6d9ULL, 0x282fd7e7a05cc2b7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// check_sum: rounds 0–14 share hash; round 15 differs
static constexpr recursion_helpers::FunctionFingerprint ROUND_CHECK_SUM_ARITHMETIC = {
    4, 0x5552265f27140639ULL, 0x5552265f27140639ULL, 4 // 4 gates: prefix == full
};
static constexpr recursion_helpers::FunctionFingerprint ROUND15_CHECK_SUM_ARITHMETIC = {
    4, 0xe60bbf41c8b4882fULL, 0xe60bbf41c8b4882fULL, 4 // 4 gates: prefix == full
};

// compute_next_target_sum: rounds 0–14 share hash; round 15 differs
static constexpr recursion_helpers::FunctionFingerprint ROUND_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC = {
    47, 0x529c4a5c0d537283ULL, 0xfa6eaa478535a26cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ROUND15_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC = {
    47, 0x4675eff1d121e227ULL, 0x7a64496ac2b57d26ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// gate_separators_partially_evaluate:
//   round 0  → 3 gates (distinct from rounds 1–14)
//   rounds 1–14 → 5 gates, shared hash
//   round 15 → 5 gates, different hash
static constexpr recursion_helpers::FunctionFingerprint ROUND_GATE_SEP_R0_ARITHMETIC = {
    3, 0x39cf175250f474bcULL, 0x39cf175250f474bcULL, 3 // 3 gates: prefix == full
};
static constexpr recursion_helpers::FunctionFingerprint ROUND_GATE_SEP_ARITHMETIC = {
    5, 0xcf8b9f27267d5afbULL, 0xcf8b9f27267d5afbULL, 5 // 5 gates: prefix == full
};
static constexpr recursion_helpers::FunctionFingerprint ROUND15_GATE_SEP_ARITHMETIC = {
    5, 0x1ebf4208b8115fc3ULL, 0x1ebf4208b8115fc3ULL, 5 // 5 gates: prefix == full
};

// ── Group C: Suffix stage fingerprints ───────────────────────────────────────

static constexpr recursion_helpers::FunctionFingerprint COMPUTE_FULL_RELATION_ARITHMETIC = {
    454, 0xad80ba6a68d708bdULL, 0x27a84dfb09ed573aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ROW_DISABLING_ARITHMETIC = {
    42, 0x82c761cb614b5021ULL, 0xac86124c84b7aaecULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint LIBRA_CORRECTION_ARITHMETIC = {
    2, 0xe9aa725997d31ecdULL, 0xe9aa725997d31ecdULL, 2 // 2 gates: prefix == full
};
// Libra:grand_sum_commitment and Libra:quotient_commitment share identical fingerprints with
// Libra:concatenation_commitment — discriminated by arithmetic position and witness links.
static constexpr recursion_helpers::FunctionFingerprint LIBRA_GRAND_SUM_COMMIT_ARITHMETIC =
    LIBRA_CONCAT_COMMIT_ARITHMETIC;
static constexpr recursion_helpers::FunctionFingerprint LIBRA_GRAND_SUM_COMMIT_NNF = LIBRA_CONCAT_COMMIT_NNF;
static constexpr recursion_helpers::FunctionFingerprint LIBRA_QUOTIENT_COMMIT_ARITHMETIC =
    LIBRA_CONCAT_COMMIT_ARITHMETIC;
static constexpr recursion_helpers::FunctionFingerprint LIBRA_QUOTIENT_COMMIT_NNF = LIBRA_CONCAT_COMMIT_NNF;

// ── Result structs ────────────────────────────────────────────────────────────

struct LibraCommitmentValidationResult {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
};

// ── validate_libra_commitment_receive ────────────────────────────────────────

/**
 * @brief Validate a single Libra commitment receive stage (arith + NNF).
 *
 * Used for Libra:concatenation_commitment, Libra:grand_sum_commitment, and
 * Libra:quotient_commitment, all of which share identical fingerprints.
 * Discriminated by arithmetic position (provided by caller) and witness links.
 *
 * Algorithm:
 *   1. Validate arith fingerprint at `arith_start`.
 *   2. Collect witness links from arith range → NNF block.
 *   3. Find NNF range containing any linked gate matching `nnf_fp`.
 */
template <typename FF, typename CircuitBuilder>
LibraCommitmentValidationResult validate_libra_commitment_receive(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    size_t arith_start,
    const recursion_helpers::FunctionFingerprint& arith_fp,
    const recursion_helpers::FunctionFingerprint& nnf_fp,
    const char* stage_name)
{
    LibraCommitmentValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    if (!recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, arith_fp)) {
        info("validate_libra_commitment_receive (",
             stage_name,
             "): arithmetic fingerprint mismatch at offset ",
             arith_start);
        return result;
    }
    result.arithmetic_gate_start_idx = arith_start;

    const size_t arith_end = arith_start + arith_fp.gate_count;
    const std::set<size_t> linked_nnf_gates =
        recursion_helpers::collect_linked_gates(builder, analyzer, arith, arith_start, arith_end, nnf);
    if (linked_nnf_gates.empty()) {
        info("validate_libra_commitment_receive (",
             stage_name,
             "): no witness links from arithmetic range to NNF block");
        return result;
    }

    auto nnf_start =
        recursion_helpers::find_fingerprint_range_containing_any_gate(builder, nnf, linked_nnf_gates, nnf_fp);
    if (!nnf_start.has_value()) {
        info("validate_libra_commitment_receive (",
             stage_name,
             "): no NNF range matching fingerprint contains a linked gate");
        return result;
    }
    result.nnf_gate_start_idx = *nnf_start;
    result.is_valid = true;
    return result;
}

// ── Result structs for round and prefix ──────────────────────────────────────

struct SumcheckRoundValidationResult {
    bool is_valid = false;
    size_t arith_end = SIZE_MAX; // first arithmetic gate after this round's gate_sep
};

struct SumcheckPrefixValidationResult {
    bool is_valid = false;
    size_t libra_challenge_arith_start = SIZE_MAX;
    size_t concat_commit_arith_start = SIZE_MAX;
    size_t init_target_sum_arith_start = SIZE_MAX;
    size_t init_target_sum_arith_end = SIZE_MAX; // = arith cursor going into round 0
};

// ── validate_sumcheck_round ───────────────────────────────────────────────────

/**
 * @brief Validate one sumcheck round (r = 0..15).
 *
 * Each round contains 4 sub-stages in the arithmetic block:
 *   u_r (arith 51 + p2ext 40 + p2int 228), check_sum (arith 4),
 *   compute_next_target_sum (arith 47), gate_separators_partially_evaluate (arith 3 or 5).
 *
 * u_r is anchored at its squeeze gate (via `validate_challenges_generation`).
 * The remaining 3 sub-stages are contiguous in arithmetic immediately after u_r's arith range.
 *
 * Cross-check: the u_r arith start must equal `expected_arith_start` (cursor from prior round).
 */
template <typename FF, typename CircuitBuilder>
SumcheckRoundValidationResult validate_sumcheck_round(CircuitBuilder& builder,
                                                      cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                      size_t round_idx,
                                                      size_t u_squeeze_gate,
                                                      size_t expected_arith_start)
{
    SumcheckRoundValidationResult result;
    auto& arith = builder.blocks.arithmetic;

    // 1. Validate u_r challenge (arith + poseidon2_ext + poseidon2_int via witness links).
    auto u = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, u_squeeze_gate, ROUND_U_ARITHMETIC, ROUND_U_POSEIDON2_EXT, ROUND_U_POSEIDON2_INT);
    if (!u.is_valid) {
        info("validate_sumcheck_round failed at round ", round_idx, ": u_r challenge generation invalid");
        return result;
    }

    // 2. Cross-check: u_r arith start must equal the cursor from the prior stage.
    if (u.arithmetic_gate_start_idx != expected_arith_start) {
        info("validate_sumcheck_round failed at round ",
             round_idx,
             ": u_r arith start ",
             u.arithmetic_gate_start_idx,
             " != expected ",
             expected_arith_start);
        return result;
    }

    // 3. Offset walk for the 3 arithmetic-only sub-stages.
    const recursion_helpers::FunctionFingerprint& check_sum_fp =
        (round_idx == 15) ? ROUND15_CHECK_SUM_ARITHMETIC : ROUND_CHECK_SUM_ARITHMETIC;
    const recursion_helpers::FunctionFingerprint& next_target_fp =
        (round_idx == 15) ? ROUND15_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC : ROUND_COMPUTE_NEXT_TARGET_SUM_ARITHMETIC;
    const recursion_helpers::FunctionFingerprint& gate_sep_fp =
        (round_idx == 15) ? ROUND15_GATE_SEP_ARITHMETIC
                          : (round_idx == 0 ? ROUND_GATE_SEP_R0_ARITHMETIC : ROUND_GATE_SEP_ARITHMETIC);

    static constexpr const char* SUB_STAGE_NAMES[3] = { "check_sum",
                                                        "compute_next_target_sum",
                                                        "gate_separators_partially_evaluate" };
    const recursion_helpers::FunctionFingerprint* fps[3] = { &check_sum_fp, &next_target_fp, &gate_sep_fp };

    size_t offset = u.arithmetic_gate_start_idx + ROUND_U_ARITHMETIC.gate_count;
    for (size_t i = 0; i < 3; ++i) {
        if (!recursion_helpers::matches_fingerprint_at(builder, arith, offset, *fps[i])) {
            info("validate_sumcheck_round failed at round ",
                 round_idx,
                 ", sub-stage ",
                 SUB_STAGE_NAMES[i],
                 " (arithmetic offset ",
                 offset,
                 ")");
            return result;
        }
        offset += fps[i]->gate_count;
    }

    result.arith_end = offset;
    result.is_valid = true;
    return result;
}

// ── validate_sumcheck_prefix ──────────────────────────────────────────────────

/**
 * @brief Validate the three sumcheck prefix stages before the round loop.
 *
 * Stages (circuit order):
 *   1. Libra:concatenation_commitment (arith backward-scan from libra_challenge + NNF via witness links)
 *   2. ZK_correction_handler:Libra_challenge (arith + p2ext + p2int via squeeze gate)
 *   3. ZK_correction_handler:initialize_target_sum (arith, immediately after libra_challenge arith)
 *
 * Returns the arith cursor pointing past init_target_sum (= start of round 0).
 */
template <typename FF, typename CircuitBuilder>
SumcheckPrefixValidationResult validate_sumcheck_prefix(CircuitBuilder& builder,
                                                        cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                        size_t libra_challenge_squeeze_gate)
{
    SumcheckPrefixValidationResult result;
    auto& arith = builder.blocks.arithmetic;

    // Stage 2: Libra:Challenge (anchored at squeeze gate).
    auto ch = recursion_helpers::validate_challenges_generation<FF>(builder,
                                                                    analyzer,
                                                                    libra_challenge_squeeze_gate,
                                                                    ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC,
                                                                    ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_EXT,
                                                                    ZK_HANDLER_LIBRA_CHALLENGE_POSEIDON2_INT);
    if (!ch.is_valid) {
        info("validate_sumcheck_prefix failed: Libra:Challenge generation invalid");
        return result;
    }
    result.libra_challenge_arith_start = ch.arithmetic_gate_start_idx;

    // Stage 1: Libra:concatenation_commitment — backward-scan before libra_challenge arith start.
    // Accept only the first candidate that also validates NNF linkage via validate_libra_commitment_receive.
    size_t concat_arith_start = SIZE_MAX;
    for (size_t s = ch.arithmetic_gate_start_idx; s >= LIBRA_CONCAT_COMMIT_ARITHMETIC.gate_count; --s) {
        const size_t candidate_start = s - LIBRA_CONCAT_COMMIT_ARITHMETIC.gate_count;
        if (!recursion_helpers::matches_fingerprint_at(
                builder, arith, candidate_start, LIBRA_CONCAT_COMMIT_ARITHMETIC)) {
            continue;
        }

        auto candidate = validate_libra_commitment_receive<FF>(builder,
                                                               analyzer,
                                                               candidate_start,
                                                               LIBRA_CONCAT_COMMIT_ARITHMETIC,
                                                               LIBRA_CONCAT_COMMIT_NNF,
                                                               "concat_commitment");
        if (!candidate.is_valid) {
            continue;
        }

        concat_arith_start = candidate_start;
        break;
    }
    if (concat_arith_start == SIZE_MAX) {
        info("validate_sumcheck_prefix failed: Libra:concatenation_commitment not found before libra_challenge");
        return result;
    }
    result.concat_commit_arith_start = concat_arith_start;

    // Stage 3: initialize_target_sum — immediately after libra_challenge arith.
    const size_t init_start = ch.arithmetic_gate_start_idx + ZK_HANDLER_LIBRA_CHALLENGE_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, arith, init_start, ZK_HANDLER_INIT_TARGET_SUM_ARITHMETIC)) {
        info("validate_sumcheck_prefix failed: ZK_handler_init_target_sum fingerprint mismatch at ", init_start);
        return result;
    }
    result.init_target_sum_arith_start = init_start;
    result.init_target_sum_arith_end = init_start + ZK_HANDLER_INIT_TARGET_SUM_ARITHMETIC.gate_count;

    result.is_valid = true;
    return result;
}

// ── validate_sumcheck_suffix ──────────────────────────────────────────────────

/**
 * @brief Validate the 5 arithmetic stages after round 15.
 *
 * Strict order (all arithmetic contiguous, NNF stages via witness links):
 *   1. compute_full_relation_purported_value (454 gates)
 *   2. row_disabling_evaluate_at_challenge   ( 42 gates)
 *   3. libra_correction                      (  2 gates)
 *   4. Libra:grand_sum_commitment            ( 79 arith + NNF 62)
 *   5. Libra:quotient_commitment             ( 79 arith + NNF 62)
 */
template <typename FF, typename CircuitBuilder>
bool validate_sumcheck_suffix(CircuitBuilder& builder,
                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                              size_t arith_cursor)
{
    auto& arith = builder.blocks.arithmetic;

    // Stages 1-3: pure arithmetic offset walk.
    static constexpr std::array<recursion_helpers::FunctionFingerprint, 3> ARITH_STAGES = { {
        COMPUTE_FULL_RELATION_ARITHMETIC,
        ROW_DISABLING_ARITHMETIC,
        LIBRA_CORRECTION_ARITHMETIC,
    } };
    static constexpr std::array<const char*, 3> ARITH_NAMES = { {
        "compute_full_relation_purported_value",
        "row_disabling_evaluate_at_challenge",
        "libra_correction",
    } };
    for (size_t i = 0; i < ARITH_STAGES.size(); ++i) {
        if (!recursion_helpers::matches_fingerprint_at(builder, arith, arith_cursor, ARITH_STAGES[i])) {
            info(
                "validate_sumcheck_suffix failed at stage ", ARITH_NAMES[i], " (arithmetic offset ", arith_cursor, ")");
            return false;
        }
        arith_cursor += ARITH_STAGES[i].gate_count;
    }

    // Stage 4: Libra:grand_sum_commitment (arith + NNF via witness links).
    auto grand_sum = validate_libra_commitment_receive<FF>(builder,
                                                           analyzer,
                                                           arith_cursor,
                                                           LIBRA_GRAND_SUM_COMMIT_ARITHMETIC,
                                                           LIBRA_GRAND_SUM_COMMIT_NNF,
                                                           "Libra_grand_sum_commitment");
    if (!grand_sum.is_valid) {
        return false;
    }
    arith_cursor += LIBRA_GRAND_SUM_COMMIT_ARITHMETIC.gate_count;

    // Stage 5: Libra:quotient_commitment (arith + NNF via witness links).
    auto quotient = validate_libra_commitment_receive<FF>(builder,
                                                          analyzer,
                                                          arith_cursor,
                                                          LIBRA_QUOTIENT_COMMIT_ARITHMETIC,
                                                          LIBRA_QUOTIENT_COMMIT_NNF,
                                                          "Libra_quotient_commitment");
    if (!quotient.is_valid) {
        return false;
    }

    return true;
}

// ── validate_sumcheck (top-level) ─────────────────────────────────────────────

/**
 * @brief Validate the full Sumcheck step structural layout.
 *
 * Entry point for the sumcheck validation chain. Extracts the 17 sumcheck
 * squeeze gates (Libra:Challenge + u_0..u_15), validates the prefix, all 16 rounds,
 * and the suffix in order.
 *
 * @tparam FF Field type.
 * @tparam CircuitBuilder Circuit builder type.
 * @param builder Builder containing the full MegaZK recursive verification circuit.
 * @param analyzer Static analyzer built for `builder`.
 * @return `true` when all stages pass validation.
 */
template <typename FF, typename CircuitBuilder>
bool validate_sumcheck(CircuitBuilder& builder, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    constexpr size_t consumed_count = recursion_helpers::NUM_OINK_SQUEEZES + recursion_helpers::NUM_STEP2_SQUEEZES;

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    if (all_squeezes.size() < consumed_count + recursion_helpers::NUM_SUMCHECK_SQUEEZES) {
        info("validate_sumcheck failed: expected at least ",
             consumed_count + recursion_helpers::NUM_SUMCHECK_SQUEEZES,
             " squeeze gates, found ",
             all_squeezes.size());
        return false;
    }
    const std::set<size_t> consumed(all_squeezes.begin(), all_squeezes.begin() + consumed_count);
    auto sc_gates =
        recursion_helpers::take_unclaimed_squeezes(all_squeezes, consumed, recursion_helpers::NUM_SUMCHECK_SQUEEZES);
    if (sc_gates.size() != recursion_helpers::NUM_SUMCHECK_SQUEEZES) {
        info("validate_sumcheck failed: expected ",
             recursion_helpers::NUM_SUMCHECK_SQUEEZES,
             " unclaimed sumcheck squeezes, found ",
             sc_gates.size());
        return false;
    }

    // Validate prefix (concat_commit + libra_challenge + init_target_sum).
    auto prefix = validate_sumcheck_prefix<FF>(builder, analyzer, sc_gates[0]);
    if (!prefix.is_valid) {
        info("validate_sumcheck failed: prefix invalid");
        return false;
    }

    // Validate all sumcheck rounds.
    size_t arith_cursor = prefix.init_target_sum_arith_end;
    for (size_t r = 0; r < recursion_helpers::NUM_SUMCHECK_ROUNDS; ++r) {
        auto round = validate_sumcheck_round<FF>(builder, analyzer, r, sc_gates[r + 1], arith_cursor);
        if (!round.is_valid) {
            info("validate_sumcheck failed: round ", r, " invalid");
            return false;
        }
        arith_cursor = round.arith_end;
    }

    // Validate suffix (full_relation + row_disabling + libra_correction + 2 Libra commits).
    if (!validate_sumcheck_suffix<FF>(builder, analyzer, arith_cursor)) {
        info("validate_sumcheck failed: suffix invalid");
        return false;
    }

    info("validate_sumcheck succeeded. Prefix libra_challenge at ",
         prefix.libra_challenge_arith_start,
         ", concat_commit at ",
         prefix.concat_commit_arith_start,
         ", rounds 0-15 validated, suffix validated.");
    return true;
}

} // namespace SumcheckValidation

// ============================================================================
// PaddingIndicatorArrayValidation — step2 (padding array + dyadic gate challenges)
// ============================================================================
namespace PaddingIndicatorArrayValidation {

// stdlib::compute_padding_indicator_array — arithmetic only (58 gates)
static constexpr recursion_helpers::FunctionFingerprint COMPUTE_PADDING_INDICATOR_ARRAY_ARITHMETIC = {
    58, 0xfe22278d23faed8cULL, 0xbfbd88904266e6d5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// transcript->get_dyadic_powers_of_challenge("Sumcheck:gate_challenge", log_n)
static constexpr recursion_helpers::FunctionFingerprint GATE_CHALLENGE_DYADIC_POWERS_ARITHMETIC = {
    40, 0x60f86c38585de9b2ULL, 0x86410f5f385d42d6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_EXT = {
    10, 0x22f75c874568e52cULL, 0x22f75c874568e52cULL, 10
};
static constexpr recursion_helpers::FunctionFingerprint GATE_CHALLENGE_DYADIC_POWERS_POSEIDON2_INT = {
    57, 0xee3a7ac895f8a6d9ULL, 0xc950d2cdbec675d4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

} // namespace PaddingIndicatorArrayValidation

// ============================================================================
// OinkVerifierValidation — structural fingerprint validators for OinkVerifier
// ============================================================================
namespace OinkVerifierValidation {

// Coverage map for OinkVerifier::verify() stages:
//   execute_preamble_round()                -> validate_vk_hash_stage() + validate_oink_preamble()
//   receive Gemini:masking_poly_comm        -> validate_commitment_group_full() [group 24]
//   execute_wire_commitments_round()        -> validate_commitment_group_full() [wire/mega wire groups]
//   execute_sorted_list_accumulator_round() -> validate_eta_stage() + sorted-list commitment groups
//   execute_log_derivative_inverse_round()  -> validate_beta_gamma_stage() + inverse commitment groups
//   execute_grand_product_computation_round()-> validate_public_input_delta_stage() + z_perm group
//   generate_alpha_round()                  -> validate_alpha_stage()
//
// Anchor ownership:
//   - ACIR anchors: constraint.key_hash, constraint.key[VK_NUM_PUBLIC_INPUTS_INDEX],
//     constraint.key[VK_PUB_INPUTS_OFFSET_INDEX], proof_body_witnesses
//   - Challenge anchors: first 3 Oink squeeze gates = eta, beta/gamma, alpha
//
// Supported baseline path:
//   - MegaZK recursive verifier path (HasZK = true, Mega-specific commitment groups present)

// ── Step 1: Fingerprint constants ────────────────────────────────────────────

static constexpr recursion_helpers::FunctionFingerprint VK_HASH_ARITHMETIC = {
    474, 6104110583215788901ULL, 550964509006047410ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint VK_HASH_POSEIDON2_EXT = {
    400, 15451349259357675649ULL, 3581275304588819155ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint VK_HASH_POSEIDON2_INT = {
    2280, 18351710661041967697ULL, 16378694786639264919ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint CHONK_WIRE_ARITHMETIC = {
    846, 3300576537548107642ULL, 9036444660217075995ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_WIRE_NNF = {
    558, 9597988890089570214ULL, 5180231577776684300ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_SINGLE_RECEIVE_ARITHMETIC = {
    94, 3300576537548107642ULL, 14467350302441511400ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_SINGLE_RECEIVE_NNF = {
    62, 9597988890089570214ULL, 17495900531573514997ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_LOGDERIV_NNF = {
    62, 9597988890089570214ULL, 17495900531573514997ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_TRANSCRIPT_PERMUTATION_POSEIDON2_EXT = {
    10, 5881079831730166975ULL, 5881079831730166975ULL, 10
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_TRANSCRIPT_PERMUTATION_POSEIDON2_INT = {
    57, 18351710661041967697ULL, 6543417916883557386ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_KERNEL_IO_NNF = {
    460, 9597988890089570214ULL, 12867440540418116472ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint CHONK_KERNEL_IO_ARITHMETIC = {
    683, 3300576537548107642ULL, 7168848738012626868ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint ETA_ARITHMETIC = {
    314, 0xcaa904b2d20bccb4ULL, 0x4e2d47c6e22ac2b4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ETA_POSEIDON2_EXT = {
    330, 0x0ec92a899925d755ULL, 0xedde8ed009bfd156ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ETA_POSEIDON2_INT = {
    1881, 0xee3a7ac895f8a6d9ULL, 0x9a889fba485069ffULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint BETA_GAMMA_ARITHMETIC = {
    62, 0x7abc963e79e4a095ULL, 0xaa1f2eb5e7c6def8ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BETA_GAMMA_POSEIDON2_EXT = {
    50, 0x0ec92a899925d755ULL, 0x59b14b4f5ee98d5fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BETA_GAMMA_POSEIDON2_INT = {
    285, 0xee3a7ac895f8a6d9ULL, 0x2eb636e3067907baULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint ALPHA_ARITHMETIC = {
    80, 0x5d3db2a5af5e1fbeULL, 0x9a58b3bce654e9ffULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ALPHA_POSEIDON2_EXT = {
    70, 0x0ec92a899925d755ULL, 0xc30dd3ab427eb0c0ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ALPHA_POSEIDON2_INT = {
    399, 0xee3a7ac895f8a6d9ULL, 0x6619c8437f11d164ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint SINGLE_COMMITMENT_ARITHMETIC = {
    79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint SINGLE_COMMITMENT_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint PUBLIC_INPUT_DELTA_ARITHMETIC = {
    170, 0x30143336bb302b53ULL, 0xde5a78715be6a501ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// Commitment groups in runtime Oink emission order for MegaZK recursive verifier.
static constexpr std::array<size_t, 16> PRE_ETA_COMMITMENT_GROUPS = {
    recursion_helpers::GEMINI_MASKING_GROUP,
    0,
    1,
    2, // w_l, w_r, w_o
    9,
    10,
    11,
    12, // ecc op wires
    13,
    14,
    16,
    17,
    19,
    20,
    22,
    23 // databus entities
};

static constexpr std::array<size_t, 3> POST_ETA_COMMITMENT_GROUPS = {
    6, 7, 3 // lookup_read_counts, lookup_read_tags, w_4
};

static constexpr std::array<size_t, 4> POST_BETA_GAMMA_COMMITMENT_GROUPS = {
    5, 15, 18, 21 // lookup_inverses + databus inverses
};

static constexpr size_t Z_PERM_GROUP = 4;

// ── Result structs ────────────────────────────────────────────────────────────

struct VkHashValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
};

struct CommitmentReceiveValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t nnf_start = SIZE_MAX;
};

struct EtaStageValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    uint32_t eta = UINT32_MAX;
    uint32_t eta_two = UINT32_MAX;
    uint32_t eta_three = UINT32_MAX;
};

struct BetaGammaStageValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    uint32_t beta = UINT32_MAX;
    uint32_t beta_sqr = UINT32_MAX;
    uint32_t beta_cube = UINT32_MAX;
    uint32_t gamma = UINT32_MAX;
};

struct AlphaStageValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    uint32_t alpha = UINT32_MAX;
};

struct PublicInputDeltaStageResult {
    bool is_valid = false;
    uint32_t public_input_delta = UINT32_MAX;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
};

struct ChonkOinkValidationResult {
    bool is_valid = false;
    uint32_t beta = UINT32_MAX;
    uint32_t gamma = UINT32_MAX;
    uint32_t public_input_delta = UINT32_MAX;
    std::vector<std::pair<size_t, size_t>> block_ranges;
};

/**
 * @brief Validate the complete selector sequence emitted by compute_public_input_delta().
 *
 * For `m` public inputs the current implementation emits
 * `public_input_delta_gate_count(m)` (`6m + 2`) arithmetic gates:
 * a 7-gate first public-input segment, `m - 2` identical 6-gate middle segments,
 * and a 7-gate final public-input + division segment.
 */
template <typename CircuitBuilder>
bool validate_public_input_delta_selector_pattern(CircuitBuilder& builder,
                                                  const size_t start,
                                                  const size_t end,
                                                  const size_t num_public_inputs)
{
    // Measured single-gate arithmetic selector hashes from the stdlib expansion of
    // compute_public_input_delta. Shared shapes recur across iterations; the
    // division hash appears once in the final segment.
    constexpr size_t FIRST_SEGMENT_HEAD_HASH = 1584929364824987885ULL;
    constexpr size_t REPEATED_GATE_HASH = 13046493496222653101ULL;
    constexpr size_t FIRST_SEGMENT_THIRD_HASH = 7439118975561227356ULL;
    constexpr size_t ITERATION_START_HASH = 15221033099327830079ULL;
    constexpr size_t ITERATION_BODY_HASH = 12315132540492710203ULL;
    constexpr size_t DIVISION_GATE_HASH = 12174781835826750109ULL;

    constexpr std::array<size_t, 7> FIRST_PUBLIC_INPUT_GATE_HASHES = { FIRST_SEGMENT_HEAD_HASH,  REPEATED_GATE_HASH,
                                                                       FIRST_SEGMENT_THIRD_HASH, ITERATION_START_HASH,
                                                                       REPEATED_GATE_HASH,       REPEATED_GATE_HASH,
                                                                       REPEATED_GATE_HASH };
    constexpr std::array<size_t, 6> MIDDLE_PUBLIC_INPUT_GATE_HASHES = { ITERATION_START_HASH, REPEATED_GATE_HASH,
                                                                        ITERATION_BODY_HASH,  REPEATED_GATE_HASH,
                                                                        ITERATION_BODY_HASH,  REPEATED_GATE_HASH };
    constexpr std::array<size_t, 7> FINAL_PUBLIC_INPUT_AND_DIVISION_GATE_HASHES = {
        ITERATION_START_HASH, REPEATED_GATE_HASH, ITERATION_BODY_HASH, REPEATED_GATE_HASH,
        ITERATION_BODY_HASH,  DIVISION_GATE_HASH, ITERATION_BODY_HASH
    };

    if (num_public_inputs < 2 || end - start != recursion_helpers::public_input_delta_gate_count(num_public_inputs)) {
        return false;
    }
    size_t gate_idx = start;
    auto matches_gate_hashes = [&](const auto& expected_hashes) {
        for (const size_t expected_hash : expected_hashes) {
            if (recursion_helpers::calculate_hash_arithmetic_block(builder, gate_idx, gate_idx + 1) != expected_hash) {
                return false;
            }
            ++gate_idx;
        }
        return true;
    };
    if (!matches_gate_hashes(FIRST_PUBLIC_INPUT_GATE_HASHES)) {
        return false;
    }
    for (size_t middle_idx = 0; middle_idx < num_public_inputs - 2; ++middle_idx) {
        if (!matches_gate_hashes(MIDDLE_PUBLIC_INPUT_GATE_HASHES)) {
            return false;
        }
    }
    return matches_gate_hashes(FINAL_PUBLIC_INPUT_AND_DIVISION_GATE_HASHES) && gate_idx == end;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

template <typename FF, typename CircuitBuilder, typename Block>
std::vector<size_t> collect_real_witness_gates_in_block(CircuitBuilder& builder,
                                                        cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                        uint32_t real_idx,
                                                        Block& block)
{
    std::vector<size_t> gates;
    for (const auto& [blk, gate_idx] : analyzer.get_variable_gates(real_idx)) {
        if (&builder.blocks.get()[blk] == &block) {
            gates.push_back(gate_idx);
        }
    }
    return gates;
}

inline std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT> get_commitment_group_witness_indices(
    const std::vector<uint32_t>& proof_body_witnesses, size_t group_idx)
{
    const size_t base = group_idx * recursion_helpers::FRS_PER_COMMITMENT;
    return { proof_body_witnesses[base],
             proof_body_witnesses[base + 1],
             proof_body_witnesses[base + 2],
             proof_body_witnesses[base + 3] };
}

template <typename CircuitBuilder> std::vector<size_t> extract_oink_squeeze_gates(CircuitBuilder& builder)
{
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const auto challenges = recursion_helpers::oink_challenges(builder, all_squeezes);
    if (!challenges.valid || challenges.squeeze_gate_indices.size() != recursion_helpers::NUM_OINK_SQUEEZES) {
        return {};
    }

    return { challenges.squeeze_gate_indices.begin(), challenges.squeeze_gate_indices.end() };
}

template <typename FF, typename CircuitBuilder>
VkHashValidationResult validate_vk_hash_stage(CircuitBuilder& builder,
                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                              const acir_format::RecursionConstraint& constraint)
{
    VkHashValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = poseidon2_helpers::poseidon2_external_block(builder);
    auto& poseidon2_internal = poseidon2_helpers::poseidon2_internal_block(builder);

    if (constraint.key.empty()) {
        info("validate_vk_hash_stage failed: empty constraint.key");
        return result;
    }

    uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    std::vector<size_t> external_candidate_gates =
        collect_real_witness_gates_in_block<FF>(builder, analyzer, key_hash_real, poseidon2_external);
    std::set<size_t> tried_external_starts;

    for (size_t gate_idx : external_candidate_gates) {
        auto external_start = recursion_helpers::find_fingerprint_range_containing_gate(
            builder, poseidon2_external, gate_idx, VK_HASH_POSEIDON2_EXT);
        if (!external_start.has_value() || !tried_external_starts.insert(*external_start).second) {
            continue;
        }

        const size_t external_end = *external_start + VK_HASH_POSEIDON2_EXT.gate_count;
        const std::set<size_t> linked_internal_gates = recursion_helpers::collect_linked_gates(
            builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
        auto internal_start = recursion_helpers::find_fingerprint_range_at_or_after_any_gate(
            builder, poseidon2_internal, linked_internal_gates, VK_HASH_POSEIDON2_INT);
        if (!internal_start.has_value()) {
            continue;
        }

        const std::set<size_t> linked_arith_gates = recursion_helpers::collect_linked_gates(
            builder, analyzer, poseidon2_external, *external_start, external_end, arith);
        auto arith_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
            builder, arith, linked_arith_gates, VK_HASH_ARITHMETIC);
        if (!arith_start.has_value()) {
            continue;
        }

        if (!result.is_valid || *arith_start < result.arith_start) {
            result.is_valid = true;
            result.arith_start = *arith_start;
            result.arith_end = *arith_start + VK_HASH_ARITHMETIC.gate_count;
            result.poseidon2_ext_start = *external_start;
            result.poseidon2_int_start = *internal_start;
        }
    }

    if (result.is_valid) {
        return result;
    }

    info("validate_vk_hash_stage failed: could not anchor vk_hash stage from key_hash witness");
    return result;
}

template <typename FF, typename CircuitBuilder>
EtaStageValidationResult validate_eta_stage(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            size_t eta_squeeze_gate)
{
    EtaStageValidationResult result;
    auto inner = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, eta_squeeze_gate, ETA_ARITHMETIC, ETA_POSEIDON2_EXT, ETA_POSEIDON2_INT);
    if (!inner.is_valid) {
        info("validate_eta_stage failed: challenge-generation validation failed");
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    result.eta = builder.real_variable_index[arith.w_l()[eta_squeeze_gate]];
    const uint32_t eta_sqr = recursion_helpers::find_sqr_of<FF>(result.eta, builder, analyzer);
    if (eta_sqr == UINT32_MAX) {
        info("validate_eta_stage failed: eta^2 witness not found");
        return result;
    }
    const uint32_t eta_cube = recursion_helpers::find_cube_of<FF>(result.eta, eta_sqr, builder, analyzer);
    if (eta_cube == UINT32_MAX) {
        info("validate_eta_stage failed: eta^3 witness not found");
        return result;
    }
    if (!recursion_helpers::validate_square_and_cube<FF>(result.eta, eta_sqr, eta_cube, builder, analyzer)) {
        info("validate_eta_stage failed: eta power gates invalid");
        return result;
    }

    result.is_valid = true;
    result.arith_start = inner.arithmetic_gate_start_idx;
    result.arith_end = inner.arithmetic_gate_start_idx + ETA_ARITHMETIC.gate_count;
    result.poseidon2_ext_start = inner.poseidon2_external_gate_start_idx;
    result.poseidon2_int_start = inner.poseidon2_internal_gate_start_idx;
    result.eta_two = eta_sqr;
    result.eta_three = eta_cube;
    return result;
}

template <typename FF, typename CircuitBuilder>
BetaGammaStageValidationResult validate_beta_gamma_stage(CircuitBuilder& builder,
                                                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                         size_t beta_gamma_squeeze_gate)
{
    BetaGammaStageValidationResult result;
    auto inner = recursion_helpers::validate_challenges_generation<FF>(builder,
                                                                       analyzer,
                                                                       beta_gamma_squeeze_gate,
                                                                       BETA_GAMMA_ARITHMETIC,
                                                                       BETA_GAMMA_POSEIDON2_EXT,
                                                                       BETA_GAMMA_POSEIDON2_INT);
    if (!inner.is_valid) {
        info("validate_beta_gamma_stage failed: challenge-generation validation failed");
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    result.beta = builder.real_variable_index[arith.w_l()[beta_gamma_squeeze_gate]];
    result.gamma = builder.real_variable_index[arith.w_r()[beta_gamma_squeeze_gate]];
    const uint32_t beta_sqr = recursion_helpers::find_sqr_of<FF>(result.beta, builder, analyzer);
    if (beta_sqr == UINT32_MAX) {
        info("validate_beta_gamma_stage failed: beta^2 witness not found");
        return result;
    }
    const uint32_t beta_cube = recursion_helpers::find_cube_of<FF>(result.beta, beta_sqr, builder, analyzer);
    if (beta_cube == UINT32_MAX) {
        info("validate_beta_gamma_stage failed: beta^3 witness not found");
        return result;
    }
    if (!recursion_helpers::validate_square_and_cube<FF>(result.beta, beta_sqr, beta_cube, builder, analyzer)) {
        info("validate_beta_gamma_stage failed: beta power gates invalid");
        return result;
    }

    result.is_valid = true;
    result.arith_start = inner.arithmetic_gate_start_idx;
    result.arith_end = inner.arithmetic_gate_start_idx + BETA_GAMMA_ARITHMETIC.gate_count;
    result.poseidon2_ext_start = inner.poseidon2_external_gate_start_idx;
    result.poseidon2_int_start = inner.poseidon2_internal_gate_start_idx;
    result.beta_sqr = beta_sqr;
    result.beta_cube = beta_cube;
    return result;
}

template <typename FF, typename CircuitBuilder>
AlphaStageValidationResult validate_alpha_stage(CircuitBuilder& builder,
                                                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                size_t alpha_squeeze_gate)
{
    AlphaStageValidationResult result;
    auto inner = recursion_helpers::validate_challenges_generation<FF>(
        builder, analyzer, alpha_squeeze_gate, ALPHA_ARITHMETIC, ALPHA_POSEIDON2_EXT, ALPHA_POSEIDON2_INT);
    if (!inner.is_valid) {
        info("validate_alpha_stage failed: challenge-generation validation failed");
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    result.alpha = builder.real_variable_index[arith.w_l()[alpha_squeeze_gate]];
    result.is_valid = true;
    result.arith_start = inner.arithmetic_gate_start_idx;
    result.arith_end = inner.arithmetic_gate_start_idx + ALPHA_ARITHMETIC.gate_count;
    result.poseidon2_ext_start = inner.poseidon2_external_gate_start_idx;
    result.poseidon2_int_start = inner.poseidon2_internal_gate_start_idx;
    return result;
}

template <typename FF, typename CircuitBuilder>
CommitmentReceiveValidationResult validate_commitment_receive_fingerprint(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    uint32_t fr0_idx,
    uint32_t fr1_idx,
    uint32_t fr2_idx,
    uint32_t fr3_idx)
{
    CommitmentReceiveValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    const uint32_t fr0_real = builder.real_variable_index[fr0_idx];
    std::vector<size_t> candidate_gates = collect_real_witness_gates_in_block<FF>(builder, analyzer, fr0_real, arith);
    std::set<size_t> tried_starts;
    for (size_t gate_idx : candidate_gates) {
        auto arith_start = recursion_helpers::find_fingerprint_range_containing_gate(
            builder, arith, gate_idx, SINGLE_COMMITMENT_ARITHMETIC);
        if (!arith_start.has_value() || !tried_starts.insert(*arith_start).second) {
            continue;
        }

        const size_t arith_end = *arith_start + SINGLE_COMMITMENT_ARITHMETIC.gate_count;
        const std::set<size_t> linked_nnf_gates =
            recursion_helpers::collect_linked_gates(builder, analyzer, arith, *arith_start, arith_end, nnf);
        auto nnf_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
            builder, nnf, linked_nnf_gates, SINGLE_COMMITMENT_NNF);
        if (!nnf_start.has_value()) {
            continue;
        }

        if (!result.is_valid || *arith_start < result.arith_start) {
            result.is_valid = true;
            result.arith_start = *arith_start;
            result.arith_end = arith_end;
            result.nnf_start = *nnf_start;
        }
    }
    if (result.is_valid) {
        return result;
    }

    const std::set<size_t> nnf_gates =
        recursion_helpers::find_commitment_nnf_gates<FF>(builder, analyzer, fr0_idx, fr1_idx, fr2_idx, fr3_idx);
    if (nnf_gates.empty()) {
        info("validate_commitment_receive_fingerprint failed: no NNF gates found for commitment starting at fr0 ",
             fr0_idx);
        return result;
    }

    auto nnf_start =
        recursion_helpers::find_fingerprint_range_containing_any_gate(builder, nnf, nnf_gates, SINGLE_COMMITMENT_NNF);
    if (!nnf_start.has_value()) {
        info("validate_commitment_receive_fingerprint failed: no matching NNF fingerprint range found for fr0 ",
             fr0_idx);
        return result;
    }

    const size_t nnf_end = *nnf_start + SINGLE_COMMITMENT_NNF.gate_count;
    const std::set<size_t> linked_arith_gates =
        recursion_helpers::collect_linked_gates(builder, analyzer, nnf, *nnf_start, nnf_end, arith);
    auto arith_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
        builder, arith, linked_arith_gates, SINGLE_COMMITMENT_ARITHMETIC);
    if (!arith_start.has_value()) {
        info("validate_commitment_receive_fingerprint failed: no matching arithmetic fingerprint range linked from NNF "
             "for fr0 ",
             fr0_idx);
        return result;
    }

    result.is_valid = true;
    result.arith_start = *arith_start;
    result.arith_end = *arith_start + SINGLE_COMMITMENT_ARITHMETIC.gate_count;
    result.nnf_start = *nnf_start;
    return result;
}

template <typename FF, typename CircuitBuilder>
PublicInputDeltaStageResult validate_public_input_delta_stage(CircuitBuilder& builder,
                                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                              uint32_t beta_real,
                                                              uint32_t gamma_real,
                                                              uint32_t pub_inputs_offset_real,
                                                              const std::vector<uint32_t>& public_input_reals)
{
    PublicInputDeltaStageResult result;
    const uint32_t delta_real = recursion_helpers::find_and_validate_public_input_delta<FF>(
        builder, analyzer, beta_real, gamma_real, pub_inputs_offset_real, public_input_reals);

    auto& arith = builder.blocks.arithmetic;
    const std::vector<size_t> beta_candidate_gates =
        collect_real_witness_gates_in_block<FF>(builder, analyzer, beta_real, arith);
    const std::set<size_t> beta_anchor_gates(beta_candidate_gates.begin(), beta_candidate_gates.end());
    auto beta_gamma_start = recursion_helpers::find_fingerprint_range_containing_any_gate(
        builder, arith, beta_anchor_gates, BETA_GAMMA_ARITHMETIC);
    if (!beta_gamma_start.has_value()) {
        info("validate_public_input_delta_stage failed: could not locate beta/gamma stage from beta witness");
        return result;
    }

    const size_t search_start = *beta_gamma_start + BETA_GAMMA_ARITHMETIC.gate_count;
    if (PUBLIC_INPUT_DELTA_ARITHMETIC.gate_count > arith.size()) {
        return result;
    }
    const size_t last_start = arith.size() - PUBLIC_INPUT_DELTA_ARITHMETIC.gate_count;
    for (size_t start = search_start; start <= last_start; ++start) {
        if (!recursion_helpers::matches_fingerprint_at(builder, arith, start, PUBLIC_INPUT_DELTA_ARITHMETIC)) {
            continue;
        }
        result.is_valid = true;
        result.public_input_delta = delta_real;
        result.arith_start = start;
        result.arith_end = start + PUBLIC_INPUT_DELTA_ARITHMETIC.gate_count;
        return result;
    }

    info(
        "validate_public_input_delta_stage failed: no matching 170-gate arithmetic range found after beta/gamma stage");
    return result;
}

template <typename FF, typename CircuitBuilder>
bool validate_commitment_group_full(CircuitBuilder& builder,
                                    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                    const std::vector<uint32_t>& proof_body_witnesses,
                                    size_t group_idx,
                                    CommitmentReceiveValidationResult* fingerprint_result = nullptr,
                                    bool require_absorption = true)
{
    const size_t base = group_idx * recursion_helpers::FRS_PER_COMMITMENT;
    if (base + 3 >= proof_body_witnesses.size()) {
        info("validate_commitment_group_full failed: group ", group_idx, " out of bounds");
        return false;
    }

    const auto frs = get_commitment_group_witness_indices(proof_body_witnesses, group_idx);
    auto fp = validate_commitment_receive_fingerprint<FF>(builder, analyzer, frs[0], frs[1], frs[2], frs[3]);
    if (!fp.is_valid) {
        info("validate_commitment_group_full failed: fingerprint validation failed for group ", group_idx);
        return false;
    }
    if (!recursion_helpers::validate_oink_commitment<FF>(builder, analyzer, frs[0], frs[1], frs[2], frs[3])) {
        info("validate_commitment_group_full failed: wire-tracing validation failed for group ", group_idx);
        return false;
    }
    if (require_absorption && !recursion_helpers::validate_commitment_transcript_absorption<FF>(
                                  builder, analyzer, frs[0], frs[1], frs[2], frs[3])) {
        info("validate_commitment_group_full failed: transcript absorption validation failed for group ", group_idx);
        return false;
    }

    if (fingerprint_result != nullptr) {
        *fingerprint_result = fp;
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool validate_oink_verifier(CircuitBuilder& builder,
                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                            const acir_format::RecursionConstraint& constraint,
                            const std::vector<uint32_t>& proof_body_witnesses)
{
    if (proof_body_witnesses.size() < recursion_helpers::OINK_PROOF_COMMITMENT_WITNESSES) {
        info("validate_oink_verifier failed: proof_body_witnesses too small");
        return false;
    }
    if (constraint.key.size() < recursion_helpers::VK_METADATA_NUM_FIELDS) {
        info("validate_oink_verifier failed: constraint.key missing VK metadata fields");
        return false;
    }

    const auto oink_gates = extract_oink_squeeze_gates(builder);
    if (oink_gates.size() != recursion_helpers::NUM_OINK_SQUEEZES) {
        info("validate_oink_verifier failed: expected ",
             recursion_helpers::NUM_OINK_SQUEEZES,
             " Oink squeeze gates, found ",
             oink_gates.size());
        return false;
    }

    auto vk_hash = validate_vk_hash_stage<FF>(builder, analyzer, constraint);
    if (!vk_hash.is_valid) {
        info("validate_oink_verifier failed: vk_hash stage invalid");
        return false;
    }
    if (!recursion_helpers::validate_oink_preamble<FF>(builder, analyzer, constraint)) {
        info("validate_oink_verifier failed: legacy preamble checks invalid");
        return false;
    }

    for (size_t group_idx : PRE_ETA_COMMITMENT_GROUPS) {
        if (!validate_commitment_group_full<FF>(builder, analyzer, proof_body_witnesses, group_idx, nullptr, false)) {
            info("validate_oink_verifier failed: pre-eta commitment group ", group_idx, " invalid");
            return false;
        }
    }

    auto eta = validate_eta_stage<FF>(builder, analyzer, oink_gates[0]);
    if (!eta.is_valid) {
        info("validate_oink_verifier failed: eta stage invalid");
        return false;
    }
    if (eta.arith_start <= vk_hash.arith_start) {
        info("validate_oink_verifier failed: eta stage starts before vk_hash stage");
        return false;
    }

    for (size_t group_idx : POST_ETA_COMMITMENT_GROUPS) {
        if (!validate_commitment_group_full<FF>(builder, analyzer, proof_body_witnesses, group_idx, nullptr, false)) {
            info("validate_oink_verifier failed: post-eta commitment group ", group_idx, " invalid");
            return false;
        }
    }

    auto beta_gamma = validate_beta_gamma_stage<FF>(builder, analyzer, oink_gates[1]);
    if (!beta_gamma.is_valid) {
        info("validate_oink_verifier failed: beta_gamma stage invalid");
        return false;
    }
    if (beta_gamma.arith_start <= eta.arith_start) {
        info("validate_oink_verifier failed: beta_gamma stage starts before eta stage");
        return false;
    }

    for (size_t group_idx : POST_BETA_GAMMA_COMMITMENT_GROUPS) {
        if (!validate_commitment_group_full<FF>(builder, analyzer, proof_body_witnesses, group_idx, nullptr, false)) {
            info("validate_oink_verifier failed: post-beta/gamma commitment group ", group_idx, " invalid");
            return false;
        }
    }

    std::vector<uint32_t> public_input_reals;
    public_input_reals.reserve(constraint.public_inputs.size());
    for (uint32_t witness_idx : constraint.public_inputs) {
        public_input_reals.push_back(builder.real_variable_index[witness_idx]);
    }
    auto delta = validate_public_input_delta_stage<FF>(
        builder,
        analyzer,
        beta_gamma.beta,
        beta_gamma.gamma,
        builder.real_variable_index[constraint.key[recursion_helpers::VK_PUB_INPUTS_OFFSET_INDEX]],
        public_input_reals);
    if (!delta.is_valid) {
        info("validate_oink_verifier failed: public_input_delta stage invalid");
        return false;
    }
    if (delta.arith_start <= beta_gamma.arith_start) {
        info("validate_oink_verifier failed: public_input_delta stage starts before beta_gamma stage");
        return false;
    }

    if (!validate_commitment_group_full<FF>(builder, analyzer, proof_body_witnesses, Z_PERM_GROUP, nullptr, false)) {
        info("validate_oink_verifier failed: z_perm commitment invalid");
        return false;
    }

    auto alpha = validate_alpha_stage<FF>(builder, analyzer, oink_gates[2]);
    if (!alpha.is_valid) {
        info("validate_oink_verifier failed: alpha stage invalid");
        return false;
    }
    if (alpha.arith_start <= delta.arith_start) {
        info("validate_oink_verifier failed: alpha stage starts before public_input_delta stage");
        return false;
    }

    info("validate_oink_verifier succeeded. vk_hash at ",
         vk_hash.arith_start,
         ", eta at ",
         eta.arith_start,
         ", beta_gamma at ",
         beta_gamma.arith_start,
         ", public_input_delta at ",
         delta.arith_start,
         ", alpha at ",
         alpha.arith_start);
    return true;
}

/**
 * @brief Validate the Oink-only CHONK pre-sumcheck phase.
 *
 * CHONK invokes Oink with `emit_alpha=false`; therefore this validator checks
 * VK/public-input receipt, eta, beta/gamma, all commitment receives, and the
 * public-input delta, but deliberately does not require an Oink alpha squeeze.
 * Public inputs contain both ACIR public inputs and trailing HidingKernelIO fields.
 */
template <typename FF, typename CircuitBuilder>
ChonkOinkValidationResult validate_chonk_oink(CircuitBuilder& builder,
                                              cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                              const acir_format::RecursionConstraint& constraint,
                                              const std::vector<uint32_t>& public_input_witnesses,
                                              const std::vector<uint32_t>& proof_body_witnesses)
{
    // MegaZK has no memory or log-derivative lookup entities. Its current Oink
    // proof contains 12 commitments in transcript order:
    // w_l/r/o, four ECC-op wires, two databus entities, w_4, one databus
    // inverse, and z_perm.
    static constexpr size_t NUM_CHONK_OINK_COMMITMENTS = 12;

    ChonkOinkValidationResult result;
    result.block_ranges.resize(builder.blocks.get().size(), { SIZE_MAX, SIZE_MAX });
    if (proof_body_witnesses.size() < NUM_CHONK_OINK_COMMITMENTS * recursion_helpers::FRS_PER_COMMITMENT ||
        constraint.key.size() < recursion_helpers::VK_METADATA_NUM_FIELDS || public_input_witnesses.empty()) {
        info("validate_chonk_oink failed: invalid witness layout");
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& poseidon_ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& poseidon_int = poseidon2_helpers::poseidon2_internal_block(builder);
    const auto arith_block_idx = recursion_helpers::find_block_index(builder, arith);
    const auto nnf_block_idx = recursion_helpers::find_block_index(builder, nnf);
    const auto poseidon_ext_block_idx = recursion_helpers::find_block_index(builder, poseidon_ext);
    const auto poseidon_int_block_idx = recursion_helpers::find_block_index(builder, poseidon_int);
    if (!arith_block_idx.has_value() || !nnf_block_idx.has_value() || !poseidon_ext_block_idx.has_value() ||
        !poseidon_int_block_idx.has_value()) {
        info("validate_chonk_oink failed: could not resolve block indices");
        return result;
    }

    auto include_range = [&](const size_t block, const size_t start, const size_t end) {
        auto& range = result.block_ranges.at(block);
        range.first = range.first == SIZE_MAX ? start : std::min(range.first, start);
        range.second = range.second == SIZE_MAX ? end : std::max(range.second, end);
    };

    const auto vk_hash = validate_vk_hash_stage<FF>(builder, analyzer, constraint);
    if (!vk_hash.is_valid || !recursion_helpers::validate_oink_preamble<FF>(builder, analyzer, constraint)) {
        info("validate_chonk_oink failed: VK/preamble");
        return result;
    }
    include_range(*arith_block_idx, vk_hash.arith_start, vk_hash.arith_end);
    include_range(*poseidon_ext_block_idx,
                  vk_hash.poseidon2_ext_start,
                  vk_hash.poseidon2_ext_start + VK_HASH_POSEIDON2_EXT.gate_count);
    include_range(*poseidon_int_block_idx,
                  vk_hash.poseidon2_int_start,
                  vk_hash.poseidon2_int_start + VK_HASH_POSEIDON2_INT.gate_count);
    auto find_at_or_after = [&](auto& block, const size_t first, const auto& fingerprint) {
        if (fingerprint.gate_count > block.size()) {
            return std::optional<size_t>{};
        }
        const size_t last = block.size() - fingerprint.gate_count;
        for (size_t start = first; start <= last; ++start) {
            if (recursion_helpers::matches_fingerprint_at(builder, block, start, fingerprint)) {
                return std::optional<size_t>{ start };
            }
        }
        return std::optional<size_t>{};
    };

    const auto wire_arith_start = find_at_or_after(arith, vk_hash.arith_end, CHONK_WIRE_ARITHMETIC);
    std::optional<size_t> wire_nnf_start;
    if (wire_arith_start.has_value()) {
        const auto linked_nnf = recursion_helpers::collect_linked_gates(
            builder, analyzer, arith, *wire_arith_start, *wire_arith_start + CHONK_WIRE_ARITHMETIC.gate_count, nnf);
        for (const size_t gate : linked_nnf) {
            const auto candidate =
                recursion_helpers::find_fingerprint_range_containing_gate(builder, nnf, gate, CHONK_WIRE_NNF);
            if (!candidate.has_value()) {
                continue;
            }
            const size_t w4_start = *candidate + CHONK_WIRE_NNF.gate_count;
            const size_t logderiv_start = w4_start + CHONK_SINGLE_RECEIVE_NNF.gate_count;
            const size_t z_perm_start = logderiv_start + CHONK_LOGDERIV_NNF.gate_count;
            const size_t kernel_io_start = z_perm_start + CHONK_SINGLE_RECEIVE_NNF.gate_count;
            if (recursion_helpers::matches_fingerprint_at(builder, nnf, w4_start, CHONK_SINGLE_RECEIVE_NNF) &&
                recursion_helpers::matches_fingerprint_at(builder, nnf, logderiv_start, CHONK_LOGDERIV_NNF) &&
                recursion_helpers::matches_fingerprint_at(builder, nnf, z_perm_start, CHONK_SINGLE_RECEIVE_NNF) &&
                recursion_helpers::matches_fingerprint_at(builder, nnf, kernel_io_start, CHONK_KERNEL_IO_NNF)) {
                wire_nnf_start = candidate;
                break;
            }
        }
    }
    if (!wire_arith_start.has_value() || !wire_nnf_start.has_value() || *wire_arith_start < vk_hash.arith_end) {
        info("validate_chonk_oink failed: wire commitment stage arith=",
             wire_arith_start.has_value(),
             " nnf=",
             wire_nnf_start.has_value());
        return result;
    }
    const size_t w4_arith_start = *wire_arith_start + CHONK_WIRE_ARITHMETIC.gate_count;
    const size_t w4_nnf_start = *wire_nnf_start + CHONK_WIRE_NNF.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, arith, w4_arith_start, CHONK_SINGLE_RECEIVE_ARITHMETIC) ||
        !recursion_helpers::matches_fingerprint_at(builder, nnf, w4_nnf_start, CHONK_SINGLE_RECEIVE_NNF)) {
        info("validate_chonk_oink failed: w4 commitment stage");
        return result;
    }

    const size_t logderiv_arith_start = w4_arith_start + CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count;
    const size_t logderiv_nnf_start = w4_nnf_start + CHONK_SINGLE_RECEIVE_NNF.gate_count;
    const size_t logderiv_ext_start = vk_hash.poseidon2_ext_start + VK_HASH_POSEIDON2_EXT.gate_count;
    const size_t logderiv_int_start = vk_hash.poseidon2_int_start + VK_HASH_POSEIDON2_INT.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, nnf, logderiv_nnf_start, CHONK_LOGDERIV_NNF)) {
        info("validate_chonk_oink failed: inverse commitment NNF stage");
        return result;
    }

    const auto kernel_arith_start = find_at_or_after(arith, logderiv_arith_start, CHONK_KERNEL_IO_ARITHMETIC);
    if (!kernel_arith_start.has_value() ||
        *kernel_arith_start < logderiv_arith_start + 2 * CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count) {
        info("validate_chonk_oink failed: kernel boundary");
        return result;
    }
    const size_t z_arith_start = *kernel_arith_start - CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, arith, z_arith_start, CHONK_SINGLE_RECEIVE_ARITHMETIC)) {
        info("validate_chonk_oink failed: z_perm arithmetic stage");
        return result;
    }

    size_t inverse_arith_start = SIZE_MAX;
    for (size_t start = logderiv_arith_start; start < z_arith_start; ++start) {
        if (recursion_helpers::matches_fingerprint_at(builder, arith, start, CHONK_SINGLE_RECEIVE_ARITHMETIC)) {
            inverse_arith_start = start;
        }
    }
    if (inverse_arith_start == SIZE_MAX) {
        info("validate_chonk_oink failed: inverse commitment arithmetic stage");
        return result;
    }
    const size_t delta_arith_start = inverse_arith_start + CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count;

    // Transcript sponge rate is three field elements. The fixed hiding proof
    // requires 24 permutations for beta/gamma; every three additional ACIR
    // public inputs add one permutation (10 external and 57 internal gates).
    constexpr size_t TRANSCRIPT_SPONGE_RATE = 3;
    constexpr size_t BASE_TRANSCRIPT_PERMUTATIONS = 24;
    constexpr size_t EXTERNAL_GATES_PER_PERMUTATION = 10;
    constexpr size_t INTERNAL_GATES_PER_PERMUTATION = 57;
    const size_t extra_permutations =
        (constraint.public_inputs.size() + TRANSCRIPT_SPONGE_RATE - 1) / TRANSCRIPT_SPONGE_RATE;
    const size_t transcript_permutations = BASE_TRANSCRIPT_PERMUTATIONS + extra_permutations;
    const size_t logderiv_ext_end = logderiv_ext_start + transcript_permutations * EXTERNAL_GATES_PER_PERMUTATION;
    const size_t logderiv_int_end = logderiv_int_start + transcript_permutations * INTERNAL_GATES_PER_PERMUTATION;
    if (logderiv_ext_end > poseidon_ext.size() || logderiv_int_end > poseidon_int.size()) {
        info("validate_chonk_oink failed: beta/gamma Poseidon ranges");
        return result;
    }
    for (size_t permutation = 0; permutation < transcript_permutations; ++permutation) {
        const size_t ext_start = logderiv_ext_start + permutation * EXTERNAL_GATES_PER_PERMUTATION;
        const size_t int_start = logderiv_int_start + permutation * INTERNAL_GATES_PER_PERMUTATION;
        if (!recursion_helpers::matches_fingerprint_at(
                builder, poseidon_ext, ext_start, CHONK_TRANSCRIPT_PERMUTATION_POSEIDON2_EXT) ||
            !recursion_helpers::matches_fingerprint_at(
                builder, poseidon_int, int_start, CHONK_TRANSCRIPT_PERMUTATION_POSEIDON2_INT)) {
            info("validate_chonk_oink failed: transcript permutation ", permutation);
            return result;
        }
    }

    std::set<uint32_t> poseidon_reals;
    auto collect_block_reals = [&](auto& block, const size_t start, const size_t end, auto&& visit) {
        for (size_t gate = start; gate < end; ++gate) {
            for (const uint32_t witness :
                 { block.w_l()[gate], block.w_r()[gate], block.w_o()[gate], block.w_4()[gate] }) {
                visit(builder.real_variable_index.at(witness));
            }
        }
    };
    collect_block_reals(
        poseidon_ext, logderiv_ext_start, logderiv_ext_end, [&](const uint32_t real) { poseidon_reals.insert(real); });
    collect_block_reals(
        poseidon_int, logderiv_int_start, logderiv_int_end, [&](const uint32_t real) { poseidon_reals.insert(real); });

    std::vector<uint32_t> challenge_candidates;
    collect_block_reals(arith, delta_arith_start, z_arith_start, [&](const uint32_t real) {
        if (poseidon_reals.contains(real) &&
            std::find(challenge_candidates.begin(), challenge_candidates.end(), real) == challenge_candidates.end()) {
            challenge_candidates.push_back(real);
        }
    });
    if (challenge_candidates.size() < 2) {
        info("validate_chonk_oink failed: beta/gamma candidates");
        return result;
    }

    include_range(*arith_block_idx, *wire_arith_start, z_arith_start + CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count);
    include_range(*nnf_block_idx, *wire_nnf_start, logderiv_nnf_start + CHONK_LOGDERIV_NNF.gate_count);
    include_range(*poseidon_ext_block_idx, logderiv_ext_start, logderiv_ext_end);
    include_range(*poseidon_int_block_idx, logderiv_int_start, logderiv_int_end);

    std::vector<uint32_t> public_input_reals;
    public_input_reals.reserve(public_input_witnesses.size());
    size_t previous_absorption_gate = 0;
    bool have_previous_absorption = false;
    for (const uint32_t witness : public_input_witnesses) {
        const uint32_t real = builder.real_variable_index.at(witness);
        public_input_reals.push_back(real);
        bool absorbed = false;
        size_t absorption_gate = SIZE_MAX;
        for (const auto& [block, gate] : analyzer.get_variable_gates(real)) {
            const bool arithmetic_absorption = block == *arith_block_idx && gate >= logderiv_arith_start &&
                                               gate < z_arith_start &&
                                               !arith.gate_selector_for(GateKind::Arith)[gate].is_zero();
            const bool external_absorption = block == *poseidon_ext_block_idx && gate >= logderiv_ext_start &&
                                             gate < logderiv_ext_end &&
                                             !poseidon_ext.gate_selector_for(GateKind::Poseidon2Ext)[gate].is_zero();
            const bool internal_absorption = block == *poseidon_int_block_idx && gate >= logderiv_int_start &&
                                             gate < logderiv_int_end &&
                                             !poseidon_int.gate_selector_for(GateKind::Poseidon2Int)[gate].is_zero();
            if (arithmetic_absorption || external_absorption || internal_absorption) {
                absorbed = true;
                if (arithmetic_absorption) {
                    absorption_gate = std::min(absorption_gate, gate);
                }
            }
        }
        if (!absorbed || absorption_gate == SIZE_MAX ||
            (have_previous_absorption && absorption_gate <= previous_absorption_gate)) {
            info("validate_chonk_oink failed: PI absorption for witness ", witness);
            return result;
        }
        previous_absorption_gate = absorption_gate;
        have_previous_absorption = true;
    }

    if (!validate_public_input_delta_selector_pattern(
            builder, delta_arith_start, z_arith_start, public_input_reals.size())) {
        info("validate_chonk_oink failed: public_input_delta selector pattern");
        return result;
    }

    uint32_t beta = UINT32_MAX;
    uint32_t gamma = UINT32_MAX;
    uint32_t delta = UINT32_MAX;
    size_t matching_challenge_pairs = 0;
    for (const uint32_t beta_candidate : challenge_candidates) {
        for (const uint32_t gamma_candidate : challenge_candidates) {
            if (beta_candidate == gamma_candidate) {
                continue;
            }
            const uint32_t candidate_delta = recursion_helpers::find_and_validate_public_input_delta<FF>(
                builder,
                analyzer,
                beta_candidate,
                gamma_candidate,
                builder.real_variable_index.at(constraint.key[recursion_helpers::VK_PUB_INPUTS_OFFSET_INDEX]),
                public_input_reals,
                delta_arith_start,
                z_arith_start);
            if (candidate_delta != UINT32_MAX) {
                beta = beta_candidate;
                gamma = gamma_candidate;
                delta = candidate_delta;
                ++matching_challenge_pairs;
            }
        }
    }
    if (delta == UINT32_MAX || matching_challenge_pairs != 1) {
        info("validate_chonk_oink failed: public_input_delta replay");
        return result;
    }
    for (const auto& [block, gate] : analyzer.get_variable_gates(delta)) {
        if (&builder.blocks.get()[block] == &arith && gate >= delta_arith_start && gate < z_arith_start) {
            include_range(block, gate, gate + 1);
        }
    }

    const size_t z_nnf_start = logderiv_nnf_start + CHONK_LOGDERIV_NNF.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder, nnf, z_nnf_start, CHONK_SINGLE_RECEIVE_NNF)) {
        info("validate_chonk_oink failed: z_perm fixed stage");
        return result;
    }
    include_range(*arith_block_idx, z_arith_start, z_arith_start + CHONK_SINGLE_RECEIVE_ARITHMETIC.gate_count);
    include_range(*nnf_block_idx, z_nnf_start, z_nnf_start + CHONK_SINGLE_RECEIVE_NNF.gate_count);

    result.beta = beta;
    result.gamma = gamma;
    result.public_input_delta = delta;
    result.is_valid = true;
    return result;
}

} // namespace OinkVerifierValidation
