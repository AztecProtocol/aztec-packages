#pragma once

/**
 * @file sha256_circuit_helpers.hpp
 * @brief Helper types and functions for SHA256 compression constraint validation
 *
 * Provides range list filler validation, selector hashing for lookup gates,
 * and data structures for the StaticAnalyzerAcir SHA256 processing.
 */

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include <vector>

namespace sha256_helpers {

constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;

inline size_t hash_combine(size_t lhs, size_t rhs)
{
    static constexpr size_t HASH_COMBINE_CONSTANT = 0x9e3779b9;
    return lhs ^ (rhs + HASH_COMBINE_CONSTANT + (lhs << 6) + (lhs >> 2));
}

/**
 * @brief Find all unconstrained arithmetic gates (all selectors zero)
 *
 * These gates are created by process_range_list as padding during range constraint finalization.
 */
template <typename Builder> std::vector<size_t> find_unconstrained_arithmetic_gates(Builder& builder)
{
    auto& arith = builder.blocks.arithmetic;
    std::vector<size_t> result;

    for (size_t i = 0; i < arith.size(); ++i) {
        if (arith.q_m()[i].is_zero() && arith.q_1()[i].is_zero() && arith.q_2()[i].is_zero() &&
            arith.q_3()[i].is_zero() && arith.q_4()[i].is_zero() &&
            arith.gate_selector_for(bb::GateKind::Arith)[i].is_zero()) {
            result.push_back(i);
        }
    }
    return result;
}

/**
 * @brief Info about unconstrained gates belonging to a specific range list
 */
struct RangeListFillerInfo {
    uint64_t target_range;
    bool range_list_exists;
    size_t expected_filler_count;
    size_t expected_gate_count;
    size_t found_filler_count;
    size_t found_gate_count;
    size_t total_unconstrained_gates;
    bool count_matches;
};

/**
 * @brief Validate unconstrained arithmetic gates for a range list's filler variables
 *
 * create_range_list(target_range) creates filler variables and places them in
 * unconstrained arithmetic gates. Filtering by range_tag yields exactly the fillers.
 */
template <typename Builder> RangeListFillerInfo validate_range_list_fillers(Builder& builder, uint64_t target_range)
{
    constexpr uint64_t STEP = Builder::DEFAULT_PLOOKUP_RANGE_STEP_SIZE; // 3
    constexpr size_t GATE_WIDTH = Builder::NUM_WIRES;                   // 4

    RangeListFillerInfo info;
    info.target_range = target_range;
    info.range_list_exists = (builder.range_lists.count(target_range) > 0);

    uint64_t num_multiples = target_range / STEP;
    info.expected_filler_count = static_cast<size_t>(num_multiples + 1 + 1);

    size_t padded_count = info.expected_filler_count;
    size_t padding = (GATE_WIDTH - (padded_count % GATE_WIDTH)) % GATE_WIDTH;
    padded_count += padding;
    info.expected_gate_count = padded_count / GATE_WIDTH;

    uint32_t range_tag = 0;
    if (info.range_list_exists) {
        range_tag = builder.range_lists.at(target_range).range_tag;
    }

    auto unconstrained_gates = find_unconstrained_arithmetic_gates(builder);
    info.total_unconstrained_gates = unconstrained_gates.size();
    info.found_filler_count = 0;
    info.found_gate_count = 0;

    auto& arith = builder.blocks.arithmetic;
    for (size_t gate_idx : unconstrained_gates) {
        std::array<uint32_t, 4> wire_indices = {
            arith.w_l()[gate_idx], arith.w_r()[gate_idx], arith.w_o()[gate_idx], arith.w_4()[gate_idx]
        };
        bool gate_has_tagged_wire = false;
        for (uint32_t wire_idx : wire_indices) {
            uint32_t real_idx = builder.real_variable_index[wire_idx];
            uint32_t tag = builder.real_variable_tags[real_idx];
            if (tag == range_tag && range_tag != bb::DEFAULT_TAG) {
                info.found_filler_count++;
                gate_has_tagged_wire = true;
            }
        }
        if (gate_has_tagged_wire) {
            info.found_gate_count++;
        }
    }

    info.count_matches = (info.found_filler_count == info.expected_filler_count);
    return info;
}

/**
 * @brief Compute selector hash over ALL selectors for a contiguous range of gates.
 */
template <typename Block>
size_t compute_selector_hash(size_t combined_hash, Block& block, size_t start_idx, size_t end_idx)
{
    auto selectors = block.get_selectors();
    for (size_t gate = start_idx; gate <= end_idx; ++gate) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            auto reduced = selectors[s][gate].reduce_once();
            combined_hash = hash_combine(combined_hash, reduced.data[0]);
        }
    }
    return combined_hash;
}

