#pragma once

/**
 * @file sha256_circuit_helpers.hpp
 * @brief Helper functions for exploring SHA256 compression circuit patterns
 *
 * Provides gate classification, witness-to-gate mapping, and range constraint
 * pattern detection using the StaticAnalyzer's pre-built variable index.
 */

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include <array>
#include <map>
#include <string>
#include <vector>

namespace sha256_helpers {

constexpr size_t HASH_COMBINE_CONSTANT = 0x9e3779b9;
// Block names matching UltraTraceBlockData::get() order
inline const std::array<std::string, 9> BLOCK_NAMES = {
    "pub_inputs", "lookup", "arithmetic",         "delta_range",       "elliptic",
    "memory",     "nnf",    "poseidon2_external", "poseidon2_internal"
};

/**
 * @brief Classification of arithmetic gates by selector pattern
 */
enum class GateClassification {
    UNCONSTRAINED, // all selectors zero (padding from range list processing)
    FIX_WITNESS,   // q_1=1, q_arith=1, others zero (from put_constant_variable)
    BIG_MUL_ADD,   // q_arith!=0, q_m!=0, q_4!=0 (big_mul_add_gate)
    ADD,           // q_arith=1, q_3=-1, q_m=0 (linear combination into w_o)
    OTHER
};

inline std::string gate_classification_to_string(GateClassification c)
{
    switch (c) {
    case GateClassification::UNCONSTRAINED:
        return "UNCONSTRAINED";
    case GateClassification::FIX_WITNESS:
        return "FIX_WITNESS";
    case GateClassification::BIG_MUL_ADD:
        return "BIG_MUL_ADD";
    case GateClassification::ADD:
        return "ADD";
    case GateClassification::OTHER:
        return "OTHER";
    }
    return "UNKNOWN";
}

/**
 * @brief Reference to a specific gate where a witness appears
 */
struct WitnessGateRef {
    size_t block_idx;
    std::string block_name;
    size_t gate_idx;
    std::string wire_name; // "w_l", "w_r", "w_o", "w_4"
};

/**
 * @brief Full gate mapping info for a single witness
 */
struct WitnessGateInfo {
    uint32_t real_idx = 0;
    std::vector<WitnessGateRef> gate_refs;
    std::map<std::string, size_t> block_counts; // block_name -> count
};

/**
 * @brief Classify an arithmetic gate by its selector pattern
 *
 * @param builder The circuit builder
 * @param gate_idx Gate index within the arithmetic block
 * @return GateClassification enum value
 */
template <typename Builder> GateClassification classify_arithmetic_gate(Builder& builder, size_t gate_idx)
{
    using FF = typename Builder::FF;
    auto& arith = builder.blocks.arithmetic;

    FF q_m = arith.q_m()[gate_idx];
    FF q_1 = arith.q_1()[gate_idx];
    FF q_2 = arith.q_2()[gate_idx];
    FF q_3 = arith.q_3()[gate_idx];
    FF q_4 = arith.q_4()[gate_idx];
    FF q_arith = arith.q_arith()[gate_idx];

    if (q_m.is_zero() && q_1.is_zero() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_arith.is_zero()) {
        return GateClassification::UNCONSTRAINED;
    }

    if (q_arith == FF::one() && q_1 == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_m.is_zero()) {
        return GateClassification::FIX_WITNESS;
    }

    if (!q_arith.is_zero() && !q_m.is_zero() && !q_4.is_zero()) {
        return GateClassification::BIG_MUL_ADD;
    }

    if (q_arith == FF::one() && q_3 == FF::neg_one() && q_m.is_zero()) {
        return GateClassification::ADD;
    }

    return GateClassification::OTHER;
}

/**
 * @brief Find all unconstrained arithmetic gates (all selectors zero)
 *
 * These gates are created by process_range_list as padding during range constraint finalization.
 *
 * @param builder The circuit builder
 * @return Vector of gate indices within the arithmetic block
 */
template <typename Builder> std::vector<size_t> find_unconstrained_arithmetic_gates(Builder& builder)
{
    auto& arith = builder.blocks.arithmetic;
    std::vector<size_t> result;

    for (size_t i = 0; i < arith.size(); ++i) {
        if (arith.q_m()[i].is_zero() && arith.q_1()[i].is_zero() && arith.q_2()[i].is_zero() &&
            arith.q_3()[i].is_zero() && arith.q_4()[i].is_zero() && arith.q_arith()[i].is_zero()) {
            result.push_back(i);
        }
    }
    return result;
}

/**
 * @brief Map a single witness to all gates that reference it
 *
 * Uses StaticAnalyzer's pre-built variable index for O(1) lookup.
 *
 * @param analyzer The StaticAnalyzer (provides get_variable_gates)
 * @param builder The circuit builder (for resolving wire indices)
 * @param witness_real_idx The real variable index of the witness
 * @return WitnessGateInfo with all gate references and block counts
 */
template <typename FF, typename CircuitBuilder>
WitnessGateInfo map_witness_to_gates(cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                     CircuitBuilder& builder,
                                     uint32_t witness_real_idx)
{
    WitnessGateInfo info;
    info.real_idx = witness_real_idx;

    const auto gates = analyzer.get_variable_gates(witness_real_idx);
    auto all_blocks = builder.blocks.get();

    for (const auto& [block_idx, gate_idx] : gates) {
        if (block_idx >= BLOCK_NAMES.size()) {
            continue;
        }

        auto& block = all_blocks[block_idx];
        const std::string& block_name = BLOCK_NAMES[block_idx];

        // Check which wire(s) match
        std::array<std::pair<std::string, uint32_t>, 4> wires = { { { "w_l", block.w_l()[gate_idx] },
                                                                    { "w_r", block.w_r()[gate_idx] },
                                                                    { "w_o", block.w_o()[gate_idx] },
                                                                    { "w_4", block.w_4()[gate_idx] } } };

        for (const auto& [wire_name, wire_idx] : wires) {
            if (builder.real_variable_index[wire_idx] == witness_real_idx) {
                info.gate_refs.push_back(WitnessGateRef{ block_idx, block_name, gate_idx, wire_name });
                info.block_counts[block_name]++;
            }
        }
    }

    return info;
}

/**
 * @brief Map multiple witnesses to their gates
 *
 * @param analyzer The StaticAnalyzer
 * @param builder The circuit builder
 * @param witness_indices Vector of raw witness indices (will be resolved to real indices)
 * @return Map from raw witness index to WitnessGateInfo
 */
template <typename FF, typename CircuitBuilder>
std::map<uint32_t, WitnessGateInfo> map_witnesses_to_gates(cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                           CircuitBuilder& builder,
                                                           const std::vector<uint32_t>& witness_indices)
{
    std::map<uint32_t, WitnessGateInfo> result;
    for (uint32_t idx : witness_indices) {
        uint32_t real_idx = builder.real_variable_index[idx];
        result[idx] = map_witness_to_gates(analyzer, builder, real_idx);
    }
    return result;
}

/**
 * @brief Print detailed gate info for a witness
 *
 * @param info The WitnessGateInfo to print
 * @param witness_name Human-readable name for the witness
 * @param builder The circuit builder (for classifying arithmetic gates)
 */
template <typename Builder>
void print_witness_gate_info(const WitnessGateInfo& info, const std::string& witness_name, Builder& builder)
{
    std::cout << "  " << witness_name << " (real_idx=" << info.real_idx << "): ";
    size_t total = 0;
    for (const auto& [block_name, count] : info.block_counts) {
        std::cout << block_name << ":" << count << " ";
        total += count;
    }
    std::cout << "(total=" << total << ")" << std::endl;

    // For arithmetic gates, print classification
    for (const auto& ref : info.gate_refs) {
        if (ref.block_name == "arithmetic") {
            auto cls = classify_arithmetic_gate(builder, ref.gate_idx);
            std::cout << "    arith gate " << ref.gate_idx << " [" << ref.wire_name
                      << "]: " << gate_classification_to_string(cls) << std::endl;
        }
    }
}

/**
 * @brief Print a histogram of arithmetic gate classifications
 *
 * @param builder The circuit builder
 */
template <typename Builder> void print_arithmetic_gate_histogram(Builder& builder)
{
    auto& arith = builder.blocks.arithmetic;
    std::map<GateClassification, size_t> histogram;

    for (size_t i = 0; i < arith.size(); ++i) {
        auto cls = classify_arithmetic_gate(builder, i);
        histogram[cls]++;
    }

    std::cout << "\n=== Arithmetic Gate Histogram ===" << std::endl;
    std::cout << "  Total gates: " << arith.size() << std::endl;
    for (const auto& [cls, count] : histogram) {
        std::cout << "  " << gate_classification_to_string(cls) << ": " << count << std::endl;
    }
}

/**
 * @brief Info about unconstrained gates belonging to a specific range list
 */
struct RangeListFillerInfo {
    uint64_t target_range;
    bool range_list_exists;
    size_t expected_filler_count;     // filler variable indices from create_range_list
    size_t expected_gate_count;       // ceil(expected_filler_count / 4)
    size_t found_filler_count;        // wires in unconstrained gates matching range_tag
    size_t found_gate_count;          // unconstrained gates containing at least one tagged wire
    size_t total_unconstrained_gates; // total unconstrained arithmetic gates in circuit
    bool count_matches;               // found_filler_count == expected_filler_count
};

/**
 * @brief Validate unconstrained arithmetic gates for a range list's filler variables
 *
 * create_range_list(target_range) creates filler variables with values
 * 0, STEP, 2*STEP, ..., target_range, assigns them the range list's range_tag,
 * and places them in unconstrained arithmetic gates via create_unconstrained_gates.
 * This happens ONCE per target_range — subsequent calls to create_small_range_constraint
 * with the same target_range only tag sublimbs and add them to variable_indices.
 *
 * Sublimbs are NOT placed in unconstrained gates (they appear in decompose chain gates).
 * Therefore, filtering unconstrained gate wires by range_tag yields exactly the fillers.
 *
 * Padding wires (zero_idx) have DEFAULT_TAG and are excluded from the count.
 *
 * @param builder The circuit builder (provides range_lists, real_variable_tags, arithmetic block)
 * @param target_range The target range value to validate
 * @return RangeListFillerInfo with validation results
 */
template <typename Builder> RangeListFillerInfo validate_range_list_fillers(Builder& builder, uint64_t target_range)
{
    constexpr uint64_t STEP = Builder::DEFAULT_PLOOKUP_RANGE_STEP_SIZE; // 3
    constexpr size_t GATE_WIDTH = Builder::NUM_WIRES;                   // 4

    RangeListFillerInfo info;
    info.target_range = target_range;
    info.range_list_exists = (builder.range_lists.count(target_range) > 0);

    // Expected filler count from create_range_list:
    // Loop: 0, STEP, 2*STEP, ..., (num_multiples * STEP) → (num_multiples + 1) entries
    // Plus 1 explicit target_range entry (may duplicate last loop value)
    uint64_t num_multiples = target_range / STEP;
    info.expected_filler_count = static_cast<size_t>(num_multiples + 1 + 1);

    // Gate count: fillers padded to multiple of GATE_WIDTH, packed 4-per-gate
    size_t padded_count = info.expected_filler_count;
    size_t padding = (GATE_WIDTH - (padded_count % GATE_WIDTH)) % GATE_WIDTH;
    padded_count += padding;
    info.expected_gate_count = padded_count / GATE_WIDTH;

    // Get the range_tag for this range list
    uint32_t range_tag = 0;
    if (info.range_list_exists) {
        range_tag = builder.range_lists.at(target_range).range_tag;
    }

    // Scan unconstrained arithmetic gates and count wires matching range_tag
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
 * @brief Print range list filler validation info
 */
inline void print_range_list_filler_info(const RangeListFillerInfo& info)
{
    std::cout << "  target_range=" << info.target_range << ": exists=" << info.range_list_exists
              << " expected_fillers=" << info.expected_filler_count << " found_fillers=" << info.found_filler_count
              << " expected_gates=" << info.expected_gate_count << " found_gates=" << info.found_gate_count
              << " total_unconstrained=" << info.total_unconstrained_gates << " count_matches=" << info.count_matches
              << std::endl;
}

inline size_t hash_combine(size_t lhs, size_t rhs)
{
    return lhs ^ (rhs + HASH_COMBINE_CONSTANT + (lhs << 6) + (lhs >> 2));
}

/**
 * @brief Compute a deterministic hash of selectors in a block range
 *
 * Uses Boost-style hash_combine:
 *   combined = combined ^ (element_hash + 0x9e3779b9 + (combined << 6) + (combined >> 2))
 */
template <typename Block>
size_t compute_selector_hash(size_t combined_hash, Block& block, size_t start_idx, size_t end_idx)
{
    auto selectors = block.get_selectors();
    for (size_t gate = start_idx; gate <= end_idx; ++gate) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            uint64_t val = static_cast<uint64_t>(uint256_t(selectors[s][gate]));
            combined_hash = hash_combine(combined_hash, std::hash<uint64_t>()(val));
        }
    }
    return combined_hash;
}

/**
 * @brief Check if a gate has all selectors zero (unconstrained / filler gate)
 */
template <typename Block> bool is_gate_unconstrained(Block& block, size_t gate_idx)
{
    auto selectors = block.get_selectors();
    for (size_t s = 0; s < selectors.size(); ++s) {
        if (static_cast<uint64_t>(uint256_t(selectors[s][gate_idx])) != 0) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Compute a deterministic hash of selectors for specific gate indices
 */
template <typename Block>
size_t compute_selector_hash(size_t combined_hash, Block& block, const std::vector<size_t>& gate_indices)
{
    auto selectors = block.get_selectors();
    for (size_t gate : gate_indices) {
        for (size_t s = 0; s < selectors.size(); ++s) {
            uint64_t val = static_cast<uint64_t>(uint256_t(selectors[s][gate]));
            combined_hash = hash_combine(combined_hash, std::hash<uint64_t>()(val));
        }
    }
    return combined_hash;
}

} // namespace sha256_helpers
