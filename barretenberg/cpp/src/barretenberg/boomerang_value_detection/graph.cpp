#include "./graph.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <algorithm>
#include <array>
#include <stack>

using namespace bb::plookup;
using namespace bb;

namespace cdg {

/**
 * @brief this method finds index of the block in circuit builder by comparing pointers to blocks
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the blocks
 * @param block block to find
 * @return size_t index of the found block
 */
template <typename FF, typename CircuitBuilder>
size_t StaticAnalyzer_<FF, CircuitBuilder>::find_block_index(const auto& block)
{
    auto blocks_data = circuit_builder.blocks.get();
    size_t index = 0;
    for (size_t i = 0; i < blocks_data.size(); i++) {
        if ((void*)(&blocks_data[i]) == (void*)(&block)) {
            index = i;
            break;
        }
    }
    return index;
}

/**
 * @brief this method processes variables from a gate by removing duplicates and updating tracking structures
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the variables
 * @param gate_variables vector of variables to process
 * @param gate_index index of the current gate
 * @param block_idx index of the current block
 * @details The method performs several operations:
 *          1) Removes duplicate variables from the input vector
 *          2) Converts each variable to its real index using to_real
 *          3) Creates key-value pairs of (variable_index, block_index) for tracking
 *          4) Updates variable_gates map with gate indices for each variable
 *          5) Increments the gate count for each processed variable
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_gate_variables(std::vector<uint32_t>& gate_variables,
                                                                        size_t gate_index,
                                                                        size_t block_idx)
{
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    if (gate_variables.empty()) {
        return;
    }
    for (auto& var_idx : gate_variables) {
        KeyPair key = std::make_pair(var_idx, block_idx);
        variable_gates[key].emplace_back(gate_index);
    }
    for (const auto& variable_index : gate_variables) {
        variables_gate_counts[variable_index] += 1;
    }
}

/**
 * @brief this method creates connected components from arithmetic gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<std::vector<uint32_t>> vector of connected components from the gate and minigate
 * @details Processes both regular arithmetic gates and minigates, handling fixed witness gates
 *          and different arithmetic operations based on selector values
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::get_arithmetic_gate_connected_component(
    size_t index, size_t block_idx, auto& blk)
{
    auto q_arith = blk.q_arith()[index];
    std::vector<uint32_t> gate_variables;
    std::vector<uint32_t> minigate_variables;
    std::vector<std::vector<uint32_t>> all_gates_variables;
    if (q_arith.is_zero()) {
        return {};
    }
    auto q_m = blk.q_m()[index];
    auto q_1 = blk.q_1()[index];
    auto q_2 = blk.q_2()[index];
    auto q_3 = blk.q_3()[index];
    auto q_4 = blk.q_4()[index];

    uint32_t left_idx = blk.w_l()[index];
    uint32_t right_idx = blk.w_r()[index];
    uint32_t out_idx = blk.w_o()[index];
    uint32_t fourth_idx = blk.w_4()[index];
    if (q_m.is_zero() && q_1 == 1 && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_arith == FF::one()) {
        // this is fixed_witness gate. So, variable index contains in left wire. So, we have to take only it.
        fixed_variables.insert(this->to_real(left_idx));
    } else if (!q_m.is_zero() || q_1 != FF::one() || !q_2.is_zero() || !q_3.is_zero() || !q_4.is_zero()) {
        //  this is not the gate for fix_witness, so we have to process this gate
        if (!q_m.is_zero()) {
            gate_variables.emplace_back(left_idx);
            gate_variables.emplace_back(right_idx);
        } else {
            if (!q_1.is_zero()) {
                gate_variables.emplace_back(left_idx);
            }
            if (!q_2.is_zero()) {
                gate_variables.emplace_back(right_idx);
            }
        }

        if (!q_3.is_zero()) {
            gate_variables.emplace_back(out_idx);
        }
        if (!q_4.is_zero()) {
            gate_variables.emplace_back(fourth_idx);
        }
        if (q_arith == FF(2)) {
            // We have to use w_4_shift from the next gate
            // if and only if the current gate isn't last, cause we can't
            // look into the next gate
            if (index != blk.size() - 1) {
                gate_variables.emplace_back(blk.w_4()[index + 1]);
            }
        }
        if (q_arith == FF(3)) {
            //  In this gate mini gate is enabled, we have 2 equations:
            //  q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + 2 * w_4_omega = 0
            //  w_1 + w_4 - w_1_omega + q_m = 0
            minigate_variables.emplace_back(left_idx);
            minigate_variables.emplace_back(fourth_idx);
            if (index != blk.size() - 1) {
                gate_variables.emplace_back(blk.w_4()[index + 1]);
                minigate_variables.emplace_back(blk.w_l()[index + 1]);
            }
        }
    }
    gate_variables = to_real(gate_variables);
    minigate_variables = to_real(minigate_variables);
    process_gate_variables(gate_variables, index, block_idx);
    process_gate_variables(minigate_variables, index, block_idx);
    all_gates_variables.emplace_back(gate_variables);
    if (!minigate_variables.empty()) {
        all_gates_variables.emplace_back(minigate_variables);
    }
    return all_gates_variables;
}

/**
 * @brief this method creates connected components from elliptic gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Handles both elliptic curve addition and doubling operations,
 *          collecting variables from current and next gates as needed
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_elliptic_gate_connected_component(
    size_t index, size_t block_idx, auto& blk)
{
    std::vector<uint32_t> gate_variables;
    if (!blk.q_elliptic()[index].is_zero()) {
        std::vector<uint32_t> first_row_variables;
        std::vector<uint32_t> second_row_variables;
        gate_variables.reserve(6);
        bool is_elliptic_add_gate = !blk.q_1()[index].is_zero() && blk.q_m()[index].is_zero();
        bool is_elliptic_dbl_gate = blk.q_1()[index].is_zero() && blk.q_m()[index] == FF::one();
        auto right_idx = blk.w_r()[index];
        auto out_idx = blk.w_o()[index];
        first_row_variables.emplace_back(right_idx);
        first_row_variables.emplace_back(out_idx);
        if (index != blk.size() - 1) {
            if (is_elliptic_add_gate) {
                // if this gate is ecc_add_gate, we have to get indices x2, x3, y3, y2 from the next gate
                second_row_variables.emplace_back(blk.w_l()[index + 1]);
                second_row_variables.emplace_back(blk.w_r()[index + 1]);
                second_row_variables.emplace_back(blk.w_o()[index + 1]);
                second_row_variables.emplace_back(blk.w_4()[index + 1]);
            }
            if (is_elliptic_dbl_gate) {
                // if this gate is ecc_dbl_gate, we have to indices x3, y3 from right and output wires
                second_row_variables.emplace_back(blk.w_r()[index + 1]);
                second_row_variables.emplace_back(blk.w_o()[index + 1]);
            }
        }
        if (!first_row_variables.empty()) {
            first_row_variables = to_real(first_row_variables);
            process_gate_variables(first_row_variables, index, block_idx);
            gate_variables.insert(gate_variables.end(), first_row_variables.cbegin(), first_row_variables.cend());
        }
        if (!second_row_variables.empty()) {
            second_row_variables = to_real(second_row_variables);
            process_gate_variables(second_row_variables, index + 1, block_idx);
            gate_variables.insert(gate_variables.end(), second_row_variables.cbegin(), second_row_variables.cend());
        }
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from sorted constraints
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes delta range constraints by collecting all wire indices
 *          from the current gate
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_sort_constraint_connected_component(
    size_t index, size_t blk_idx, auto& block)
{
    std::vector<uint32_t> gate_variables = {};
    if (!block.q_delta_range()[index].is_zero()) {
        std::vector<uint32_t> row_variables = {
            block.w_l()[index], block.w_r()[index], block.w_o()[index], block.w_4()[index]
        };
        /*
        sometimes process_range_list function adds variables with zero_idx in beginning of vector with indices
        in order to pad a size of indices to gate width. But tool has to ignore these additional variables
        */
        for (const auto& var_idx : row_variables) {
            if (var_idx != circuit_builder.zero_idx) {
                gate_variables.emplace_back(var_idx);
            }
        }
        if (index != block.size() - 1 && block.w_l()[index + 1] != circuit_builder.zero_idx) {
            gate_variables.emplace_back(block.w_l()[index + 1]);
        }
    }
    gate_variables = to_real(gate_variables);
    process_gate_variables(gate_variables, index, blk_idx);
    return gate_variables;
}

