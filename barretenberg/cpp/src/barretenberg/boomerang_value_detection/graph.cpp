#include "./graph.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <algorithm>
#include <stack>

using namespace bb::plookup;
using namespace bb;

/**
 * @brief this method removes duplicate variables from a gate,
 * converts variables from a gate to real variables, and then
 * updates variable gates count for real variable indexes
 */

template <typename FF>
inline void Graph_<FF>::process_gate_variables(UltraCircuitBuilder& ultra_circuit_builder,
                                               std::vector<uint32_t>& gate_variables)
{
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    if (gate_variables.empty()) {
        return;
    }
    for (size_t i = 0; i < gate_variables.size(); i++) {
        gate_variables[i] = this->to_real(ultra_circuit_builder, gate_variables[i]);
    }
    for (const auto& variable_index : gate_variables) {
        variables_gate_counts[variable_index] += 1;
    }
}

/**
 * @brief this method implements connected components from arithmetic gates
 * @tparam FF
 * @param ultra_circuit_builder
 * @param index
 * @return std::vector<uint32_t>
 */

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_arithmetic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto& arithmetic_block = ultra_circuit_builder.blocks.arithmetic;
    uint32_t left_idx = arithmetic_block.w_l()[index];
    uint32_t right_idx = arithmetic_block.w_r()[index];
    uint32_t out_idx = arithmetic_block.w_o()[index];
    uint32_t fourth_idx = arithmetic_block.w_4()[index];
    auto q_m = arithmetic_block.q_m()[index];
    auto q_1 = arithmetic_block.q_1()[index];
    auto q_2 = arithmetic_block.q_2()[index];
    auto q_3 = arithmetic_block.q_3()[index];
    auto q_4 = arithmetic_block.q_4()[index];
    std::vector<uint32_t> gate_variables = {};
    if (q_m != 0 || q_1 != 1 || q_2 != 0 || q_3 != 0 || q_4 != 0) {
        // this is not the gate for fix_witness, so we have to process this gate
        if (arithmetic_block.q_arith()[index] > 0) {
            if (q_m != 0) {
                gate_variables.emplace_back(left_idx);
                gate_variables.emplace_back(right_idx);
            }
            if (q_1 != 0) {
                gate_variables.emplace_back(left_idx);
            }
            if (q_2 != 0) {
                gate_variables.emplace_back(right_idx);
            }
            if (q_3 != 0) {
                gate_variables.emplace_back(out_idx);
            }
            if (q_4 != 0) {
                gate_variables.emplace_back(fourth_idx);
            }
            if (arithmetic_block.q_arith()[index] == 2) {
                // We have to use w_4_shift from the next gate
                // if and only if the current gate isn't last, cause we can't
                // look into the next gate
                if (index != arithmetic_block.size() - 1) {
                    uint32_t fourth_shift_idx = arithmetic_block.w_4()[index + 1];
                    gate_variables.emplace_back(fourth_shift_idx);
                }
            }
            if (arithmetic_block.q_arith()[index] == 3) {
                // TODO(daniel): want to process this case later
            }
        }
    }
    this->process_gate_variables(ultra_circuit_builder, gate_variables);
    return gate_variables;
}

/**
 * @brief this method creates connected components from elliptic gates
 * @tparam FF
 * @param ultra_circuit_builder
 * @param index
 * @return std::vector<uint32_t>
 */

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_elliptic_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto& elliptic_block = ultra_circuit_builder.blocks.elliptic;
    std::vector<uint32_t> gate_variables = {};
    bool is_elliptic_gate = elliptic_block.q_elliptic()[index] == 1;
    bool is_elliptic_add_gate = elliptic_block.q_1()[index] != 0 && elliptic_block.q_m()[index] == 0;
    bool is_elliptic_dbl_gate = elliptic_block.q_1()[index] == 0 && elliptic_block.q_m()[index] == 1;
    if (is_elliptic_gate) {
        auto right_idx = elliptic_block.w_r()[index];
        auto out_idx = elliptic_block.w_o()[index];
        gate_variables.emplace_back(right_idx);
        gate_variables.emplace_back(out_idx);
        if (index != elliptic_block.size() - 1) {
            if (is_elliptic_add_gate) {
                // if this gate is ecc_add_gate, we have to get indices x2, x3, y3, y2 from the next gate
                gate_variables.emplace_back(elliptic_block.w_l()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_r()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_o()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_4()[index + 1]);
            }
            if (is_elliptic_dbl_gate) {
                // if this gate is ecc_dbl_gate, we have to indices x3, y3 from right and output wires
                gate_variables.emplace_back(elliptic_block.w_r()[index + 1]);
                gate_variables.emplace_back(elliptic_block.w_o()[index + 1]);
            }
        }
    }
    this->process_gate_variables(ultra_circuit_builder, gate_variables);
    return gate_variables;
}

