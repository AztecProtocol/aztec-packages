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
 * @note we intentionally do not consume the gate, because we just want to check that the variable is constrained to be
 * boolean
 */
template <typename FF, typename CircuitBuilder>
bool does_boolean_gate_exist(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                             CircuitBuilder& builder,
                             uint32_t witness_idx)
{
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_l(witness_idx)
                             .set_w_r(witness_idx)
                             .set_q_m(FF::one())
                             .set_q_1(FF(-1))
                             .set_q_2(FF::zero())
                             .set_q_3(FF::zero())
                             .set_q_4(FF::zero())
                             .set_q_c(FF::zero())
                             .set_q_arith(FF::one());

    // variable_gates is keyed by to_real(wire_idx) (see extract_gate_variables in graph.cpp:154).
    // When assert_equal merges witness_idx into another equivalence class, to_real(witness_idx) changes,
    // so we must look up by the real index. The filter still checks the raw wire value in the block.
    auto gates = analyzer.get_variable_gates(analyzer.to_real(witness_idx));
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
 * @brief Check if a witness has a range constraint via a limb linked by an arithmetic gate
 * @details When `create_limbed_range_constraint(W, num_bits, 14)` is called for small num_bits (≤14):
 *   1. Creates `limb_idx = add_variable(val)` — a NEW variable
 *   2. `create_small_range_constraint(limb_idx, target_range)` — adds limb_idx to range_lists[target_range]
 *   3. `create_big_add_gate({limb_idx, zero, zero, W, 1, 2^14, 2^28, -1, 0})` — links limb to W
 *
 *   The gate has a known pattern:
 *     w_l = limb_idx, w_r = zero_idx, w_o = zero_idx, w_4 = W
 *     q_1 = 1, q_2 = 2^14, q_3 = 2^28, q_4 = -1, q_c = 0, q_m = 0, q_arith = 1
 *
 *   After byte_array's `input.assert_equal(byte)`, the original witness and W share the same
 *   real_variable_index. This function finds the big_add_gate via FilterFunctionBuilder with
 *   the known selector/wire pattern, extracts w_l (limb_idx), and checks range_lists membership.
 *   Complexity: O(G) per call (G = gates per variable, typically small).
 *  * @note we intentionally do not consume the gate, because we just want to check that the variable is constrained by
 * range_constraint.
 */
template <typename FF, typename CircuitBuilder>
bool is_range_constrained_via_limb_lookup(StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          CircuitBuilder& builder,
                                          uint32_t witness,
                                          uint64_t target_range)
{
    constexpr uint64_t shift_1 = 1ULL << CircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM;       // 2^14
    constexpr uint64_t shift_2 = 1ULL << (2 * CircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM); // 2^28

    BB_ASSERT(target_range < shift_1, "target_range too large");
    uint32_t real_witness = builder.real_variable_index[witness];

    // Exact gate pattern from create_limbed_range_constraint (single limb, num_bits ≤ 14):
    //   w_l = limb, w_r = zero, w_o = zero, w_4 = W
    //   q_1=1, q_2=2^14, q_3=2^28, q_4=-1, q_c=0, q_m=0, q_arith=1
    // Note: w_4 is checked manually via real_variable_index below because the raw wire value
    // in the block (byte_idx) differs from our witness (byte_source_idx) — they're only linked
    // by assert_equal, so set_w_4 (exact match) would fail.
    auto filter_helper = FilterFunctionBuilder<CircuitBuilder, FF>(builder)
                             .set_w_r(builder.zero_idx())
                             .set_w_o(builder.zero_idx())
                             .set_q_1(FF::one())
                             .set_q_2(FF(shift_1))
                             .set_q_3(FF(shift_2))
                             .set_q_4(FF(-1))
                             .set_q_c(FF::zero())
                             .set_q_m(FF::zero())
                             .set_q_arith(FF::one());

    auto gates = analyzer.get_variable_gates(real_witness);
    auto filtered_gates = filter_helper.filter_gates(gates);

    for (auto [blk_idx, gate_idx] : filtered_gates) {
        auto& block = builder.blocks.get()[blk_idx];
        // We cannot use set_w_4 because we compare variable's equivalence class
        if (builder.real_variable_index[block.w_4()[gate_idx]] != real_witness) {
            continue;
        }
        // Extract limb_idx from w_l and verify it's in the range list
        uint32_t limb = block.w_l()[gate_idx];
        if (is_in_range_list<FF>(builder, limb, target_range)) {
            return true;
        }
    }
    return false;
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
        if (does_boolean_gate_exist<FF>(analyzer, builder, witness)) {
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