/**
 * @brief this method creates connected components from plookup gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes plookup gates by collecting variables based on selector values,
 *          including variables from the next gate when necessary
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_plookup_gate_connected_component(size_t index,
                                                                                                       size_t blk_idx,
                                                                                                       auto& block)
{
    std::vector<uint32_t> gate_variables;
    auto q_lookup_type = block.q_lookup_type()[index];
    if (!q_lookup_type.is_zero()) {
        gate_variables.reserve(6);
        auto q_2 = block.q_2()[index];
        auto q_m = block.q_m()[index];
        auto q_c = block.q_c()[index];
        gate_variables.emplace_back(block.w_l()[index]);
        gate_variables.emplace_back(block.w_r()[index]);
        gate_variables.emplace_back(block.w_o()[index]);
        if (index < block.size() - 1) {
            if (!q_2.is_zero()) {
                gate_variables.emplace_back(block.w_l()[index + 1]);
            }
            if (!q_m.is_zero()) {
                gate_variables.emplace_back(block.w_r()[index + 1]);
            }
            if (!q_c.is_zero()) {
                gate_variables.emplace_back(block.w_o()[index + 1]);
            }
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, index, blk_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from poseidon2 gates
 * @tparam FF field type
 * @param ultra_circuit_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param blk_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_poseido2s_gate_connected_component(size_t index,
                                                                                                         size_t blk_idx,
                                                                                                         auto& block)
{
    std::vector<uint32_t> gate_variables;
    auto internal_selector = block.q_poseidon2_internal()[index];
    auto external_selector = block.q_poseidon2_external()[index];
    if (!internal_selector.is_zero() || !external_selector.is_zero()) {
        gate_variables.reserve(8);
        gate_variables.emplace_back(block.w_l()[index]);
        gate_variables.emplace_back(block.w_r()[index]);
        gate_variables.emplace_back(block.w_o()[index]);
        gate_variables.emplace_back(block.w_4()[index]);
        if (index != block.size() - 1) {
            gate_variables.emplace_back(block.w_l()[index + 1]);
            gate_variables.emplace_back(block.w_r()[index + 1]);
            gate_variables.emplace_back(block.w_o()[index + 1]);
            gate_variables.emplace_back(block.w_4()[index + 1]);
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, index, blk_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from Memory gates (RAM and ROM consistency checks)
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param blk_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_memory_gate_connected_component(size_t index,
                                                                                                      size_t blk_idx,
                                                                                                      auto& block)
{
    std::vector<uint32_t> gate_variables;
    if (!block.q_memory()[index].is_zero()) {
        gate_variables.reserve(8);
        auto q_1 = block.q_1()[index];
        auto q_2 = block.q_2()[index];
        auto q_3 = block.q_3()[index];
        auto q_4 = block.q_4()[index];
        if (q_1 == FF::one() && q_4 == FF::one()) {
            ASSERT(q_3.is_zero());
            // ram timestamp check
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { block.w_r()[index + 1],
                                        block.w_r()[index],
                                        block.w_l()[index],
                                        block.w_l()[index + 1],
                                        block.w_o()[index] });
            }
        } else if (q_1 == FF::one() && q_2 == FF::one()) {
            ASSERT(q_3.is_zero());
            // rom constitency check
            if (index < block.size() - 1) {
                gate_variables.insert(
                    gate_variables.end(),
                    { block.w_l()[index], block.w_l()[index + 1], block.w_4()[index], block.w_4()[index + 1] });
            }
        } else {
            // ram constitency check
            if (!q_3.is_zero()) {
                if (index < block.size() - 1) {
                    gate_variables.insert(gate_variables.end(),
                                          { block.w_o()[index],
                                            block.w_4()[index],
                                            block.w_l()[index + 1],
                                            block.w_r()[index + 1],
                                            block.w_o()[index + 1],
                                            block.w_4()[index + 1] });
                }
            }
        }
    }
    gate_variables = to_real(gate_variables);
    process_gate_variables(gate_variables, index, blk_idx);
    return gate_variables;
}

/**
 * @brief this method creates connected components from Non-Native Field gates (bigfield operations)
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param index index of the current gate
 * @param blk_idx index of the current block
 * @param block block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_non_native_field_gate_connected_component(
    size_t index, size_t blk_idx, auto& block)
{
    std::vector<uint32_t> gate_variables;
    if (!block.q_nnf()[index].is_zero()) {
        gate_variables.reserve(8);
        [[maybe_unused]] auto q_1 = block.q_1()[index];
        auto q_2 = block.q_2()[index];
        auto q_3 = block.q_3()[index];
        auto q_4 = block.q_4()[index];
        auto q_m = block.q_m()[index];

        auto w_l = block.w_l()[index];
        auto w_r = block.w_r()[index];
        auto w_o = block.w_o()[index];
        auto w_4 = block.w_4()[index];
        if (q_3 == FF::one() && q_4 == FF::one()) {
            // bigfield limb accumulation 1
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { w_l, w_r, w_o, w_4, block.w_l()[index + 1], block.w_r()[index + 1] }); // 6
            }
        } else if (q_3 == FF::one() && q_m == FF::one()) {
            // bigfield limb accumulation 2
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { w_o,
                                        w_4,
                                        block.w_l()[index + 1],
                                        block.w_r()[index + 1],
                                        block.w_o()[index + 1],
                                        block.w_4()[index + 1] });
            }
        } else if (q_2 == FF::one() && (q_3 == FF::one() || q_4 == FF::one() || q_m == FF::one())) {
            // bigfield product cases
            if (index < block.size() - 1) {
                std::vector<uint32_t> limb_subproduct_vars = {
                    w_l, w_r, block.w_l()[index + 1], block.w_r()[index + 1]
                };
                if (q_3 == FF::one()) {
                    // bigfield product 1
                    ASSERT(q_4.is_zero() && q_m.is_zero());
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(), { w_o, w_4 });
                }
                if (q_4 == FF::one()) {
                    // bigfield product 2
                    ASSERT(q_3.is_zero() && q_m.is_zero());
                    std::vector<uint32_t> non_native_field_gate_2 = { w_l, w_4, w_r, w_o, block.w_o()[index + 1] };
                    gate_variables.insert(
                        gate_variables.end(), non_native_field_gate_2.begin(), non_native_field_gate_2.end());
                    gate_variables.emplace_back(block.w_4()[index + 1]);
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                }
                if (q_m == FF::one()) {
                    // bigfield product 3
                    ASSERT(q_4.is_zero() && q_3.is_zero());
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(),
                                          { w_4, block.w_o()[index + 1], block.w_4()[index + 1] });
                }
            }
        }
    }
    gate_variables = to_real(gate_variables);
    process_gate_variables(gate_variables, index, blk_idx);
    return gate_variables;
}

/**
 * @brief this method gets the ROM table connected component by processing ROM transcript records
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param rom_array ROM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from ROM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_rom_table_connected_component(
    const bb::RomTranscript& rom_array)
{
    // Every RomTranscript data structure has 2 main components that are interested for static analyzer:
    // 1) records contains values that were put in the gate, we can use them to create connections between variables
    // 2) states contains values witness indexes that we can find in the ROM record in the RomTrascript, so we can
    // ignore state of the ROM transcript, because we still can connect all variables using variables from records.
    std::vector<uint32_t> rom_table_variables;
    if (std::optional<size_t> blk_idx = find_block_index(circuit_builder.blocks.memory); blk_idx) {
        // Every RomTranscript data structure has 2 main components that are interested for static analyzer:
        // 1) records contains values that were put in the gate, we can use them to create connections between variables
        // 2) states contains values witness indexes that we can find in the ROM record in the RomTrascript, so we can
        // ignore state of the ROM transcript, because we still can connect all variables using variables from records.
        for (const auto& record : rom_array.records) {
            std::vector<uint32_t> gate_variables;
            size_t gate_index = record.gate_index;

            auto q_1 = circuit_builder.blocks.memory.q_1()[gate_index];
            auto q_2 = circuit_builder.blocks.memory.q_2()[gate_index];
            auto q_3 = circuit_builder.blocks.memory.q_3()[gate_index];
            auto q_4 = circuit_builder.blocks.memory.q_4()[gate_index];
            auto q_m = circuit_builder.blocks.memory.q_m()[gate_index];
            auto q_c = circuit_builder.blocks.memory.q_c()[gate_index];

            auto index_witness = record.index_witness;
            auto vc1_witness = record.value_column1_witness; // state[0] from RomTranscript
            auto vc2_witness = record.value_column2_witness; // state[1] from RomTranscript
            auto record_witness = record.record_witness;

            if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                q_c.is_zero()) {
                // By default ROM read gate uses variables (w_1, w_2, w_3, w_4) = (index_witness, vc1_witness,
                // vc2_witness, record_witness) So we can update all of them
                gate_variables.emplace_back(index_witness);
                if (vc1_witness != circuit_builder.zero_idx) {
                    gate_variables.emplace_back(vc1_witness);
                }
                if (vc2_witness != circuit_builder.zero_idx) {
                    gate_variables.emplace_back(vc2_witness);
                }
                gate_variables.emplace_back(record_witness);
            }
            gate_variables = to_real(gate_variables);
            process_gate_variables(gate_variables, gate_index, *blk_idx);
            // after process_gate_variables function gate_variables constists of real variables indexes, so we can
            // add all this variables in the final vector to connect all of them
            if (!gate_variables.empty()) {
                rom_table_variables.insert(rom_table_variables.end(), gate_variables.begin(), gate_variables.end());
            }
        }
    }
    return rom_table_variables;
}

/**
 * @brief this method gets the RAM table connected component by processing RAM transcript records
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the gates
 * @param ram_array RAM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from RAM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_ram_table_connected_component(
    const bb::RamTranscript& ram_array)
{
    std::vector<uint32_t> ram_table_variables;
    if (std::optional<size_t> blk_idx = find_block_index(circuit_builder.blocks.memory); blk_idx) {
        for (const auto& record : ram_array.records) {
            std::vector<uint32_t> gate_variables;
            size_t gate_index = record.gate_index;

            auto q_1 = circuit_builder.blocks.memory.q_1()[gate_index];
            auto q_2 = circuit_builder.blocks.memory.q_2()[gate_index];
            auto q_3 = circuit_builder.blocks.memory.q_3()[gate_index];
            auto q_4 = circuit_builder.blocks.memory.q_4()[gate_index];
            auto q_m = circuit_builder.blocks.memory.q_m()[gate_index];
            auto q_c = circuit_builder.blocks.memory.q_c()[gate_index];

            auto index_witness = record.index_witness;
            auto timestamp_witness = record.timestamp_witness;
            auto value_witness = record.value_witness;
            auto record_witness = record.record_witness;

            if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                (q_c.is_zero() || q_c == FF::one())) {
                // By default RAM read/write gate uses variables (w_1, w_2, w_3, w_4) = (index_witness,
                // timestamp_witness, value_witness, record_witness) So we can update all of them
                gate_variables.emplace_back(index_witness);
                if (timestamp_witness != circuit_builder.zero_idx) {
                    gate_variables.emplace_back(timestamp_witness);
                }
                if (value_witness != circuit_builder.zero_idx) {
                    gate_variables.emplace_back(value_witness);
                }
                gate_variables.emplace_back(record_witness);
            }
            gate_variables = to_real(gate_variables);
            process_gate_variables(gate_variables, gate_index, *blk_idx);
            // after process_gate_variables function gate_variables constists of real variables indexes, so we can add
            // all these variables in the final vector to connect all of them
            ram_table_variables.insert(ram_table_variables.end(), gate_variables.begin(), gate_variables.end());
        }
    }
    return ram_table_variables;
}

/**
 * @brief this method creates connected components from databus gates
 * @tparam FF field type
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes databus read operations by collecting variables from left and right wires
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_databus_connected_component(size_t index,
                                                                                                  size_t block_idx,
                                                                                                  auto& blk)
{
    std::vector<uint32_t> gate_variables;
    if (!blk.q_busread()[index].is_zero()) {
        gate_variables.insert(gate_variables.end(), { blk.w_l()[index], blk.w_r()[index] });
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, index, block_idx);
    }
    return gate_variables;
}

/**
 * @brief this method creates connected components from elliptic curve operation gates
 * @tparam FF field type
 * @param index index of the current gate
 * @param block_idx index of the current block
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes elliptic curve operations by collecting variables from current and next gates,
 *          handling opcodes and coordinate variables for curve operations
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_eccop_part_connected_component(size_t index,
                                                                                                     size_t block_idx,
                                                                                                     auto& blk)
{
    std::vector<uint32_t> gate_variables;
    std::vector<uint32_t> first_row_variables;
    std::vector<uint32_t> second_row_variables;
    auto w1 = blk.w_l()[index]; // get opcode of operation, because function get_ecc_op_idx returns type
                                // uint32_t and it adds as w1
    if (w1 != circuit_builder.zero_idx) {
        // this is opcode and start of the UltraOp element
        first_row_variables.insert(
            first_row_variables.end(),
            { w1, blk.w_r()[index], blk.w_o()[index], blk.w_4()[index] }); // add op, x_lo, x_hi, y_lo
        if (index < blk.size() - 1) {
            second_row_variables.insert(
                second_row_variables.end(),
                { blk.w_r()[index + 1], blk.w_o()[index + 1], blk.w_4()[index + 1] }); // add y_hi, z1, z2
        }
        first_row_variables = to_real(first_row_variables);
        second_row_variables = to_real(second_row_variables);
        process_gate_variables(first_row_variables, index, block_idx);
        process_gate_variables(second_row_variables, index + 1, block_idx);
    }
    if (!first_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), first_row_variables.cbegin(), first_row_variables.cend());
    }
    if (!second_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), second_row_variables.cbegin(), second_row_variables.cend());
    }
    return gate_variables;
}

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::process_execution_trace()
{
    auto block_data = circuit_builder.blocks.get();

    // We have to determine pub_inputs block index based on circuit builder type, because we have to skip it.
    // If type of CircuitBuilder is UltraCircuitBuilder, the pub_inputs block is the first block so we can set
    // pub_inputs_block_idx
    size_t pub_inputs_block_idx = 0;

    // For MegaCircuitBuilder, pub_inputs block has index 3
    if constexpr (IsMegaBuilder<CircuitBuilder>) {
        pub_inputs_block_idx = 3;
    }

    for (size_t blk_idx = 0; blk_idx < block_data.size() - 1; blk_idx++) {
        if (block_data[blk_idx].size() == 0 || blk_idx == pub_inputs_block_idx) {
            continue;
        }
        std::vector<uint32_t> sorted_variables;
        std::vector<uint32_t> eccop_variables;
        for (size_t gate_idx = 0; gate_idx < block_data[blk_idx].size(); gate_idx++) {
            auto arithmetic_gates_variables =
                get_arithmetic_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (!arithmetic_gates_variables.empty() && connect_variables) {
                for (const auto& gate_variables : arithmetic_gates_variables) {
                    connect_all_variables_in_vector(gate_variables);
                }
            }
            auto elliptic_gate_variables =
                get_elliptic_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(elliptic_gate_variables);
            }
            auto lookup_gate_variables = get_plookup_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(lookup_gate_variables);
            }
            auto poseidon2_gate_variables =
                get_poseido2s_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(poseidon2_gate_variables);
            }
            auto nnf_gate_variables =
                get_non_native_field_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(nnf_gate_variables);
            }
            auto memory_gate_variables = get_memory_gate_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(memory_gate_variables);
            }
            auto delta_range_variables =
                get_sort_constraint_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
            if (connect_variables) {
                connect_all_variables_in_vector(delta_range_variables);
            }
            if constexpr (IsMegaBuilder<CircuitBuilder>) {
                // If type of CircuitBuilder is MegaCircuitBuilder, we'll try to process blocks like they can be
                // databus or eccop
                auto databus_variables = get_databus_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
                if (connect_variables) {
                    connect_all_variables_in_vector(databus_variables);
                }
                auto eccop_gate_variables = get_eccop_part_connected_component(gate_idx, blk_idx, block_data[blk_idx]);
                if (connect_variables) {
                    if (!eccop_gate_variables.empty()) {
                        // The gotten vector of variables contains all variables from UltraOp element of the table
                        eccop_variables.insert(
                            eccop_variables.end(), eccop_gate_variables.begin(), eccop_gate_variables.end());
                        // if a current opcode is responsible for equality and reset, we have to connect all
                        // variables in global vector and clear it for the next parts
                        if (eccop_gate_variables[0] == circuit_builder.equality_op_idx) {
                            connect_all_variables_in_vector(eccop_variables);
                            eccop_variables.clear();
                        }
                    }
                }
            }
        }
    }

    const auto& rom_arrays = circuit_builder.rom_ram_logic.rom_arrays;
    if (!rom_arrays.empty()) {
        for (const auto& rom_array : rom_arrays) {
            std::vector<uint32_t> variable_indices = get_rom_table_connected_component(rom_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }

    const auto& ram_arrays = circuit_builder.rom_ram_logic.ram_arrays;
    if (!ram_arrays.empty()) {
        for (const auto& ram_array : ram_arrays) {
            std::vector<uint32_t> variable_indices = get_ram_table_connected_component(ram_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }
}

/**
 * @brief Construct a new StaticAnalyzer for Ultra Circuit Builder or Mega Circuit Builder
 * @tparam FF field type used in the circuit
 * @param ultra_circuit_constructor circuit builder containing all gates and variables
 * @details This constructor initializes the graph structure by:
 *          1) Creating data structures for tracking:
 *             - Number of gates each variable appears in (variables_gate_counts)
 *             - Adjacency lists for each variable (variable_adjacency_lists)
 *             - Degree of each variable (variables_degree)
 *          2) Processing different types of gates:
 *             - Arithmetic gates
 *             - Elliptic curve gates
 *             - Plookup gates
 *             - Poseidon2 gates
 *             - Memory gates
 *             - Non-native field gates
 *             - Delta range gates
 *          3) Creating connections between variables that appear in the same gate
 *          4) Special handling for sorted constraints in delta range blocks
 */