/**
 * @brief this method creates connected components from sorted constraints
 *
 * @tparam FF
 * @param ultra_circuit_builder
 * @param index
 * @return std::vector<uint32_t>
 */

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_sort_constraint_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    auto& delta_range_block = ultra_circuit_builder.blocks.delta_range;
    std::vector<uint32_t> gate_variables = {};
    if (delta_range_block.q_delta_range()[index] == 1) {
        auto left_idx = delta_range_block.w_l()[index];
        auto right_idx = delta_range_block.w_r()[index];
        auto out_idx = delta_range_block.w_o()[index];
        auto fourth_idx = delta_range_block.w_4()[index];
        gate_variables.insert(gate_variables.end(), { left_idx, right_idx, out_idx, fourth_idx });
    }
    this->process_gate_variables(ultra_circuit_builder, gate_variables);
    return gate_variables;
}

/**
 * @brief this method creates connected components from plookup gates
 *
 * @tparam FF
 * @param ultra_circuit_builder
 * @param index
 * @return std::vector<uint32_t>
 */

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_plookup_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index)
{
    std::vector<uint32_t> gate_variables;
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    auto q_2 = lookup_block.q_2()[index];
    auto q_m = lookup_block.q_m()[index];
    auto q_c = lookup_block.q_c()[index];
    auto left_idx = lookup_block.w_l()[index];
    auto right_idx = lookup_block.w_r()[index];
    auto out_idx = lookup_block.w_o()[index];
    gate_variables.emplace_back(left_idx);
    gate_variables.emplace_back(right_idx);
    gate_variables.emplace_back(out_idx);
    if (index < lookup_block.size() - 1) {
        if (q_2 != 0 || q_m != 0 || q_c != 0) {
            if (q_2 != 0) {
                gate_variables.emplace_back(lookup_block.w_l()[index + 1]);
            }
            if (q_m != 0) {
                gate_variables.emplace_back(lookup_block.w_r()[index + 1]);
            }
            if (q_c != 0) {
                gate_variables.emplace_back(lookup_block.w_o()[index + 1]);
            }
        }
    }
    this->process_gate_variables(ultra_circuit_builder, gate_variables);
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_poseido2s_gate_connected_component(
    bb::UltraCircuitBuilder& ultra_circuit_builder, size_t index, bool is_internal_block)
{
    std::vector<uint32_t> gate_variables;
    auto& block = ultra_circuit_builder.blocks.poseidon2_internal;
    auto& selector = block.q_poseidon2_internal()[index];
    if (!is_internal_block) {
        block = ultra_circuit_builder.blocks.poseidon2_external;
        selector = block.q_poseidon2_external()[index];
    }
    if (selector == 1) {
        gate_variables.insert(gate_variables.end(),
                              { block.w_l()[index], block.w_r()[index], block.w_o()[index], block.w_4()[index] });
        if (index != block.size() - 1) {
            gate_variables.insert(
                gate_variables.end(),
                { block.w_l()[index + 1], block.w_r()[index + 1], block.w_o()[index + 1], block.w_4()[index + 1] });
        }
    }
    this->process_gate_variables(ultra_circuit_builder, gate_variables);
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_auxiliary_gate_connected_component(bb::UltraCircuitBuilder& ultra_builder,
                                                                                size_t index)
{
    std::vector<uint32_t> gate_variables;
    auto& block = ultra_builder.blocks.aux;
    if (block.q_aux()[index] == 1) {
        auto q_1 = block.q_1()[index];
        auto q_2 = block.q_2()[index];
        auto q_3 = block.q_3()[index];
        auto q_4 = block.q_4()[index];
        auto q_m = block.q_m()[index];
        auto q_arith = block.q_arith()[index];
        auto q_c = block.q_c()[index];

        if (q_3 == 1 && q_4 == 1) {
            // bigfield limb accumulation 1
            ASSERT(q_arith == 0);
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { block.w_l()[index],
                                        block.w_r()[index],
                                        block.w_o()[index],
                                        block.w_4()[index],
                                        block.w_l()[index],
                                        block.w_l()[index + 1],
                                        block.w_r()[index + 1] });
            }
        }
        if (q_3 == 1 && q_m == 1) {
            ASSERT(q_arith == 0);
            // bigfield limb accumulation 2
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
        if (q_2 == 1 && (q_3 == 1 || q_4 == 1 || q_m == 1)) {
            ASSERT(q_arith == 0);
            // bigfield product cases
            if (index < block.size() - 1) {
                std::vector<uint32_t> limb_subproduct_vars = {
                    block.w_l()[index], block.w_r()[index], block.w_l()[index + 1], block.w_r()[index + 1]
                };
                if (q_3 == 1) {
                    // bigfield product 1
                    ASSERT(q_4 == 0 && q_m == 0);
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(), { block.w_o()[index], block.w_4()[index] });
                }
                if (q_4 == 1) {
                    // bigfield product 2
                    ASSERT(q_3 == 0 && q_m == 0 && q_arith == 0);
                    std::vector<uint32_t> non_native_field_gate_2 = { block.w_l()[index],
                                                                      block.w_4()[index],
                                                                      block.w_r()[index],
                                                                      block.w_o()[index],
                                                                      block.w_o()[index + 1] };
                    gate_variables.insert(
                        gate_variables.end(), non_native_field_gate_2.begin(), non_native_field_gate_2.end());
                    gate_variables.emplace_back(block.w_4()[index + 1]);
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                }
                if (q_m == 1) {
                    // bigfield product 3
                    ASSERT(q_4 == 0 && q_3 == 0);
                    gate_variables.insert(
                        gate_variables.end(), limb_subproduct_vars.begin(), limb_subproduct_vars.end());
                    gate_variables.insert(gate_variables.end(),
                                          { block.w_4()[index], block.w_o()[index + 1], block.w_4()[index + 1] });
                }
            }
        }
        if (q_1 == 1 && q_m == 1) {
            ASSERT(q_arith == 0);
            // ram/rom access gate
            // no we use special function for processing rom tables
            // may be I will remove this case in the future btw
            if (q_c != 0) {
                gate_variables.insert(
                    gate_variables.end(),
                    { block.w_l()[index], block.w_r()[index], block.w_o()[index], block.w_4()[index] });
            }
        }
        if (q_1 == 1 && q_4 == 1) {
            ASSERT(q_arith == 0);
            // ram timestamp check
            if (index < block.size() - 1) {
                gate_variables.insert(gate_variables.end(),
                                      { block.w_r()[index + 1],
                                        block.w_r()[index],
                                        block.w_l()[index],
                                        block.w_l()[index + 1],
                                        block.w_o()[index] });
            }
        }
        if (q_1 == 1 && q_2 == 1) {
            ASSERT(q_arith == 0);
            // rom constitency check
            if (index < block.size() - 1) {
                gate_variables.insert(
                    gate_variables.end(),
                    { block.w_l()[index], block.w_l()[index + 1], block.w_4()[index], block.w_4()[index + 1] });
            }
        }
        if (q_arith == 1) {
            // ram constitency check
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
    this->process_gate_variables(ultra_builder, gate_variables);
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_rom_table_connected_component(
    bb::UltraCircuitBuilder& ultra_builder, const UltraCircuitBuilder::RomTranscript& rom_array)
{
    std::vector<uint32_t> gate_variables;
    for (const auto& elem : rom_array.state) {
        gate_variables.emplace_back(elem[0]);
        if (elem[1] != ultra_builder.zero_idx) {
            gate_variables.emplace_back(elem[1]);
        }
    }
    for (const auto& record : rom_array.records) {
        gate_variables.insert(gate_variables.end(),
                              { record.index_witness,
                                record.value_column1_witness,
                                record.value_column2_witness,
                                record.record_witness });
        size_t gate_index = record.gate_index;
        variables_gates[ultra_builder.real_variable_index[record.index_witness]].emplace_back(gate_index);
        variables_gates[ultra_builder.real_variable_index[record.value_column1_witness]].emplace_back(gate_index);
        variables_gates[ultra_builder.real_variable_index[record.value_column2_witness]].emplace_back(gate_index);
        auto q_1 = ultra_builder.blocks.aux.q_1()[gate_index];
        auto q_2 = ultra_builder.blocks.aux.q_2()[gate_index];
        auto q_3 = ultra_builder.blocks.aux.q_3()[gate_index];
        auto q_4 = ultra_builder.blocks.aux.q_4()[gate_index];
        auto q_m = ultra_builder.blocks.aux.q_m()[gate_index];
        auto q_arith = ultra_builder.blocks.aux.q_arith()[gate_index];
        auto q_c = ultra_builder.blocks.aux.q_c()[gate_index];
        ASSERT(q_1 == 1 && q_m == 1 && q_2 == 0 && q_3 == 0 && q_4 == 0 && q_c == 0 && q_arith == 0);
    }
    this->process_gate_variables(ultra_builder, gate_variables);
    return gate_variables;
}

template <typename FF>
inline std::vector<uint32_t> Graph_<FF>::get_ram_table_connected_component(
    bb::UltraCircuitBuilder& ultra_builder, const UltraCircuitBuilder::RamTranscript& ram_array)
{
    std::vector<uint32_t> gate_variables;
    for (const auto& record : ram_array.records) {
        gate_variables.insert(
            gate_variables.end(),
            { record.index_witness, record.timestamp_witness, record.value_witness, record.record_witness });
        size_t gate_index = record.gate_index;
        variables_gates[ultra_builder.real_variable_index[record.index_witness]].emplace_back(gate_index);
        variables_gates[ultra_builder.real_variable_index[record.timestamp_witness]].emplace_back(gate_index);
        variables_gates[ultra_builder.real_variable_index[record.value_witness]].emplace_back(gate_index);
        auto q_1 = ultra_builder.blocks.aux.q_1()[gate_index];
        auto q_2 = ultra_builder.blocks.aux.q_2()[gate_index];
        auto q_3 = ultra_builder.blocks.aux.q_3()[gate_index];
        auto q_4 = ultra_builder.blocks.aux.q_4()[gate_index];
        auto q_m = ultra_builder.blocks.aux.q_m()[gate_index];
        auto q_arith = ultra_builder.blocks.aux.q_arith()[gate_index];
        auto q_c = ultra_builder.blocks.aux.q_c()[gate_index];
        ASSERT(q_1 == 1 && q_m == 1 && q_2 == 0 && q_3 == 0 && q_4 == 0 && q_arith == 0 && (q_c == 0 || q_c == 1));
    }
    this->process_gate_variables(ultra_builder, gate_variables);
    return gate_variables;
}

/**
 * @brief Construct a new Graph from Ultra Circuit Builder
 * @tparam FF
 * @param ultra_circuit_constructor
 */

template <typename FF> Graph_<FF>::Graph_(bb::UltraCircuitBuilder& ultra_circuit_constructor)
{
    this->variables_gate_counts =
        std::unordered_map<uint32_t, size_t>(ultra_circuit_constructor.real_variable_index.size());
    this->variables_gates =
        std::unordered_map<uint32_t, std::vector<size_t>>(ultra_circuit_constructor.real_variable_index.size());
    this->variable_adjacency_lists =
        std::unordered_map<uint32_t, std::vector<uint32_t>>(ultra_circuit_constructor.real_variable_index.size());
    this->variables_degree = std::unordered_map<uint32_t, size_t>(ultra_circuit_constructor.real_variable_index.size());
    for (const auto& variable_index : ultra_circuit_constructor.real_variable_index) {
        variables_gate_counts[variable_index] = 0;
        variables_degree[variable_index] = 0;
        variable_adjacency_lists[variable_index] = {};
    }

    std::map<FF, uint32_t> constant_variable_indices = ultra_circuit_constructor.constant_variable_indices;
    const auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto arithmetic_gates_numbers = arithmetic_block.size();
    bool arithmetic_gates_exists = arithmetic_gates_numbers > 0;
    if (arithmetic_gates_exists) {
        for (size_t i = 0; i < arithmetic_gates_numbers; i++) {
            auto gate_variables = this->get_arithmetic_gate_connected_component(ultra_circuit_constructor, i);
            this->connect_all_variables_in_vector(ultra_circuit_constructor, gate_variables, false);
        }
    }
    const auto& elliptic_block = ultra_circuit_constructor.blocks.elliptic;
    auto elliptic_gates_numbers = elliptic_block.size();
    bool elliptic_gates_exist = elliptic_gates_numbers > 0;
    if (elliptic_gates_exist) {
        for (size_t i = 0; i < elliptic_gates_numbers; i++) {
            std::vector<uint32_t> gate_variables =
                this->get_elliptic_gate_connected_component(ultra_circuit_constructor, i);
            this->connect_all_variables_in_vector(ultra_circuit_constructor, gate_variables, false);
        }
    }
    const auto& range_block = ultra_circuit_constructor.blocks.delta_range;
    auto range_gates = range_block.size();
    bool range_gates_exists = range_gates > 0;
    if (range_gates_exists) {
        std::vector<uint32_t> sorted_variables;
        for (size_t i = 0; i < range_gates; i++) {
            auto current_gate = this->get_sort_constraint_connected_component(ultra_circuit_constructor, i);
            if (current_gate.empty()) {
                this->connect_all_variables_in_vector(ultra_circuit_constructor, sorted_variables, true);
                sorted_variables.clear();
            } else {
                sorted_variables.insert(sorted_variables.end(), current_gate.begin(), current_gate.end());
            }
        }
    }

    const auto& lookup_block = ultra_circuit_constructor.blocks.lookup;
    auto lookup_gates = lookup_block.size();
    bool lookup_gates_exists = lookup_gates > 0;
    if (lookup_gates_exists) {
        for (size_t i = 0; i < lookup_gates; i++) {
            std::vector<uint32_t> variable_indices =
                this->get_plookup_gate_connected_component(ultra_circuit_constructor, i);
            this->connect_all_variables_in_vector(ultra_circuit_constructor, variable_indices, false);
        }
    }

    const auto& poseidon2_internal_block = ultra_circuit_constructor.blocks.poseidon2_internal;
    auto internal_gates = poseidon2_internal_block;
    if (internal_gates.size() > 0) {
        for (size_t i = 0; i < internal_gates.size(); i++) {
            std::vector<uint32_t> variable_indices =
                this->get_poseido2s_gate_connected_component(ultra_circuit_constructor, i);
            this->connect_all_variables_in_vector(
                ultra_circuit_constructor, variable_indices, /*is_sorted_variables=*/false);
        }
    }

    const auto& poseidon2_external_block = ultra_circuit_constructor.blocks.poseidon2_external;
    auto external_gates = poseidon2_external_block;
    if (external_gates.size() > 0) {
        for (size_t i = 0; i < external_gates.size(); i++) {
            std::vector<uint32_t> variable_indices =
                this->get_poseido2s_gate_connected_component(ultra_circuit_constructor, i, /*is_internal_block=*/false);
            this->connect_all_variables_in_vector(
                ultra_circuit_constructor, variable_indices, /*is_sorted_variables=*/false);
        }
    }
    const auto& aux_block = ultra_circuit_constructor.blocks.aux;
    if (aux_block.size() > 0) {
        for (size_t i = 0; i < aux_block.size(); i++) {
            std::vector<uint32_t> variable_indices =
                this->get_auxiliary_gate_connected_component(ultra_circuit_constructor, i);
            this->connect_all_variables_in_vector(
                ultra_circuit_constructor, variable_indices, /*is_sorted_variables=*/false);
        }
    }
    const auto& rom_arrays = ultra_circuit_constructor.rom_arrays;
    if (rom_arrays.size() > 0) {
        for (size_t i = 0; i < rom_arrays.size(); i++) {
            std::vector<uint32_t> variable_indices =
                this->get_rom_table_connected_component(ultra_circuit_constructor, rom_arrays[i]);
            this->connect_all_variables_in_vector(
                ultra_circuit_constructor, variable_indices, /*is_sorted_variables=*/false);
        }
    }
    const auto& ram_arrays = ultra_circuit_constructor.ram_arrays;
    if (ram_arrays.size() > 0) {
        for (size_t i = 0; i < ram_arrays.size(); i++) {
            std::vector<uint32_t> variable_indices =
                this->get_ram_table_connected_component(ultra_circuit_constructor, ram_arrays[i]);
            this->connect_all_variables_in_vector(
                ultra_circuit_constructor, variable_indices, /*is_sorted_variables=*/false);
        }
    }
}

/**
 * @brief this method checks whether the variable with given index is not constant
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variable_index
 * @return true
 * @return false
 */

template <typename FF>
bool Graph_<FF>::check_is_not_constant_variable(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                const uint32_t& variable_index)
{
    bool is_not_constant = true;
    auto constant_variable_indices = ultra_circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        if (pair.second == ultra_circuit_builder.real_variable_index[variable_index]) {
            is_not_constant = false;
            break;
        }
    }
    return is_not_constant;
}

/**
 * @brief this method adds connection between 2 variables, if they are in one gate, they are not constrant variables,
 * and they have different indexes
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_vector
 * @param is_sorted_variables
 */

template <typename FF>
void Graph_<FF>::connect_all_variables_in_vector(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                 const std::vector<uint32_t>& variables_vector,
                                                 bool is_sorted_variables)
{
    if (variables_vector.empty()) {
        return;
    }
    if (is_sorted_variables) {
        for (size_t i = 0; i < variables_vector.size() - 1; i++) {
            if (variables_vector[i] != ultra_circuit_builder.zero_idx &&
                variables_vector[i + 1] != ultra_circuit_builder.zero_idx &&
                variables_vector[i] != variables_vector[i + 1]) {
                {
                    bool first_variable_is_not_constant =
                        this->check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i]);
                    bool second_variable_is_not_constant =
                        this->check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i + 1]);
                    if (first_variable_is_not_constant && second_variable_is_not_constant) {
                        this->add_new_edge(variables_vector[i], variables_vector[i + 1]);
                    }
                }
            }
        }
    } else {
        for (size_t i = 0; i < variables_vector.size() - 1; i++) {
            for (size_t j = i + 1; j < variables_vector.size(); j++) {
                if (variables_vector[i] != ultra_circuit_builder.zero_idx &&
                    variables_vector[j] != ultra_circuit_builder.zero_idx &&
                    variables_vector[i] != variables_vector[j]) {

                    bool first_variable_is_not_constant =
                        this->check_is_not_constant_variable(ultra_circuit_builder, variables_vector[i]);
                    bool second_variable_is_not_constant =
                        this->check_is_not_constant_variable(ultra_circuit_builder, variables_vector[j]);
                    if (first_variable_is_not_constant && second_variable_is_not_constant) {
                        this->add_new_edge(variables_vector[i], variables_vector[j]);
                    }
                }
            }
        }
    }
}

