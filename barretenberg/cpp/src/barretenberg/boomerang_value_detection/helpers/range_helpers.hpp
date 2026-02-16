/**
 * @file range_helpers.hpp
 * @brief Free functions for range constraint validation
 * @details Extracted from StaticAnalyzerAcir_ to be usable by other helpers (e.g. cycle_scalar_helpers).
 * Every helper follows the same FilterFunctionBuilder pattern as the rest of the helpers.
 */
#pragma once

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/helpers/filter_function_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace cdg {

/**
 * @brief Check if a boolean gate exists for the given witness
 * @details A boolean gate constrains w_l² - w_l = 0, i.e. w_l ∈ {0, 1}.
 *          Selectors: q_arith=1, q_m=1, q_1=-1, q_2=0, q_3=0, q_4=0, q_c=0
 *          The w_l wire is the witness being constrained, and the gate has w_l in both w_l and w_r positions
 *          (since q_m multiplies w_l * w_r).
 * @details mirrors bool_t::assert_bool
 */
template <typename FF, typename CircuitBuilder>
bool is_boolean_gate_exists(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                            CircuitBuilder& builder,
                            uint32_t witness_idx)
{
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(witness_idx)
                             .set_q_m(FF::one())
                             .set_q_1(FF(-1))
                             .set_q_2(FF::zero())
                             .set_q_3(FF::zero())
                             .set_q_4(FF::zero())
                             .set_q_c(FF::zero())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(witness_idx);
    auto filtered_gates = filter_helper.filter_gates(gates);
    return !filtered_gates.empty();
}

/**
 * @brief Check if a witness is in a range_list for the given target_range
 * @details create_small_range_constraint(idx, target_range) adds the variable to range_lists[target_range].
 *          This function checks if the witness is present in that list.
 */
template <typename FF, typename CircuitBuilder>
bool is_in_range_list(CircuitBuilder& builder, uint32_t witness, uint64_t target_range)
{
    auto it = builder.range_lists.find(target_range);
    if (it == builder.range_lists.end()) {
        return false;
    }
    const auto& range_list = it->second;
    return std::find(range_list.variable_indices.begin(), range_list.variable_indices.end(), witness) !=
           range_list.variable_indices.end();
}

/**
 * @brief Validate that a witness has a range constraint of the given number of bits
 * @details Handles three cases:
 *   - num_bits == 1: boolean gate check OR range_lists[1] lookup (covers both bool_t::assert_bool
 *     and create_small_range_constraint(idx, 1) used by validate_split_in_field_unsafe for borrow)
 *   - num_bits <= DEFAULT_PLOOKUP_RANGE_BITNUM (14): range_lists lookup
 *   - num_bits > 14: decompose chain validation
 *
 * @param analyzer The static analyzer (for gate lookups and decompose chain validation)
 * @param builder The circuit builder (for range_lists access)
 * @param witness The witness index to check
 * @param num_bits The number of bits the witness should be constrained to
 * @return True if the range constraint exists
 */
template <typename FF, typename CircuitBuilder>
bool validate_range_constraint(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                               CircuitBuilder& builder,
                               uint32_t witness,
                               uint32_t num_bits)
{
    if (num_bits == 1) {
        // Check boolean gate first (bool_t::assert_bool creates this pattern)
        if (is_boolean_gate_exists<FF>(analyzer, builder, witness)) {
            return true;
        }
        // Also check range_lists[1] (create_small_range_constraint(idx, 1) adds to this list)
        return is_in_range_list<FF>(builder, witness, 1);
    } else if (num_bits <= bb::UltraCircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM) {
        // Small range: arithmetic gate + range list entry
        uint64_t target_range = (1ULL << num_bits) - 1;
        return is_in_range_list<FF>(builder, witness, target_range);
    } else {
        // Large range: decompose_into_default_range creates sublimbs with big_add gates
        return analyzer.validate_decompose_chain(witness, num_bits);
    }
}

} // namespace cdg