template <typename FF, typename CircuitBuilder>
StaticAnalyzer_<FF, CircuitBuilder>::StaticAnalyzer_(CircuitBuilder& circuit_builder, bool connect_variables)
    : circuit_builder(circuit_builder)
    , connect_variables(connect_variables)
{
    variables_gate_counts = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    variable_adjacency_lists =
        std::unordered_map<uint32_t, std::vector<uint32_t>>(circuit_builder.real_variable_index.size());
    variables_degree = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    for (const auto& variable_index : circuit_builder.real_variable_index) {
        variables_gate_counts[variable_index] = 0;
        variables_degree[variable_index] = 0;
        variable_adjacency_lists[variable_index] = {};
    }
    process_execution_trace();
}

/**
 * @brief this method checks whether the variable with given index is not constant
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variable_index
 * @return true
 * @return false
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::check_is_not_constant_variable(const uint32_t& variable_index)
{
    bool is_not_constant = true;
    const auto& constant_variable_indices = circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        if (pair.second == circuit_builder.real_variable_index[variable_index]) {
            is_not_constant = false;
            break;
        }
    }
    return is_not_constant;
}

/**
 * @brief this method connects 2 variables if they are in one gate and
 * 1) have different indices,
 * 2) not constant variables,
 * 3) their indices != 0
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_vector
 * @param is_sorted_variables
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector)
{
    if (variables_vector.empty()) {
        return;
    }
    std::vector<uint32_t> filtered_variables_vector;
    filtered_variables_vector.reserve(variables_vector.size());
    // Only copy non-zero and non-constant variables
    std::copy_if(variables_vector.begin(),
                 variables_vector.end(),
                 std::back_inserter(filtered_variables_vector),
                 [&](uint32_t variable_index) {
                     return variable_index != circuit_builder.zero_idx &&
                            this->check_is_not_constant_variable(variable_index);
                 });
    // Remove duplicates
    auto unique_pointer = std::unique(filtered_variables_vector.begin(), filtered_variables_vector.end());
    filtered_variables_vector.erase(unique_pointer, filtered_variables_vector.end());
    if (filtered_variables_vector.size() < 2) {
        return;
    }
    for (size_t i = 0; i < filtered_variables_vector.size() - 1; i++) {
        add_new_edge(filtered_variables_vector[i], filtered_variables_vector[i + 1]);
    }
}

/**
 * @brief this method creates an edge between two variables in graph. All needed checks in a function above
 * @tparam FF
 * @param first_variable_index
 * @param second_variable_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::add_new_edge(const uint32_t& first_variable_index,
                                                       const uint32_t& second_variable_index)
{
    variable_adjacency_lists[first_variable_index].emplace_back(second_variable_index);
    variable_adjacency_lists[second_variable_index].emplace_back(first_variable_index);
    variables_degree[first_variable_index] += 1;
    variables_degree[second_variable_index] += 1;
}

/**
 * @brief this method implements depth-first search algorithm for undirected graphs
 * @tparam FF
 * @param variable_index
 * @param is_used
 * @param connected_component
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::depth_first_search(const uint32_t& variable_index,
                                                             std::unordered_set<uint32_t>& is_used,
                                                             std::vector<uint32_t>& connected_component)
{
    std::stack<uint32_t> variable_stack;
    variable_stack.push(variable_index);
    while (!variable_stack.empty()) {
        uint32_t current_index = variable_stack.top();
        variable_stack.pop();
        if (!is_used.contains(current_index)) {
            is_used.insert(current_index);
            connected_component.emplace_back(current_index);
            for (const auto& it : variable_adjacency_lists[current_index]) {
                variable_stack.push(it);
            }
        }
    }
}

/**
 * @brief this methond finds all connected components in the graph described by adjacency lists
 * @tparam FF
 * @return std::vector<std::vector<uint32_t>> list of connected components where each component is a vector of
 * variable indices
 */