/**
 * @brief this method creates an edge between two variables in graph. All needed checks in a function above
 * @tparam FF
 * @param first_variable_index
 * @param second_variable_index
 */

template <typename FF>
void Graph_<FF>::add_new_edge(const uint32_t& first_variable_index, const uint32_t& second_variable_index)
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

template <typename FF>
void Graph_<FF>::depth_first_search(const uint32_t& variable_index,
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
 * @return std::vector<std::vector<uint32_t>>
 */

template <typename FF> std::vector<std::vector<uint32_t>> Graph_<FF>::find_connected_components()
{
    std::unordered_set<uint32_t> is_used;
    std::vector<std::vector<uint32_t>> connected_components;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!is_used.contains(pair.first)) {
                std::vector<uint32_t> connected_component;
                this->depth_first_search(pair.first, is_used, connected_component);
                std::sort(connected_component.begin(), connected_component.end());
                connected_components.emplace_back(connected_component);
            }
        }
    }
    return connected_components;
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

template <typename FF>
inline size_t Graph_<FF>::process_current_decompose_chain(bb::UltraCircuitBuilder& ultra_circuit_constructor,
                                                          std::unordered_set<uint32_t>& variables_in_one_gate,
                                                          size_t index)
{
    auto& arithmetic_block = ultra_circuit_constructor.blocks.arithmetic;
    auto zero_idx = ultra_circuit_constructor.zero_idx;
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they are
        // useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(this->to_real(ultra_circuit_constructor, fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(ultra_circuit_constructor, out_idx));
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
            // the first variable in accumulators is the variable which decompose was created. So, we have to decrement
            // variable_gate_counts for this variable
            variables_gate_counts[accumulators_indices[i]] -= 1;
        } else {
            // next accumulators are useless variables that are not interested for the analyzer. So, for these variables
            // we can nullify variables_gate_counts
            variables_gate_counts[accumulators_indices[i]] = 0;
        }
    }
    // we don't want to make variables_gate_counts for intermediate variables negative, so, can go to the next gates
    return current_index;
}