/**
 * @brief Compute selector hash excluding q_3 (table_index) for a contiguous range of gates.
 *
 * table_index varies per circuit context, so excluding it makes the hash stable
 * across different circuits using the same lookup table type.
 */
template <typename Block>
size_t compute_selector_hash_without_table_index(size_t combined_hash, Block& block, size_t start_idx, size_t end_idx)
{
    static constexpr size_t Q3_SELECTOR_INDEX = 4;
    auto selectors = block.get_selectors();
    for (size_t gate = start_idx; gate <= end_idx; ++gate) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            if (s == Q3_SELECTOR_INDEX) {
                continue;
            }
            auto reduced = selectors[s][gate].reduce_once();
            combined_hash = hash_combine(combined_hash, reduced.data[0]);
        }
    }
    return combined_hash;
}

/**
 * @brief Update selector hash for a single gate.
 * @details Updates the combined_hash by hashing all selectors of the gate at gate_idx.
 * @param combined_hash The current hash value to update (passed by reference)
 * @param block The block containing the gate
 * @param gate_idx The index of the gate to hash
 * @return The updated hash value (same as combined_hash after update)
 */
template <typename Block> size_t update_selector_hash(size_t& combined_hash, Block& block, size_t gate_idx)
{
    auto selectors = block.get_selectors();
    for (size_t s = 0; s < selectors.size(); ++s) {
        auto reduced = selectors[s][gate_idx].reduce_once();
        combined_hash = hash_combine(combined_hash, reduced.data[0]);
    }
    return combined_hash;
}

// Pinned selector hashes for SHA256 lookup gate blocks (excluding q_3/table_index).
// These are deterministic hashes over all selectors except q_3 for each lookup table type.
static constexpr size_t SHA256_CH_INPUT_HASH = 3688234554709237331ULL;        // choose_with_sigma1 INPUT (3 gates)
static constexpr size_t SHA256_CH_OUTPUT_HASH = 13894510414391467752ULL;      // choose_with_sigma1 OUTPUT (16 gates)
static constexpr size_t SHA256_MAJ_INPUT_HASH = 6873917255644180369ULL;       // majority_with_sigma0 INPUT (3 gates)
static constexpr size_t SHA256_MAJ_OUTPUT_HASH = 18275753415692160175ULL;     // majority_with_sigma0 OUTPUT (11 gates)
static constexpr size_t SHA256_WITNESS_INPUT_HASH = 7251786320398586631ULL;   // convert_witness INPUT (4 gates)
static constexpr size_t SHA256_WITNESS_OUTPUT_HASH = 18275753415692160175ULL; // convert_witness OUTPUT (11 gates)

/**
 * @brief Parameters for validate_sha256_sparse_function, which validates both
 * choose_with_sigma1 and majority_with_sigma0 (they share the same gate structure).
 */
enum class Sha256SparseFunctionType {
    CHOOSE,  // Uses lookup[C2][2] for sparse_limb in first add_two
    MAJORITY // Uses lookup[C2][1] for sparse_limb in first add_two
};

struct Sha256SparseFunctionParams {
    Sha256SparseFunctionType type;
    uint32_t primary_sparse_real;
    uint32_t fst_sparse_real;
    uint32_t snd_sparse_real;
    size_t input_gate_count;     // CH_INPUT: 3, MAJ_INPUT: 3
    size_t output_gate_count;    // CH_OUTPUT: 16, MAJ_OUTPUT: 11
    size_t input_selector_hash;  // Pinned hash for INPUT lookup gates (0 = skip check)
    size_t output_selector_hash; // Pinned hash for OUTPUT lookup gates (0 = skip check)
    const char* log_prefix;      // "choose" or "majority" for log messages
};

struct Sha256SparseFunctionResult {
    bool valid;
    uint32_t primary_sparse_real; // sparse form of primary input (e.sparse or a.sparse), IS_CONSTANT if not found
    uint32_t result_real;         // output of the OUTPUT lookup (ch or maj result), IS_CONSTANT if not found
};

struct Sha256RoundState {
    uint32_t a, b, c, d, e, f, g, h;
    uint32_t b_sparse, c_sparse;   // majority sparse forms (for b and c)
    uint32_t f_sparse, g_sparse;   // choose sparse forms (for f and g)
    uint32_t w_i_real;             // discovered w[i] witness index for extend_witness validation
    size_t lookup_lower_bound = 0; // skip lookup gates below this index (past setup lookups)
};

} // namespace sha256_helpers