template <typename FF, typename CircuitBuilder>
std::vector<ConnectedComponent> StaticAnalyzer_<FF, CircuitBuilder>::find_connected_components(
    bool return_all_connected_components)
{
    if (!connect_variables) {
        throw std::runtime_error("find_connected_components() can only be called when connect_variables is true");
    }
    std::unordered_set<uint32_t> visited;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!visited.contains(pair.first)) {
                std::vector<uint32_t> variable_indices;
                depth_first_search(pair.first, visited, variable_indices);
                std::sort(variable_indices.begin(), variable_indices.end());
                connected_components.emplace_back(ConnectedComponent(variable_indices));
            }
        }
    }
    mark_range_list_connected_components();
    mark_finalize_connected_components();
    if (!return_all_connected_components) {
        main_connected_components.reserve(connected_components.size());
        for (auto& cc : connected_components) {
            if (!cc.is_range_list_cc && !cc.is_finalize_cc) {
                main_connected_components.emplace_back(std::move(cc));
            }
        }
        return main_connected_components;
    }
    return connected_components;
}

/**
 * @brief this method marks some connected componets like they represent range lists
 * tool needs this method to remove range lists because after method finalize was called
 * because they aren't connected to other variables in a circuit. It's intended behaviout but the tool shows them as
 * another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_range_list_connected_components()
{
    const auto& tags = circuit_builder.real_variable_tags;
    std::unordered_set<uint32_t> tau_tags;
    for (const auto& pair : circuit_builder.range_lists) {
        tau_tags.insert(pair.second.tau_tag);
    }
    for (auto& cc : connected_components) {
        const auto& variables = cc.variable_indices;
        const uint32_t first_tag = tags[variables[0]];
        if (tau_tags.contains(first_tag)) {
            cc.is_range_list_cc =
                std::all_of(variables.begin() + 1, variables.end(), [&tags, first_tag](uint32_t var_idx) {
                    return tags[var_idx] == first_tag;
                });
        }
    }
}

/**
 * @brief this method marks some connected components like they represent separated finalize blocks
 * the point is finalize method create additional gates for ecc_op in databus in Mega case and they aren't connected to
 * other variables in the circuit. It's intended behaviour but the tool shows them as another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_finalize_connected_components()
{
    const auto& finalize_witnesses = circuit_builder.finalize_witnesses;
    for (auto& cc : connected_components) {
        const auto& vars = cc.vars();
        cc.is_finalize_cc = std::all_of(vars.begin(), vars.end(), [&finalize_witnesses](uint32_t var_idx) {
            return finalize_witnesses.contains(var_idx);
        });
    }
}

/**
 * @brief this method removes variables that were created in a function decompose_into_default_range
 * because they are false cases and don't give any useful information about security of the circuit.
 * decompose_into_default_range function creates addition gates with shifts for intermediate variables,
 * i.e. variables from left, right and output wires. They have variable gates count = 1 or 2, but they are not
 * dangerous. so, we have to remove these variables from the analyzer. The situation is dangerous, if first variable
 * from accumulators have variables gate count = 1. It means that it was used only in decompose gate, and it's not
 * properly constrained.
 * @tparam FF
 * @param ultra_circuit_constructor
 * @param variables_in_one_gate
 * @param index
 * @return size_t
 */