/**
 * @brief this method gets the endpoints of the decompose chains. For that it has to clean variable_index
 from unnecessary variables for example, left, right, output wires and go through all decompose chain
 * @tparam FF
 * @param ultra_circuit_builder
 * @param variables_in_one_gate
 * @param decompose_variables
 */

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_decompose_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                               std::unordered_set<uint32_t>& variables_in_one_gate,
                                                               const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto find_position = [&](uint32_t variable_index) {
        return decompose_variables.contains(this->to_real(ultra_circuit_builder, variable_index));
    };
    auto& arithmetic_block = ultra_circuit_builder.blocks.arithmetic;
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
                    i = this->process_current_decompose_chain(ultra_circuit_builder, variables_in_one_gate, i);
                }
            }
        }
    }
}
/**
 * @brief this method removes false cases variables from aes plookup tables.
 * AES_SBOX_MAP, AES_SPARSE_MAP, AES_SPARSE_NORMALIZE tables are used in read_from_1_to_2_table function which
 * return values C2[0], so C3[0] isn't used anymore in these cases, but this situation isn't dangerous.
 * So, we have to remove these variables.
 * @tparam FF
 * @param variables_in_one_gate
 * @param ultra_circuit_builder
 * @param table_id
 * @param gate_index
 */
template <typename FF>
inline void Graph_<FF>::remove_unnecessary_aes_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                                 UltraCircuitBuilder& ultra_circuit_builder,
                                                                 BasicTableId& table_id,
                                                                 size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    std::unordered_set<BasicTableId> aes_plookup_tables{ BasicTableId::AES_SBOX_MAP,
                                                         BasicTableId::AES_SPARSE_MAP,
                                                         BasicTableId::AES_SPARSE_NORMALIZE };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    if (aes_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            bool find_out = find_position(real_out_idx);
            auto q_c = lookup_block.q_c()[gate_index];
            if (q_c == 0) {
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

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_sha256_plookup_variables(std::unordered_set<uint32_t>& variables_in_one_gate,
                                                                    UltraCircuitBuilder& ultra_circuit_builder,
                                                                    BasicTableId& table_id,
                                                                    size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
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
        uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
        uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            // auto q_m = lookup_block.q_m()[gate_index];
            auto q_c = lookup_block.q_c()[gate_index];
            bool find_out = find_position(real_out_idx);
            // bool find_right = find_position(real_right_idx);
            if (q_c == 0) {
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

template <typename FF>
inline void Graph_<FF>::process_current_plookup_gate(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                     std::unordered_set<uint32_t>& variables_in_one_gate,
                                                     size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    auto& lookup_tables = ultra_circuit_builder.lookup_tables;
    auto table_index = static_cast<size_t>(lookup_block.q_3()[gate_index]);
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId table_id = table.id;
            // false cases for AES
            this->remove_unnecessary_aes_plookup_variables(
                variables_in_one_gate, ultra_circuit_builder, table_id, gate_index);
            // false cases for sha256
            this->remove_unnecessary_sha256_plookup_variables(
                variables_in_one_gate, ultra_circuit_builder, table_id, gate_index);
            // if the amount of unique elements from columns of plookup tables = 1, it means that
            // variable from this column aren't used and we can remove it.
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = this->to_real(ultra_circuit_builder, left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t real_right_idx = this->to_real(ultra_circuit_builder, lookup_block.w_r()[gate_index]);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t real_out_idx = this->to_real(ultra_circuit_builder, lookup_block.w_o()[gate_index]);
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

template <typename FF>
inline void Graph_<FF>::remove_unnecessary_plookup_variables(bb::UltraCircuitBuilder& ultra_circuit_builder,
                                                             std::unordered_set<uint32_t>& variables_in_one_gate)
{
    auto& lookup_block = ultra_circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            this->process_current_plookup_gate(ultra_circuit_builder, variables_in_one_gate, i);
        }
    }
}

/**
 * @brief this method returns a final set of variables that were in one gate
 * @tparam FF
 * @param ultra_circuit_builder
 * @return std::unordered_set<uint32_t>
 */

template <typename FF>
std::unordered_set<uint32_t> Graph_<FF>::show_variables_in_one_gate(bb::UltraCircuitBuilder& ultra_circuit_builder)
{
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = this->check_is_not_constant_variable(ultra_circuit_builder, pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            this->variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = ultra_circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_varialbes;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = this->check_is_not_constant_variable(ultra_circuit_builder, elem);
            if (variables_gate_counts[ultra_circuit_builder.real_variable_index[elem]] == 1 &&
                is_not_constant_variable) {
                decompose_varialbes.insert(ultra_circuit_builder.real_variable_index[elem]);
            }
        }
    }
    this->remove_unnecessary_decompose_variables(
        ultra_circuit_builder, this->variables_in_one_gate, decompose_varialbes);
    this->remove_unnecessary_plookup_variables(ultra_circuit_builder, this->variables_in_one_gate);
    return variables_in_one_gate;
}

/**
 * @brief this method returns connected component with a given index and size of this component
 * sometimes for debugging we want to check the size one of the connected component, so it would be
 * useful to know its size
 * @param connected_components
 * @param index
 * @return std::pair<std::vector<uint32_t>, size_t>
 */

std::pair<std::vector<uint32_t>, size_t> get_connected_component_with_index(
    const std::vector<std::vector<uint32_t>>& connected_components, size_t index)
{
    auto connected_component = connected_components[index];
    auto size = connected_component.size();
    return std::make_pair(connected_component, size);
}

/**
 * @brief this method prints graph as vertices and their adjacency lists
 * example: we have an undirected graph from 3 variables: a, b, c.
 * we have edges: a - b, b - c, c - a.
 * so, there will be next adjacency lists:
 * a: b -> c -> 0\
 * b: a -> c -> 0\
 * c: a -> b -> 0\
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_graph()
{
    for (const auto& elem : variable_adjacency_lists) {
        info("variable with index", elem.first);
        if (variable_adjacency_lists[elem.first].empty()) {
            info("is isolated");
        } else {
            for (const auto& it : elem.second) {
                info(it);
            }
        }
    }
}

/**
 * @brief this method prints all connected components that were found in the graph
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_connected_components()
{
    auto connected_components = find_connected_components();
    for (size_t i = 0; i < connected_components.size(); i++) {
        info("printing the ", i + 1, " connected component:");
        for (const auto& it : connected_components[i]) {
            info(it, " ");
        }
    }
}

/**
 * @brief this method prints a number of gates for each variable.
 * while processing the arithmetic circuit, we count for each variable the number of gates it has participated in.
 * sometimes for debugging purposes it is useful to see how many gates each variable has participated in.
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
    }
}

/**
 * @brief this method prints a number of edges for each variable.
 * while processing the arithmetic circuit, we conut for each variable the number of edges, i.e. connections with other
 * variables though the gates. perhaps in the future counting the number of edges for each vertex can be useful for
 * analysis, and this function will be used for debugging.
 * @tparam FF
 */

template <typename FF> void Graph_<FF>::print_variables_edge_counts()
{
    for (const auto& it : variables_degree) {
        if (it.first != 0) {
            info("variable index = ", it.first, "number of edges for this variable = ", it.second);
        }
    }
}

template <typename FF> void Graph_<FF>::print_variables_in_one_gate()
{
    for (const auto& elem : variables_in_one_gate) {
        ASSERT(variables_gates[elem].size() <= 1);
        if (variables_gates[elem].size() == 1) {
            info("for variable with index ", elem, " gate index == ", variables_gates[elem][0]);
        } else {
            info("variable's gate with index ", elem, " hasn't processed yet");
        }
    }
}

template class Graph_<bb::fr>;