template <typename FF, typename CircuitBuilder>
inline size_t StaticAnalyzer_<FF, CircuitBuilder>::process_current_decompose_chain(size_t index)
{
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
    auto zero_idx = circuit_builder.zero_idx;
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they
        // are useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(this->to_real(fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(out_idx));
        }
        auto q_arith = arithmetic_block.q_arith()[current_index];
        if (q_arith == 1 || current_index == arithmetic_block.size() - 1) {
            // this is the last gate in this chain, or we can't go next, so we have to stop a loop
            break;
        }
        current_index++;
    }
    for (size_t i = 0; i < accumulators_indices.size(); i++) {
        if (i == 0) {
            // the first variable in accumulators is the variable which decompose was created. So, we have to
            // decrement variable_gate_counts for this variable
            variables_gate_counts[accumulators_indices[i]] -= 1;
        } else {
            // next accumulators are useless variables that are not interested for the analyzer. So, for these
            // variables we can nullify variables_gate_counts
            variables_gate_counts[accumulators_indices[i]] = 0;
        }
    }
    // we don't want to make variables_gate_counts for intermediate variables negative, so, can go to the next gates
    return current_index;
}

/**
 * @brief this method removes unnecessary variables from decompose chains
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 * @param decompose_variables
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_decompose_variables(
    const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto find_position = [&](uint32_t variable_index) {
        return decompose_variables.contains(this->to_real(variable_index));
    };
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
    if (arithmetic_block.size() > 0) {
        for (size_t i = 0; i < arithmetic_block.size(); i++) {
            auto q_1 = arithmetic_block.q_1()[i];
            auto q_2 = arithmetic_block.q_2()[i];
            auto q_3 = arithmetic_block.q_3()[i];
            // big addition gate from decompose has selectors, which have the next property:
            // q_1 = (1) << shifts[0], target_range_bitnum * (3 * i),
            // q_2 = (1) << shifts[1], target_range_bitnum * (3 * i + 1),
            // q_3 = (1) << shifts[2], target_range_bitnum * (3 * i + 2)
            // so, they are power of two and satisfying the following equality: q_2 * q_2 = q_1 * q_3
            // this way we can differ them from other arithmetic gates
            bool q_1_is_power_two = is_power_two(q_1);
            bool q_2_is_power_two = is_power_two(q_2);
            bool q_3_is_power_two = is_power_two(q_3);
            if (q_2 * q_2 == q_1 * q_3 && q_1_is_power_two && q_2_is_power_two && q_3_is_power_two) {
                uint32_t left_idx = arithmetic_block.w_l()[i];
                uint32_t right_idx = arithmetic_block.w_r()[i];
                uint32_t out_idx = arithmetic_block.w_o()[i];
                uint32_t fourth_idx = arithmetic_block.w_4()[i];
                bool find_left = find_position(left_idx);
                bool find_right = find_position(right_idx);
                bool find_out = find_position(out_idx);
                bool find_fourth = find_position(fourth_idx);
                if (((find_left && find_right && find_out) || (find_left && find_right && !find_out) ||
                     (find_left && find_right && !find_out) || (find_left && !find_right && !find_out)) &&
                    !find_fourth) {
                    i = this->process_current_decompose_chain(i);
                }
            }
        }
    }
}

/**
 * @brief this method removes variables from range constraints that are not security critical
 * @tparam FF field type
 * @param ultra_builder circuit builder containing the range lists
 * @details Right now static analyzer removes two types of variables:
 *          1) Variables from delta_range_constraints created by finalize_circuit()
 *          2) Variables from range_constraints created by range_constraint_into_two_limbs
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_range_constrains_variables()
{
    std::map<uint64_t, typename CircuitBuilder::RangeList> range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> range_lists_tau_tags;
    std::unordered_set<uint32_t> range_lists_range_tags;
    std::vector<uint32_t> real_variable_tags = circuit_builder.real_variable_tags;
    for (const auto& pair : range_lists) {
        typename CircuitBuilder::RangeList list = pair.second;
        range_lists_tau_tags.insert(list.tau_tag);
        range_lists_range_tags.insert(list.range_tag);
    }
    for (uint32_t real_index = 0; real_index < real_variable_tags.size(); real_index++) {
        if (variables_in_one_gate.contains(real_index)) {
            // this if helps us to remove variables from delta_range_constraints when finalize_circuit() function
            // was called
            if (range_lists_tau_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
            // this if helps us to remove variables from range_constraints when range_constraint_into_two_limbs
            // function was called
            if (range_lists_range_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
        }
    }
}

/**
 * @brief this method removes false positive cases variables from aes plookup tables.
 * AES_SBOX_MAP, AES_SPARSE_MAP, AES_SPARSE_NORMALIZE tables are used in read_from_1_to_2_table function which
 * return values C2[0], so C3[0] isn't used anymore in these cases, but this situation isn't dangerous.
 * So, we have to remove these variables.
 * @tparam FF
 * @param variables_in_one_gate
 * @param ultra_circuit_builder
 * @param table_id
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_aes_plookup_variables(BasicTableId& table_id,
                                                                                          size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    std::unordered_set<BasicTableId> aes_plookup_tables{ BasicTableId::AES_SBOX_MAP,
                                                         BasicTableId::AES_SPARSE_MAP,
                                                         BasicTableId::AES_SPARSE_NORMALIZE };
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (aes_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            bool find_out = find_position(real_out_idx);
            auto q_c = lookup_block.q_c()[gate_index];
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases in sha256 lookup tables.
 * tables which are enumerated in the unordered set sha256_plookup_tables
 * are used in read_from_1_to_2_table function which return C2[0], so C3[0]
 * isn't used anymore, but this situation isn't dangerous. So, we have to remove these variables.
 * @tparam FF
 * @param variables_in_one_gate
 * @param ultra_circuit_builder
 * @param table_id
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_sha256_plookup_variables(BasicTableId& table_id,
                                                                                             size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    std::unordered_set<BasicTableId> sha256_plookup_tables{ BasicTableId::SHA256_WITNESS_SLICE_3,
                                                            BasicTableId::SHA256_WITNESS_SLICE_7_ROTATE_4,
                                                            BasicTableId::SHA256_WITNESS_SLICE_8_ROTATE_7,
                                                            BasicTableId::SHA256_WITNESS_SLICE_14_ROTATE_1,
                                                            BasicTableId::SHA256_BASE16,
                                                            BasicTableId::SHA256_BASE16_ROTATE2,
                                                            BasicTableId::SHA256_BASE16_ROTATE6,
                                                            BasicTableId::SHA256_BASE16_ROTATE7,
                                                            BasicTableId::SHA256_BASE16_ROTATE8,
                                                            BasicTableId::SHA256_BASE28,
                                                            BasicTableId::SHA256_BASE28_ROTATE3,
                                                            BasicTableId::SHA256_BASE28_ROTATE6 };
    if (sha256_plookup_tables.contains(table_id)) {
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            // auto q_m = lookup_block.q_m()[gate_index];
            auto q_c = lookup_block.q_c()[gate_index];
            bool find_out = find_position(real_out_idx);
            // bool find_right = find_position(real_right_idx);
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
            if (table_id == SHA256_BASE16_ROTATE2 || table_id == SHA256_BASE28_ROTATE6) {
                // we want to remove false cases for special tables even though their selectors != 0
                // because they are used in read_from_1_to_2_table function, and they aren't dangerous
                variables_in_one_gate.erase(real_out_idx);
            }
        }
    }
}

/**
 * @brief this method removes false cases in lookup table for a given gate.
 * it uses all functions above for lookup tables to remove all variables that appear in one gate,
 * if they are not dangerous
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_current_plookup_gate(size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    auto& lookup_tables = circuit_builder.lookup_tables;
    auto table_index = static_cast<size_t>(static_cast<uint256_t>(lookup_block.q_3()[gate_index]));
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::unordered_set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::unordered_set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::unordered_set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId table_id = table.id;
            // false cases for AES
            this->remove_unnecessary_aes_plookup_variables(table_id, gate_index);
            // false cases for sha256
            this->remove_unnecessary_sha256_plookup_variables(table_id, gate_index);
            // if the amount of unique elements from columns of plookup tables = 1, it means that
            // variable from this column aren't used and we can remove it.
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = this->to_real(left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
                bool find_out = find_position(real_out_idx);
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases plookup variables from variables in one gate
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_plookup_variables()
{
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            this->process_current_plookup_gate(i);
        }
    }
}

/**
 * @brief this method removes record witness variables from variables in one gate.
 * initially record witness is added in the circuit as ctx->add_variable(0), where ctx -- circuit builder.
 * then aren't used anymore, so we can remove from the static analyzer.
 * @tparam FF
 * @param ultra_builder
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_record_witness_variables()
{
    auto block_data = circuit_builder.blocks.get();
    if (std::optional<size_t> blk_idx = find_block_index(circuit_builder.blocks.memory); blk_idx) {
        std::vector<uint32_t> to_remove;
        for (const auto& var_idx : variables_in_one_gate) {
            KeyPair key = { var_idx, *blk_idx };
            if (auto search = variable_gates.find(key); search != variable_gates.end()) {
                std::vector<size_t> gate_indexes = variable_gates[key];
                ASSERT(gate_indexes.size() == 1);
                size_t gate_idx = gate_indexes[0];
                auto q_1 = block_data[*blk_idx].q_1()[gate_idx];
                auto q_2 = block_data[*blk_idx].q_2()[gate_idx];
                auto q_3 = block_data[*blk_idx].q_3()[gate_idx];
                auto q_4 = block_data[*blk_idx].q_4()[gate_idx];
                auto q_m = block_data[*blk_idx].q_m()[gate_idx];
                auto q_arith = block_data[*blk_idx].q_arith()[gate_idx];
                if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                    q_arith.is_zero()) {
                    // record witness can be in both ROM and RAM gates, so we can ignore q_c
                    // record witness is written as 4th variable in RAM/ROM read/write gate, so we can get 4th
                    // wire value and check it with our variable
                    if (this->to_real(block_data[*blk_idx].w_4()[gate_idx]) == var_idx) {
                        to_remove.emplace_back(var_idx);
                    }
                }
            }
        }
        for (const auto& elem : to_remove) {
            variables_in_one_gate.erase(elem);
        }
    }
}

/**
 * @brief this method returns a final set of variables that were in one gate
 * @tparam FF
 * @param ultra_circuit_builder circuit builder containing the variables
 * @return std::unordered_set<uint32_t> set of variable indices
 */

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_variables_in_one_gate()
{
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = check_is_not_constant_variable(pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_variables;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = check_is_not_constant_variable(elem);
            if (variables_gate_counts[circuit_builder.real_variable_index[elem]] == 1 && is_not_constant_variable) {
                decompose_variables.insert(circuit_builder.real_variable_index[elem]);
            }
        }
    }
    remove_unnecessary_decompose_variables(decompose_variables);
    remove_unnecessary_plookup_variables();
    remove_unnecessary_range_constrains_variables();
    for (const auto& elem : fixed_variables) {
        variables_in_one_gate.erase(elem);
    }
    // we found variables that were in one gate and they are intended cases.
    // so we have to remove them from the scope
    for (const auto& elem : circuit_builder.get_used_witnesses()) {
        variables_in_one_gate.erase(elem);
    }
    remove_record_witness_variables();
    return variables_in_one_gate;
}

/**
 * @brief this method prints additional information about connected components that were found in the graph
 * @tparam FF
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_connected_components_info()
{
    for (size_t i = 0; i < main_connected_components.size(); i++) {
        info("size of ", i + 1, " connected component == ", main_connected_components[i].size(), ":");
        info("Does connected component represent range list? ", main_connected_components[i].is_range_list_cc);
        info("Does connected component represent something from finalize? ",
             main_connected_components[i].is_finalize_cc);
        if (main_connected_components[i].size() < 50) {
            for (const auto& elem : main_connected_components[i].vars()) {
                info("elem == ", elem);
            }
        }
    }
}

/**
 * @brief this method prints a number of gates for each variable
 * @tparam FF
 */

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
    }
}

/**
 * @brief this method prints all information about the gate where variable was found
 * @tparam FF
 * @param ultra_builder
 * @param real_idx
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_variable_in_one_gate(const uint32_t real_idx)
{
    const auto& block_data = circuit_builder.blocks.get();
    for (const auto& [key, gates] : variable_gates) {
        if (key.first == real_idx) {
            BB_ASSERT_EQ(gates.size(), 1U);
            size_t gate_index = gates[0];
            auto& block = block_data[key.second];
            info("---- printing variables in this gate");
            info("w_l == ",
                 block.w_l()[gate_index],
                 " w_r == ",
                 block.w_r()[gate_index],
                 " w_o == ",
                 block.w_o()[gate_index],
                 " w_4 == ",
                 block.w_4()[gate_index]);
            info("---- printing gate selectors where variable with index ", key.first, " was found ----");
            auto q_m = block.q_m()[gate_index];
            if (!q_m.is_zero()) {
                info("q_m == ", q_m);
            }
            auto q_1 = block.q_1()[gate_index];
            if (!q_1.is_zero()) {
                info("q1 == ", q_1);
            }
            auto q_2 = block.q_2()[gate_index];
            if (!q_2.is_zero()) {
                info("q2 == ", q_2);
            }
            auto q_3 = block.q_3()[gate_index];
            if (!q_3.is_zero()) {
                info("q3 == ", q_3);
            }
            auto q_4 = block.q_4()[gate_index];
            if (!q_4.is_zero()) {
                info("q4 == ", q_4);
            }
            auto q_c = block.q_c()[gate_index];
            if (!q_c.is_zero()) {
                info("q_c == ", q_c);
            }
            auto q_arith = block.q_arith()[gate_index];
            if (!q_arith.is_zero()) {
                info("q_arith == ", q_arith);
            }
            auto q_delta_range = block.q_delta_range()[gate_index];
            if (!q_delta_range.is_zero()) {
                info("q_delta_range == ", q_delta_range);
            }
            auto q_elliptic = block.q_elliptic()[gate_index];
            if (!q_elliptic.is_zero()) {
                info("q_elliptic == ", q_elliptic);
            }
            auto q_memory = block.q_memory()[gate_index];
            if (!q_memory.is_zero()) {
                info("q_memory == ", q_memory);
            }
            auto q_nnf = block.q_nnf()[gate_index];
            if (!q_nnf.is_zero()) {
                info("q_nnf == ", q_nnf);
            }
            auto q_lookup_type = block.q_lookup_type()[gate_index];
            if (!q_lookup_type.is_zero()) {
                info("q_lookup_type == ", q_lookup_type);
            }
            auto q_poseidon2_external = block.q_poseidon2_external()[gate_index];
            if (!q_poseidon2_external.is_zero()) {
                info("q_poseidon2_external == ", q_poseidon2_external);
            }
            auto q_poseidon2_internal = block.q_poseidon2_internal()[gate_index];
            if (!q_poseidon2_internal.is_zero()) {
                info("q_poseidon2_internal == ", q_poseidon2_internal);
            }
            if constexpr (std::is_same_v<CircuitBuilder, bb::MegaCircuitBuilder>) {
                auto q_databus = block.q_busread()[gate_index];
                if (!q_databus.is_zero()) {
                    info("q_databus == ", q_databus);
                }
            }
            info("---- finished printing ----");
        }
    }
}

template <typename FF, typename CircuitBuilder>
std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    analyze_circuit()
{
    auto connected_components = find_connected_components();
    auto variables_in_one_gate = get_variables_in_one_gate();
    return std::make_pair(connected_components, variables_in_one_gate);
}
template class StaticAnalyzer_<bb::fr, bb::UltraCircuitBuilder>;
template class StaticAnalyzer_<bb::fr, bb::MegaCircuitBuilder>;

} // namespace cdg
